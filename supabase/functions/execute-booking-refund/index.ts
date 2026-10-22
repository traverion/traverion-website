/**
 * Phase 2 / Step 2.3: execute a queued Stay or Tour cancellation refund against Stripe.
 * Idempotent via booking_refund_instructions.idempotency_key
 *   (cancel-refund:{bookingId}, legacy stay-cancel-refund:{bookingId}).
 * Does NOT set payment_status=refunded — stripe-webhook charge.refunded does that.
 * Service-role { recover: true } drains pending/stale instructions without a browser.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { isStripeTestSecretKey, stripeLiveSecretBlockedMessage } from '../_shared/stripe-test-only.ts';
import { authUserVerifiedEmail } from '../_shared/auth-verified-email.ts';
import { travelerOwnsCheckoutBooking } from '../_shared/booking-traveler-ownership.ts';
import {
  isStripeChargeFullyRefunded,
  remainingPaidMajorFromCharge,
} from '../_shared/stripe-charge-refund.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

const IDEMPOTENCY_PREFIX = 'cancel-refund:';
const LEGACY_STAY_PREFIX = 'stay-cancel-refund:';

function refundKeyForBooking(bookingId: string): string {
  return `${IDEMPOTENCY_PREFIX}${bookingId}`;
}

function legacyStayKeyForBooking(bookingId: string): string {
  return `${LEGACY_STAY_PREFIX}${bookingId}`;
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

    const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    let actorUserId: string | null = null;
    if (!isServiceRole) {
      const authedClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: authData, error: authError } = await authedClient.auth.getUser();
      if (authError || !authData?.user) {
        return json({ success: false, error: 'Unauthorized' }, 401);
      }
      actorUserId = authData.user.id;
    }

    const body = (await req.json().catch(() => ({}))) as {
      bookingId?: string;
      recover?: boolean;
      limit?: number;
    };

    // Service-role recovery drain — no traveler browser required.
    if (body.recover === true) {
      if (!isServiceRole) {
        return json({ success: false, error: 'recover requires service role' }, 403);
      }
      const limit =
        typeof body.limit === 'number' && Number.isFinite(body.limit)
          ? Math.max(1, Math.min(Math.floor(body.limit), 50))
          : 25;
      const listed = await admin.rpc('list_pending_cancel_refund_instructions', {
        p_limit: limit,
      });
      if (listed.error) return json({ success: false, error: listed.error.message }, 500);
      const instructions = ((listed.data as { instructions?: Array<{ booking_id?: string }> } | null)
        ?.instructions ?? []) as Array<{ booking_id?: string }>;
      const results: Array<{ bookingId: string; ok: boolean; error?: string }> = [];
      for (const row of instructions) {
        const id = typeof row.booking_id === 'string' ? row.booking_id.trim() : '';
        if (!id) continue;
        try {
          const nested = await fetch(`${supabaseUrl}/functions/v1/execute-booking-refund`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${serviceRoleKey}`,
              apikey: serviceRoleKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ bookingId: id }),
          });
          const nestedJson = (await nested.json().catch(() => ({}))) as {
            success?: boolean;
            error?: string;
          };
          results.push({
            bookingId: id,
            ok: nestedJson.success === true,
            error: nestedJson.success ? undefined : String(nestedJson.error ?? nested.status),
          });
        } catch (e) {
          results.push({
            bookingId: id,
            ok: false,
            error: e instanceof Error ? e.message : 'recover_invoke_failed',
          });
        }
      }
      return json({
        success: true,
        recover: true,
        attempted: results.length,
        results,
      });
    }

    const bookingId = typeof body.bookingId === 'string' ? body.bookingId.trim() : '';
    if (!bookingId) return json({ success: false, error: 'bookingId required' }, 400);

    const { data: booking, error: bookingErr } = await admin
      .from('bookings')
      .select(
        'id, status, payment_status, refund_choice, payment_intent_id, amount_paid, currency, guest_user_id, guest_email, guest_name, listing_id, booking_date, booking_number, guests, auto_refund_status, auto_refund_stripe_id, purchase_snapshot, special_requests'
      )
      .eq('id', bookingId)
      .maybeSingle();
    if (bookingErr) return json({ success: false, error: bookingErr.message }, 500);
    if (!booking) return json({ success: false, error: 'Booking not found' }, 404);

    if (!isServiceRole) {
      const authedClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: authData } = await authedClient.auth.getUser();
      const verifiedEmail = authUserVerifiedEmail(authData?.user) ?? '';
      const travelerOk = travelerOwnsCheckoutBooking({
        guestUserId: booking.guest_user_id,
        guestEmail: booking.guest_email,
        authUserId: actorUserId ?? '',
        verifiedEmail,
      });
      let supplierOk = false;
      if (!travelerOk && booking.listing_id && actorUserId) {
        const { data: listing } = await admin
          .from('listings')
          .select('supplier_id')
          .eq('id', booking.listing_id)
          .maybeSingle();
        const supplierId =
          typeof listing?.supplier_id === 'string' ? listing.supplier_id.trim() : '';
        if (supplierId) {
          const userClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
          });
          const { data: sideUser } = await userClient.rpc('is_supplier_account_side', {
            p_supplier_id: supplierId,
          });
          supplierOk = sideUser === true;
        }
      }
      if (!travelerOk && !supplierOk) {
        return json({ success: false, error: 'Not authorized for this booking' }, 403);
      }
    }

    if ((booking.payment_status ?? '').toLowerCase() === 'refunded') {
      return json({
        success: true,
        alreadyRefunded: true,
        bookingId,
        paymentStatus: 'refunded',
      });
    }

    if ((booking.status ?? '').toLowerCase() !== 'cancelled') {
      return json({ success: false, error: 'Booking is not cancelled' }, 400);
    }
    if ((booking.refund_choice ?? '').toLowerCase() !== 'full_refund') {
      return json({ success: false, error: 'No refund entitlement on this booking' }, 400);
    }

    const ensure = await admin.rpc('ensure_booking_cancel_refund_instruction', {
      p_booking_id: bookingId,
      p_reason: 'execute_booking_refund',
      p_actor_id: actorUserId,
    });
    if (ensure.error) return json({ success: false, error: ensure.error.message }, 500);
    const ensureObj = ensure.data as {
      ok?: boolean;
      error?: string;
      skipped?: boolean;
      already_refunded?: boolean;
      idempotency_key?: string;
    } | null;
    if (ensureObj?.already_refunded) {
      return json({ success: true, alreadyRefunded: true, bookingId });
    }
    if (!ensureObj?.ok) {
      return json(
        {
          success: false,
          error: String(ensureObj?.error ?? 'Could not prepare refund instruction'),
          skipped: ensureObj?.skipped === true,
        },
        ensureObj?.skipped ? 200 : 400
      );
    }

    const preferredKey = ensureObj.idempotency_key || refundKeyForBooking(bookingId);
    const claimKeys = Array.from(
      new Set([preferredKey, refundKeyForBooking(bookingId), legacyStayKeyForBooking(bookingId)])
    );

    let claimObj: {
      ok?: boolean;
      error?: string;
      already?: boolean;
      status?: string;
      stripe_refund_id?: string | null;
      amount_minor?: number;
      currency?: string;
      booking_id?: string;
      id?: string;
      idempotency_key?: string;
    } | null = null;
    let idempotencyKey = preferredKey;

    for (const key of claimKeys) {
      const claim = await admin.rpc('claim_refund_instruction_for_execution', {
        p_idempotency_key: key,
        p_stale_after_seconds: 120,
      });
      if (claim.error) return json({ success: false, error: claim.error.message }, 500);
      const row = claim.data as typeof claimObj;
      if (row?.ok) {
        claimObj = row;
        idempotencyKey = key;
        break;
      }
      if (row?.error === 'not_claimable') {
        return json({
          success: true,
          pending: true,
          status: row.status,
          stripeRefundId: row.stripe_refund_id ?? null,
          bookingId,
          message: 'Refund already in progress',
        });
      }
      // instruction_not_found on this key — try next
      if (row?.error && row.error !== 'instruction_not_found') {
        return json({ success: false, error: String(row.error ?? 'claim_failed') }, 409);
      }
    }

    if (!claimObj?.ok) {
      return json({ success: false, error: 'claim_failed' }, 409);
    }

    if (claimObj.already && claimObj.stripe_refund_id) {
      return json({
        success: true,
        already: true,
        submitted: true,
        stripeRefundId: claimObj.stripe_refund_id,
        bookingId,
        status: claimObj.status,
      });
    }

    const paymentIntentId = String(booking.payment_intent_id ?? '').trim();
    if (!paymentIntentId) {
      await admin.rpc('mark_refund_instruction_failed', {
        p_idempotency_key: idempotencyKey,
        p_error: 'missing_payment_intent',
      });
      return json({ success: false, error: 'Missing payment reference', retryable: false }, 400);
    }

    const amountMinor = Number(claimObj.amount_minor ?? 0);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      await admin.rpc('mark_refund_instruction_failed', {
        p_idempotency_key: idempotencyKey,
        p_error: 'invalid_amount',
      });
      return json({ success: false, error: 'Invalid refund amount', retryable: false }, 400);
    }

    const stripe = new Stripe(stripeSecret);

    // Cap to remaining refundable on the PI (partials / prior refunds).
    let refundAmountMinor = Math.floor(amountMinor);
    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['latest_charge'],
      });
      const charge =
        typeof pi.latest_charge === 'object' && pi.latest_charge
          ? (pi.latest_charge as Stripe.Charge)
          : null;
      if (charge && isStripeChargeFullyRefunded(charge)) {
        await admin.rpc('mark_refund_instruction_submitted', {
          p_idempotency_key: idempotencyKey,
          p_stripe_refund_id: charge.refunds?.data?.[0]?.id ?? 'already_refunded',
          p_stripe_status: 'succeeded',
        });
        return json({
          success: true,
          alreadyRefundedOnStripe: true,
          bookingId,
          message: 'Payment already fully refunded on Stripe; awaiting webhook sync',
        });
      }
      if (charge) {
        const remainingMajor = remainingPaidMajorFromCharge(charge);
        if (remainingMajor != null) {
          const remainingMinor = Math.round(remainingMajor * 100);
          refundAmountMinor = Math.min(refundAmountMinor, remainingMinor);
        }
      }
      if (typeof pi.amount_received === 'number' && Number.isFinite(pi.amount_received)) {
        // Prefer charge remaining; else never exceed amount_received.
        refundAmountMinor = Math.min(refundAmountMinor, Math.floor(pi.amount_received));
      }
    } catch (piErr) {
      const msg = piErr instanceof Error ? piErr.message : String(piErr);
      await admin.rpc('mark_refund_instruction_failed', {
        p_idempotency_key: idempotencyKey,
        p_error: `pi_retrieve:${msg}`.slice(0, 2000),
      });
      return json({
        success: false,
        error: 'Could not load payment for refund',
        retryable: true,
        detail: msg,
      }, 502);
    }

    if (refundAmountMinor <= 0) {
      await admin.rpc('mark_refund_instruction_failed', {
        p_idempotency_key: idempotencyKey,
        p_error: 'nothing_remaining_to_refund',
      });
      return json({ success: false, error: 'Nothing remaining to refund', retryable: false }, 400);
    }

    let refund: Stripe.Refund;
    try {
      refund = await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          amount: refundAmountMinor,
          reason: 'requested_by_customer',
          metadata: {
            booking_id: bookingId,
            traverion_refund_key: idempotencyKey,
          },
        },
        { idempotencyKey }
      );
    } catch (refundErr) {
      const msg = refundErr instanceof Error ? refundErr.message : String(refundErr);
      if (/already.?been.?refunded|charge_already_refunded/i.test(msg)) {
        await admin.rpc('mark_refund_instruction_submitted', {
          p_idempotency_key: idempotencyKey,
          p_stripe_refund_id: 'already_refunded',
          p_stripe_status: 'succeeded',
        });
        return json({
          success: true,
          alreadyRefundedOnStripe: true,
          bookingId,
        });
      }
      // Timeout / temporary — leave processing for reclaim; mark failed only for clear permanent errors.
      const permanent = /no such payment_intent|amount_too_large|charge_already_refunded/i.test(msg);
      if (permanent) {
        await admin.rpc('mark_refund_instruction_failed', {
          p_idempotency_key: idempotencyKey,
          p_error: msg.slice(0, 2000),
        });
      }
      // Soft-fail: keep processing so stale reclaim can retry the same idempotency key.
      return json({
        success: false,
        error: 'Stripe refund call failed',
        retryable: !permanent,
        detail: msg,
        bookingId,
      }, 502);
    }

    await admin.rpc('mark_refund_instruction_submitted', {
      p_idempotency_key: idempotencyKey,
      p_stripe_refund_id: refund.id,
      p_stripe_status: refund.status ?? 'pending',
    });

    await admin.from('booking_payment_events').insert({
      booking_id: bookingId,
      event_id: `auto-refund:${refund.id}`,
      event_type: 'cancel_refund_submitted',
      payment_intent_id: paymentIntentId,
      amount: refundAmountMinor / 100,
      currency: String(claimObj.currency || booking.currency || 'EUR').toUpperCase(),
      payload: {
        stripe_refund_id: refund.id,
        stripe_status: refund.status,
        idempotency_key: idempotencyKey,
        amount_minor: refundAmountMinor,
      },
    });

    // Notify — initiated (completed comes from webhook).
    let listingTitle = 'Your booking';
    let listingSupplierId: string | null = null;
    if (booking.listing_id) {
      const { data: lt } = await admin
        .from('listings')
        .select('title, supplier_id')
        .eq('id', booking.listing_id)
        .maybeSingle();
      if (lt?.title?.trim()) listingTitle = lt.title.trim();
      if (typeof lt?.supplier_id === 'string' && lt.supplier_id.trim()) {
        listingSupplierId = lt.supplier_id.trim();
      }
    }

    const notifyAmount = refundAmountMinor / 100;
    const currency = String(claimObj.currency || booking.currency || 'EUR').toUpperCase();
    const guestEmail = String(booking.guest_email ?? '').trim().toLowerCase();

    try {
      await fetch(`${supabaseUrl}/functions/v1/notify-customer-booking`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerEmail: guestEmail || 'resolve@guest.local',
          customerName: booking.guest_name ?? undefined,
          listingTitle,
          bookingId,
          bookingNumber:
            typeof booking.booking_number === 'number' ? booking.booking_number : undefined,
          bookingDate: booking.booking_date ?? undefined,
          guests: typeof booking.guests === 'number' ? booking.guests : undefined,
          totalAmount: notifyAmount,
          currency,
          emailKind: 'refund_initiated',
          publicSiteUrl: Deno.env.get('PUBLIC_SITE_URL') ?? 'https://www.traverion.com',
          idempotencyKey: `customer:refund_initiated:${bookingId}:${refund.id}`,
        }),
      });
    } catch {
      /* notify soft */
    }

    if (listingSupplierId) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/notify-supplier-event`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            supplierId: listingSupplierId,
            eventType: 'refund_initiated',
            listingId: booking.listing_id ?? undefined,
            listingTitle,
            bookingId,
            bookingNumber:
              typeof booking.booking_number === 'number' ? booking.booking_number : undefined,
            bookingDate: booking.booking_date ?? undefined,
            guests: typeof booking.guests === 'number' ? booking.guests : undefined,
            guestName: booking.guest_name ?? undefined,
            refundAmount: notifyAmount,
            currency,
            portalBaseUrl: Deno.env.get('PUBLIC_SITE_URL') ?? 'https://www.traverion.com',
            idempotencyKey: `supplier:refund_initiated:${bookingId}:${refund.id}`,
          }),
        });
      } catch {
        /* notify soft */
      }
    }

    return json({
      success: true,
      bookingId,
      stripeRefundId: refund.id,
      stripeStatus: refund.status,
      amountMinor: refundAmountMinor,
      currency,
      // payment_status still paid until webhook confirms
      paymentStatusPendingWebhook: true,
    });
  } catch (err) {
    return json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Refund execution failed',
        retryable: true,
      },
      500
    );
  }
});
