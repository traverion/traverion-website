/**
 * Stay Request-to-Book: accept (capture), decline, or guest withdraw.
 * Supplier/team editors may accept or decline. Guest may withdraw.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { isStripeTestSecretKey, stripeLiveSecretBlockedMessage } from '../_shared/stripe-test-only.ts';
import { authUserVerifiedEmail } from '../_shared/auth-verified-email.ts';
import { travelerOwnsCheckoutBooking } from '../_shared/booking-traveler-ownership.ts';
import { serviceRoleEdgeInvokeHeaders, notifyPaidBookingSideEffects } from '../_shared/promote-paid-from-checkout.ts';

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
        'id, status, payment_status, approval_status, approval_expires_at, hold_expires_at, payment_intent_id, total_amount, currency, listing_id, guest_user_id, guest_email, guest_name, booking_date, check_out, guests, booking_number'
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

      // Capture first only after DB claim would race — claim via RPC (assert + accept + paid).
      // Stripe capture before DB: if DB fails we have money without booking — bad.
      // DB accept before capture: if capture fails we have accepted without money — also bad.
      // Order: verify PI requires_capture → RPC capture_stay (asserts + marks paid) → Stripe capture.
      // If Stripe capture fails after DB paid: mark payment_status failed + notify (reconcile).

      const pi = await stripe.paymentIntents.retrieve(piId);
      if (String(pi.status).toLowerCase() === 'succeeded') {
        // Already captured (idempotent retry) — ensure DB paid.
        const { data: cap } = await admin.rpc('capture_stay_booking_request', {
          p_booking_id: bookingId,
          p_actor_id: user.id,
          p_amount_paid: amountPaid,
          p_currency: currency,
          p_paid_at: new Date().toISOString(),
        });
        if (cap && typeof cap === 'object' && (cap as { ok?: boolean }).ok === true) {
          await notifyPaidBookingSideEffects({
            admin,
            supabaseUrl,
            serviceRoleKey,
            bookingId,
            amountPaid,
            currency,
          });
        }
        return json({ success: true, alreadyCaptured: true, bookingId });
      }
      if (String(pi.status).toLowerCase() !== 'requires_capture') {
        return json(
          {
            success: false,
            error: `Authorization is not capturable (status: ${pi.status})`,
          },
          409
        );
      }

      const { data: claim, error: claimErr } = await admin.rpc('capture_stay_booking_request', {
        p_booking_id: bookingId,
        p_actor_id: user.id,
        p_amount_paid: amountPaid,
        p_currency: currency,
        p_paid_at: new Date().toISOString(),
      });
      if (claimErr) return json({ success: false, error: claimErr.message }, 500);
      const claimObj = claim as { ok?: boolean; reason?: string } | null;
      if (!claimObj?.ok) {
        const reason = String(claimObj?.reason ?? 'not_acceptable');
        const status =
          reason === 'forbidden' ? 403 : reason === 'expired' ? 409 : reason === 'not_found' ? 404 : 409;
        return json({ success: false, error: reason, reason }, status);
      }

      try {
        await stripe.paymentIntents.capture(piId, undefined, {
          idempotencyKey: `stay-request-capture:${bookingId}`,
        });
      } catch (capErr) {
        const msg = capErr instanceof Error ? capErr.message : String(capErr);
        // Roll back paid → authorized pending so host can retry or expire can release.
        await admin
          .from('bookings')
          .update({
            status: 'pending',
            payment_status: 'authorized',
            approval_status: 'pending',
            amount_paid: null,
            paid_at: null,
            approval_decided_at: null,
            approval_decided_by: null,
          })
          .eq('id', bookingId)
          .eq('payment_status', 'paid')
          .eq('approval_status', 'accepted');
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

      await admin.from('booking_payment_events').insert({
        booking_id: bookingId,
        event_type: 'stay_request_captured',
        payment_intent_id: piId,
        amount: amountPaid,
        currency,
        payload: { actor_id: user.id },
      });

      await notifyPaidBookingSideEffects({
        admin,
        supabaseUrl,
        serviceRoleKey,
        bookingId,
        amountPaid,
        currency,
      });

      return json({ success: true, accepted: true, bookingId });
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

    // Notify customer (and supplier on withdraw).
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
