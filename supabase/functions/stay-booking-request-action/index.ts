/**
 * Stay Request-to-Book: accept (claim → Stripe capture → finalize paid), decline, or withdraw.
 * Paid/confirmed only after Stripe capture is verified. Webhook recovers capture-then-crash.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { isStripeTestSecretKey, stripeLiveSecretBlockedMessage } from '../_shared/stripe-test-only.ts';
import { authUserVerifiedEmail } from '../_shared/auth-verified-email.ts';
import { travelerOwnsCheckoutBooking } from '../_shared/booking-traveler-ownership.ts';
import { serviceRoleEdgeInvokeHeaders, notifyPaidBookingSideEffects } from '../_shared/promote-paid-from-checkout.ts';
import { planStayRequestAcceptCapture } from '../_shared/stay-request-approval.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

type Action = 'accept' | 'decline' | 'withdraw';

async function finalizePaidAfterVerifiedCapture(params: {
  admin: ReturnType<typeof createClient>;
  supabaseUrl: string;
  serviceRoleKey: string;
  bookingId: string;
  actorId: string | null;
  amountPaid: number;
  currency: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const { admin, bookingId, actorId, amountPaid, currency, supabaseUrl, serviceRoleKey } = params;
  const { data: fin, error: finErr } = await admin.rpc('capture_stay_booking_request', {
    p_booking_id: bookingId,
    p_actor_id: actorId,
    p_amount_paid: amountPaid,
    p_currency: currency,
    p_paid_at: new Date().toISOString(),
  });
  if (finErr) return { ok: false, reason: finErr.message };
  const finObj = fin as { ok?: boolean; reason?: string } | null;
  if (!finObj?.ok) return { ok: false, reason: String(finObj?.reason ?? 'finalize_failed') };

  // Earnings + paid emails only after verified paid row (idempotent on retry).
  const { error: earnErr } = await admin.rpc('record_paid_booking_earnings', {
    p_booking_id: bookingId,
  });
  if (earnErr) return { ok: false, reason: earnErr.message };

  await notifyPaidBookingSideEffects({
    admin,
    supabaseUrl,
    serviceRoleKey,
    bookingId,
    amountPaid,
    currency,
  });
  return { ok: true, reason: finObj.reason };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return json({ success: false, error: 'Supabase env missing' }, 500);
    }
    if (!stripeSecret) return json({ success: false, error: 'STRIPE_SECRET_KEY not configured' }, 500);
    if (!isStripeTestSecretKey(stripeSecret)) {
      return json({ success: false, error: stripeLiveSecretBlockedMessage() }, 503);
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ success: false, error: 'Missing Authorization header' }, 401);

    const authedClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await authedClient.auth.getUser();
    if (authError || !authData?.user) {
      return json({ success: false, error: 'Unauthorized' }, 401);
    }
    const user = authData.user;
    const verifiedEmail = authUserVerifiedEmail(user) ?? '';

    const body = (await req.json()) as { bookingId?: string; action?: string };
    const bookingId = String(body.bookingId ?? '').trim();
    const action = String(body.action ?? '').trim().toLowerCase() as Action;
    if (!bookingId) return json({ success: false, error: 'bookingId is required' }, 400);
    if (action !== 'accept' && action !== 'decline' && action !== 'withdraw') {
      return json({ success: false, error: 'action must be accept, decline, or withdraw' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const stripe = new Stripe(stripeSecret);

    const { data: booking, error: bookingErr } = await admin
      .from('bookings')
      .select(
        'id, status, payment_status, approval_status, approval_expires_at, hold_expires_at, payment_intent_id, total_amount, currency, listing_id, guest_user_id, guest_email, guest_name, booking_date, check_out, guests, booking_number, approval_decided_by'
      )
      .eq('id', bookingId)
      .maybeSingle();
    if (bookingErr) return json({ success: false, error: bookingErr.message }, 500);
    if (!booking) return json({ success: false, error: 'Booking not found' }, 404);

    if (action === 'accept') {
      const amountPaid =
        typeof booking.total_amount === 'number' && Number.isFinite(booking.total_amount)
          ? booking.total_amount
          : null;
      if (amountPaid == null || amountPaid < 0) {
        return json({ success: false, error: 'Booking amount is missing' }, 400);
      }
      const currency = String(booking.currency || 'EUR').toUpperCase();
      const piId = String(booking.payment_intent_id ?? '').trim();
      if (!piId) return json({ success: false, error: 'Payment authorization missing' }, 409);

      const expired =
        booking.approval_expires_at != null &&
        Number.isFinite(Date.parse(String(booking.approval_expires_at))) &&
        Date.parse(String(booking.approval_expires_at)) <= Date.now();

      const pi = await stripe.paymentIntents.retrieve(piId);
      const plan = planStayRequestAcceptCapture({
        paymentStatus: booking.payment_status,
        approvalStatus: booking.approval_status,
        status: booking.status,
        piStatus: pi.status,
        expired,
      });

      if (plan.kind === 'reject') {
        const status = plan.reason === 'expired' ? 409 : 409;
        return json({ success: false, error: plan.reason, reason: plan.reason }, status);
      }

      // 1) Claim accept while still authorized (or skip if already claimed / paid).
      if (plan.kind === 'claim_then_capture_then_finalize') {
        const { data: claim, error: claimErr } = await admin.rpc('claim_stay_booking_request_accept', {
          p_booking_id: bookingId,
          p_actor_id: user.id,
        });
        if (claimErr) return json({ success: false, error: claimErr.message }, 500);
        const claimObj = claim as { ok?: boolean; reason?: string } | null;
        if (!claimObj?.ok) {
          const reason = String(claimObj?.reason ?? 'not_acceptable');
          const status =
            reason === 'forbidden' ? 403 : reason === 'expired' ? 409 : reason === 'not_found' ? 404 : 409;
          return json({ success: false, error: reason, reason }, status);
        }
      } else if (
        plan.kind === 'capture_then_finalize' ||
        (plan.kind === 'finalize_only' &&
          String(booking.payment_status).toLowerCase() === 'authorized' &&
          String(booking.approval_status).toLowerCase() === 'pending')
      ) {
        // Race: PI already succeeded before claim — still claim if pending so finalize can run.
        if (String(booking.approval_status).toLowerCase() === 'pending') {
          const { data: claim, error: claimErr } = await admin.rpc('claim_stay_booking_request_accept', {
            p_booking_id: bookingId,
            p_actor_id: user.id,
          });
          if (claimErr) return json({ success: false, error: claimErr.message }, 500);
          const claimObj = claim as { ok?: boolean; reason?: string } | null;
          if (!claimObj?.ok && String(claimObj?.reason) !== 'already_claimed') {
            const reason = String(claimObj?.reason ?? 'not_acceptable');
            return json({ success: false, error: reason, reason }, 409);
          }
        }
      }

      // 2) Capture only when PI still requires_capture (idempotent key).
      if (String(pi.status).toLowerCase() === 'requires_capture') {
        try {
          await stripe.paymentIntents.capture(piId, undefined, {
            idempotencyKey: `stay-request-capture:${bookingId}`,
          });
        } catch (capErr) {
          const msg = capErr instanceof Error ? capErr.message : String(capErr);
          // Re-check: concurrent capture may have succeeded.
          const again = await stripe.paymentIntents.retrieve(piId);
          if (String(again.status).toLowerCase() !== 'succeeded') {
            await admin.rpc('revert_stay_booking_request_accept', { p_booking_id: bookingId });
            await admin.from('booking_payment_events').insert({
              booking_id: bookingId,
              event_type: 'stay_request_capture_failed',
              payment_intent_id: piId,
              amount: amountPaid,
              currency,
              payload: { error: msg.slice(0, 400) },
            });
            return json({ success: false, error: 'Payment capture failed. Try again.' }, 502);
          }
        }
      } else if (String(pi.status).toLowerCase() !== 'succeeded') {
        await admin.rpc('revert_stay_booking_request_accept', { p_booking_id: bookingId });
        return json(
          { success: false, error: `Authorization is not capturable (status: ${pi.status})` },
          409
        );
      }

      // 3) Verify capture before marking paid.
      const verified = await stripe.paymentIntents.retrieve(piId);
      if (String(verified.status).toLowerCase() !== 'succeeded') {
        await admin.rpc('revert_stay_booking_request_accept', { p_booking_id: bookingId });
        await admin.from('booking_payment_events').insert({
          booking_id: bookingId,
          event_type: 'stay_request_capture_unverified',
          payment_intent_id: piId,
          amount: amountPaid,
          currency,
          payload: { status: verified.status },
        });
        return json({ success: false, error: 'Payment capture could not be verified. Try again.' }, 502);
      }

      const fin = await finalizePaidAfterVerifiedCapture({
        admin,
        supabaseUrl,
        serviceRoleKey,
        bookingId,
        actorId: user.id,
        amountPaid,
        currency,
      });
      if (!fin.ok) {
        // Money captured but DB finalize failed — leave accepted+authorized for webhook/retry.
        await admin.from('booking_payment_events').insert({
          booking_id: bookingId,
          event_type: 'stay_request_finalize_failed',
          payment_intent_id: piId,
          amount: amountPaid,
          currency,
          payload: { error: (fin.reason ?? '').slice(0, 400), pi_status: 'succeeded' },
        });
        return json(
          {
            success: false,
            error: 'Payment was captured but confirmation is still processing. Refresh shortly.',
            capturedPendingFinalize: true,
            reason: fin.reason,
          },
          502
        );
      }

      await admin.from('booking_payment_events').insert({
        booking_id: bookingId,
        event_type: 'stay_request_captured',
        payment_intent_id: piId,
        amount: amountPaid,
        currency,
        payload: { actor_id: user.id, plan: plan.kind },
      });

      return json({
        success: true,
        accepted: true,
        alreadyCaptured: plan.kind === 'finalize_only',
        bookingId,
      });
    }

    // decline | withdraw
    const releaseAction = action === 'decline' ? 'decline' : 'withdraw';
    if (action === 'withdraw') {
      const owns = travelerOwnsCheckoutBooking({
        authUserId: user.id,
        verifiedEmail,
        guestUserId: typeof booking.guest_user_id === 'string' ? booking.guest_user_id : null,
        guestEmail: typeof booking.guest_email === 'string' ? booking.guest_email : null,
      });
      if (!owns) return json({ success: false, error: 'Forbidden' }, 403);
    }

    const { data: released, error: releaseErr } = await admin.rpc('release_stay_booking_request', {
      p_booking_id: bookingId,
      p_actor_id: user.id,
      p_action: releaseAction,
      p_allow_guest: action === 'withdraw',
    });
    if (releaseErr) return json({ success: false, error: releaseErr.message }, 500);
    const rel = released as { ok?: boolean; reason?: string; payment_intent_id?: string | null } | null;
    if (!rel?.ok) {
      const reason = String(rel?.reason ?? 'not_releasable');
      const status = reason === 'forbidden' ? 403 : reason === 'not_found' ? 404 : 409;
      return json({ success: false, error: reason, reason }, status);
    }

    const piId = String(rel.payment_intent_id ?? booking.payment_intent_id ?? '').trim();
    if (piId) {
      try {
        await stripe.paymentIntents.cancel(piId, undefined, {
          idempotencyKey: `stay-request-cancel:${bookingId}:${releaseAction}`,
        });
      } catch (cancelErr) {
        const msg = cancelErr instanceof Error ? cancelErr.message : String(cancelErr);
        if (!/already.?cancel|cannot.?cancel|canceled/i.test(msg)) {
          console.error(JSON.stringify({ source: 'stay-booking-request-action', error: msg }));
        }
      }
    }

    await admin.from('booking_payment_events').insert({
      booking_id: bookingId,
      event_type: `stay_request_${releaseAction}`,
      payment_intent_id: piId || null,
      payload: { actor_id: user.id },
    });

    const headers = serviceRoleEdgeInvokeHeaders(serviceRoleKey);
    const { data: listing } = await admin
      .from('listings')
      .select('supplier_id, title, listing_extras')
      .eq('id', booking.listing_id)
      .maybeSingle();
    const portalBase = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://www.traverion.com').replace(/\/$/, '');
    let guestEmail = String(booking.guest_email ?? '').trim().toLowerCase();
    if (!guestEmail && booking.guest_user_id) {
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(String(booking.guest_user_id));
        guestEmail = (authUser?.user?.email ?? '').trim().toLowerCase();
      } catch {
        /* ignore */
      }
    }
    if (guestEmail) {
      const statusLabel =
        releaseAction === 'decline' ? 'Host declined' : 'You withdrew the request';
      try {
        await fetch(`${supabaseUrl}/functions/v1/notify-customer-booking`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            emailKind: 'booking_cancelled',
            bookingId,
            to: guestEmail,
            listingTitle: listing?.title ?? undefined,
            unpaidCheckout: true,
            idempotencyKey: `customer:stay_request_${releaseAction}:${bookingId}`,
            fieldDiffs: [
              { field: 'Request status', before: 'Pending host approval', after: statusLabel },
              { field: 'Payment', before: 'Authorized', after: 'Authorization released' },
            ],
          }),
        });
      } catch {
        /* best-effort */
      }
    }
    if (listing?.supplier_id && releaseAction === 'withdraw') {
      try {
        await fetch(`${supabaseUrl}/functions/v1/notify-supplier-event`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            supplierId: listing.supplier_id,
            eventType: 'booking_cancelled',
            listingId: booking.listing_id,
            listingTitle: listing.title ?? undefined,
            bookingId,
            unpaidCheckout: true,
            portalBaseUrl: portalBase,
            idempotencyKey: `supplier:stay_request_withdraw:${bookingId}`,
          }),
        });
      } catch {
        /* best-effort */
      }
    }

    return json({ success: true, [releaseAction]: true, bookingId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Request action failed';
    return json({ success: false, error: msg }, 500);
  }
});
