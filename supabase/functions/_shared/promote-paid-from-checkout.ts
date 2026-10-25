// Shared paid-promotion path for stripe-webhook + reconcile-checkout-session.
import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { staleCheckoutFailureShouldApply, stripeWebhookCanMarkPaidFrom } from './checkout-resume.ts';
import { isMissingPostgresFunctionError } from './checkout-inventory-conflict.ts';
import { promotePaidCheckoutOutcome } from './promote-paid-checkout.ts';
import { checkoutPaidAmountAcceptable, checkoutPaidCurrencyMatches, rejectedCheckoutCaptureShouldRefund, unpromotedCheckoutCaptureShouldRefund } from './checkout-paid-amount.ts';
import { orphanSupersededCheckoutShouldRefund } from './orphan-checkout-refund.ts';
import {
  cancelledCheckoutCaptureShouldRefund,
  cancelledUnpaidBookingBlocksCheckoutPaid,
} from './cancelled-booking-checkout.ts';
import { paidPromotionShouldRefuseFullyRefundedCharge } from './stripe-charge-refund.ts';
import { inventoryStartTimeHmFromBooking } from './booking-hold.ts';
import {
  effectiveBookingCutoffHours,
  listingHasUpcomingBookableSeason,
  resolveTourDepartureHmForCutoff,
} from './booking-quote.ts';
import {
  assertDepartureStillBookable,
  resolveDepartureTimezone,
} from './tour-departure-cutoff.ts';
import { stayRequestApprovalExpiresAtIso } from './stay-booking-method.ts';

function listingKindFromExtras(extras: unknown): 'stay' | 'tour' | 'rental' {
  if (extras && typeof extras === 'object') {
    const family = (extras as { inventoryFamily?: unknown }).inventoryFamily;
    if (family === 'stay') return 'stay';
    if (family === 'rental') return 'rental';
  }
  return 'tour';
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function amountToMajor(amountMinor: number | null | undefined): number | null {
  if (typeof amountMinor !== 'number' || !Number.isFinite(amountMinor)) return null;
  return Math.round((amountMinor / 100) * 100) / 100;
}

/**
 * Phase 1853: service-role edge→edge invokes must send the *same* key in
 * Authorization and apikey. Mixing anon apikey + service-role Bearer trips
 * Supabase "Conflicting API keys" at the gateway — paid confirm / new_booking
 * never reached the notify functions (booking #44). Refund path already used
 * matching service-role headers and worked.
 */
export function serviceRoleEdgeInvokeHeaders(serviceRoleKey: string): Record<string, string> {
  const key = serviceRoleKey.trim();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
    apikey: key,
  };
}

export async function notifyPaidBookingSideEffects(params: {
  admin: SupabaseClient;
  supabaseUrl: string;
  serviceRoleKey: string;
  bookingId: string;
  amountPaid: number | null;
  currency: string;
}) {
  const { admin, supabaseUrl, serviceRoleKey, bookingId, amountPaid, currency } = params;
  const portalBase = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://www.traverion.com').replace(/\/$/, '');

  const withStay = await admin
    .from('bookings')
    .select(
      'listing_id, booking_date, check_out, guests, guest_name, guest_email, guest_user_id, booking_number, paid_at, payment_intent_id',
    )
    .eq('id', bookingId)
    .maybeSingle();
  let booking = withStay.data as Record<string, unknown> | null;
  if (withStay.error && /check_out/i.test(withStay.error.message)) {
    const fallback = await admin
      .from('bookings')
      .select(
        'listing_id, booking_date, guests, guest_name, guest_email, guest_user_id, booking_number, paid_at, payment_intent_id',
      )
      .eq('id', bookingId)
      .maybeSingle();
    booking = fallback.data as Record<string, unknown> | null;
  } else if (withStay.error || !booking) {
    return;
  }
  if (!booking?.listing_id) return;

  let guestEmailResolved = String(booking.guest_email ?? '').trim().toLowerCase();
  if (!guestEmailResolved && booking.guest_user_id) {
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(String(booking.guest_user_id));
      const fromAuth = (authUser?.user?.email ?? '').trim().toLowerCase();
      if (fromAuth) {
        guestEmailResolved = fromAuth;
        await admin.from('bookings').update({ guest_email: fromAuth }).eq('id', bookingId);
      }
    } catch {
      /* ignore */
    }
  }

  // Occupancy is paid + live holds — do not mutate listing_availability.booked.

  const { data: listing } = await admin
    .from('listings')
    .select('supplier_id, title, listing_extras')
    .eq('id', booking.listing_id)
    .maybeSingle();

  const listingKind = listingKindFromExtras(listing?.listing_extras);
  const checkOut =
    typeof booking.check_out === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(booking.check_out.trim())
      ? booking.check_out.trim()
      : undefined;

  // Phase 1853: match refund webhook / notifyTravelerCheckoutCaptureReversed headers.
  const headers = serviceRoleEdgeInvokeHeaders(serviceRoleKey);

  const b = booking as Record<string, unknown>;
  const bn = b.booking_number;
  const orderNum = typeof bn === 'number' && Number.isFinite(bn) ? Math.floor(bn) : undefined;
  const paidAtIso = typeof booking.paid_at === 'string' ? booking.paid_at : undefined;
  const paymentIntentId =
    typeof booking.payment_intent_id === 'string' ? booking.payment_intent_id : undefined;

  if (listing?.supplier_id) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/notify-supplier-event`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          supplierId: listing.supplier_id,
          eventType: 'new_booking',
          listingId: booking.listing_id,
          listingTitle: listing.title ?? undefined,
          bookingId,
          bookingDate: booking.booking_date ?? undefined,
          guests: Number(booking.guests ?? 0),
          guestName: booking.guest_name ?? undefined,
          portalBaseUrl: portalBase,
          bookingPaymentStatus: 'paid',
          bookingNumber: orderNum,
          idempotencyKey: `supplier:new_booking:${bookingId}`,
        }),
      });
      if (!res.ok) {
        console.error(
          JSON.stringify({
            source: 'notifyPaidBookingSideEffects',
            channel: 'supplier',
            eventType: 'new_booking',
            bookingId,
            status: res.status,
            body: (await res.text()).slice(0, 400),
          })
        );
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          source: 'notifyPaidBookingSideEffects',
          channel: 'supplier',
          eventType: 'new_booking',
          bookingId,
          error: err instanceof Error ? err.message : 'notify-supplier-event failed',
        })
      );
    }
  }

  if (guestEmailResolved) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/notify-customer-booking`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerEmail: guestEmailResolved,
          customerName: booking.guest_name ?? undefined,
          listingTitle: listing?.title?.trim() || 'Your booking',
          bookingId,
          bookingDate: booking.booking_date ?? undefined,
          checkOutDate: listingKind === 'stay' ? checkOut : undefined,
          guests: Number(booking.guests ?? 0),
          totalAmount: amountPaid ?? undefined,
          currency,
          emailKind: 'booking_confirmed_paid',
          publicSiteUrl: portalBase,
          paidAtIso,
          paymentIntentId,
          bookingNumber: orderNum,
          listingKind,
          idempotencyKey: `customer:booking_confirmed_paid:${bookingId}`,
        }),
      });
      if (!res.ok) {
        console.error(
          JSON.stringify({
            source: 'notifyPaidBookingSideEffects',
            channel: 'customer',
            emailKind: 'booking_confirmed_paid',
            bookingId,
            status: res.status,
            body: (await res.text()).slice(0, 400),
          })
        );
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          source: 'notifyPaidBookingSideEffects',
          channel: 'customer',
          emailKind: 'booking_confirmed_paid',
          bookingId,
          error: err instanceof Error ? err.message : 'notify-customer-booking failed',
        })
      );
    }
  }
}

/** Request-to-Book: authorization succeeded — notify guest + host. Do not send confirmed-paid mail. */
export async function notifyAuthorizedBookingSideEffects(params: {
  admin: SupabaseClient;
  supabaseUrl: string;
  serviceRoleKey: string;
  bookingId: string;
  amountAuthorized: number | null;
  currency: string;
  approvalExpiresAt: string;
}) {
  const { admin, supabaseUrl, serviceRoleKey, bookingId, amountAuthorized, currency, approvalExpiresAt } =
    params;
  const portalBase = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://www.traverion.com').replace(/\/$/, '');
  const headers = serviceRoleEdgeInvokeHeaders(serviceRoleKey);

  const { data: booking } = await admin
    .from('bookings')
    .select(
      'listing_id, booking_date, check_out, guests, guest_name, guest_email, guest_user_id, booking_number, total_amount'
    )
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking?.listing_id) return;

  const { data: listing } = await admin
    .from('listings')
    .select('supplier_id, title, listing_extras')
    .eq('id', booking.listing_id)
    .maybeSingle();

  const listingKind = listingKindFromExtras(listing?.listing_extras);
  const bn = booking.booking_number;
  const orderNum = typeof bn === 'number' && Number.isFinite(bn) ? Math.floor(bn) : undefined;
  const amount =
    typeof amountAuthorized === 'number' && Number.isFinite(amountAuthorized)
      ? amountAuthorized
      : typeof booking.total_amount === 'number'
        ? booking.total_amount
        : undefined;

  if (listing?.supplier_id) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/notify-supplier-event`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          supplierId: listing.supplier_id,
          eventType: 'new_booking',
          listingId: booking.listing_id,
          listingTitle: listing.title ?? undefined,
          bookingId,
          bookingDate: booking.booking_date ?? undefined,
          checkOutDate: booking.check_out ?? undefined,
          guests: Number(booking.guests ?? 0),
          guestName: booking.guest_name ?? undefined,
          portalBaseUrl: portalBase,
          bookingPaymentStatus: 'authorized',
          bookingNumber: orderNum,
          listingKind,
          idempotencyKey: `supplier:stay_request:${bookingId}`,
          changeSummary: `Respond by ${approvalExpiresAt}. Payment is authorized; capture only after you accept.`,
        }),
      });
    } catch (err) {
      console.error(
        JSON.stringify({
          source: 'notifyAuthorizedBookingSideEffects',
          channel: 'supplier',
          bookingId,
          error: err instanceof Error ? err.message : 'notify-supplier-event failed',
        })
      );
    }
  }

  let guestEmail = String(booking.guest_email ?? '').trim().toLowerCase();
  if (!guestEmail && booking.guest_user_id) {
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(String(booking.guest_user_id));
      guestEmail = (authUser?.user?.email ?? '').trim().toLowerCase();
    } catch {
      /* ignore */
    }
  }
  if (!guestEmail) return;

  try {
    await fetch(`${supabaseUrl}/functions/v1/notify-customer-booking`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        emailKind: 'booking_request',
        bookingId,
        to: guestEmail,
        listingTitle: listing?.title ?? undefined,
        listingKind,
        bookingDate: booking.booking_date ?? undefined,
        checkOutDate: booking.check_out ?? undefined,
        guests: Number(booking.guests ?? 0),
        amount,
        currency,
        bookingNumber: orderNum,
        idempotencyKey: `customer:booking_request:${bookingId}`,
        fieldDiffs: [
          { field: 'Host response', before: '—', after: `Within 24 hours (by ${approvalExpiresAt})` },
          { field: 'Payment', before: '—', after: 'Authorized · not captured yet' },
        ],
      }),
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        source: 'notifyAuthorizedBookingSideEffects',
        channel: 'customer',
        bookingId,
        error: err instanceof Error ? err.message : 'notify-customer-booking failed',
      })
    );
  }
}

/**
 * Phase 1713/1714/1719/1720: after Stripe auto-refunds a capture that never became a paid booking,
 * email the traveler (refund_completed never runs — payment_status stays failed).
 * When ensureCancelled, close pending holds so booking_cancelled lifecycle gate passes.
 * When not cancelled (orphan paid booking), use checkout_payment_reversed.
 */
export async function notifyTravelerCheckoutCaptureReversed(params: {
  admin: SupabaseClient;
  supabaseUrl: string;
  serviceRoleKey: string;
  existingBooking: Record<string, unknown> | null;
  bookingId: string;
  sessionId: string;
  amountPaid: number | null;
  currency: string;
  reasonKey: string;
  fieldBefore: string;
  fieldAfter: string;
  ensureCancelled?: boolean;
}): Promise<void> {
  const {
    admin,
    supabaseUrl,
    serviceRoleKey,
    existingBooking,
    bookingId,
    sessionId,
    amountPaid,
    currency,
    reasonKey,
    fieldBefore,
    fieldAfter,
    ensureCancelled = false,
  } = params;
  if (!supabaseUrl || !serviceRoleKey) return;

  if (ensureCancelled) {
    try {
      await admin
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', bookingId)
        .in('status', ['pending', 'confirmed']);
    } catch {
      /* still attempt notify */
    }
  }

  let guestEmail = String(existingBooking?.guest_email ?? '')
    .trim()
    .toLowerCase();
  // Phase 1779: match paid-confirm path — resolve auth email when guest_email is empty.
  if (!guestEmail && existingBooking?.guest_user_id) {
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(
        String(existingBooking.guest_user_id)
      );
      const fromAuth = String(authUser?.user?.email ?? '')
        .trim()
        .toLowerCase();
      if (fromAuth) guestEmail = fromAuth;
    } catch {
      /* still skip notify if unresolved */
    }
  }
  if (!guestEmail) return;

  let listingTitle = 'Your booking';
  if (existingBooking?.listing_id) {
    const { data: lt } = await admin
      .from('listings')
      .select('title')
      .eq('id', existingBooking.listing_id)
      .maybeSingle();
    if (lt?.title?.trim()) listingTitle = lt.title.trim();
  }
  const bn = existingBooking?.booking_number;
  const orderNum = typeof bn === 'number' && Number.isFinite(bn) ? Math.floor(bn) : undefined;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/notify-customer-booking`, {
      method: 'POST',
      headers: serviceRoleEdgeInvokeHeaders(serviceRoleKey),
      body: JSON.stringify({
        customerEmail: guestEmail,
        customerName: existingBooking?.guest_name ?? undefined,
        listingTitle,
        bookingId,
        bookingNumber: orderNum,
        bookingDate: existingBooking?.booking_date ?? undefined,
        guests: typeof existingBooking?.guests === 'number' ? existingBooking.guests : undefined,
        totalAmount: amountPaid ?? undefined,
        currency,
        // Phase 1719: orphan paths keep the booking active — booking_cancelled is 409.
        emailKind: ensureCancelled ? 'booking_cancelled' : 'checkout_payment_reversed',
        unpaidCheckout: false,
        fieldDiffs: [{ label: 'Payment', before: fieldBefore, after: fieldAfter }],
        publicSiteUrl: Deno.env.get('PUBLIC_SITE_URL') ?? 'https://www.traverion.com',
        idempotencyKey: `customer:${ensureCancelled ? 'booking_cancelled' : 'checkout_payment_reversed'}:${bookingId}:${reasonKey}:${sessionId}`,
      }),
    });
    if (!res.ok) {
      console.error(
        JSON.stringify({
          source: 'notifyTravelerCheckoutCaptureReversed',
          bookingId,
          reasonKey,
          status: res.status,
          body: await res.text().catch(() => ''),
        })
      );
    }
  } catch {
    /* non-fatal — refund already succeeded */
  }
}

export async function promotePaidFromCheckoutSession(params: {
  admin: SupabaseClient;
  stripe: Stripe;
  session: Stripe.Checkout.Session;
  event: Stripe.Event;
  markProcessed: (status: 'processed' | 'ignored' | 'failed', errorMessage?: string) => Promise<void>;
  supabaseUrl: string;
  serviceRoleKey: string;
}): Promise<Response> {
  const { admin, stripe, session, event, markProcessed, supabaseUrl, serviceRoleKey } = params;
  const bookingId = session.metadata?.booking_id ?? null;
  if (!bookingId) {
    await markProcessed('ignored', 'Missing booking_id metadata');
    return json({ success: true, ignored: true, reason: 'missing booking metadata' });
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  const amountPaid = amountToMajor(session.amount_total ?? null);

  const withStay = await admin
    .from('bookings')
    .select(
      'id, status, payment_status, approval_status, approval_decided_by, currency, total_amount, checkout_session_id, payment_intent_id, listing_id, booking_date, guests, check_out, start_time, purchase_snapshot, booking_option_id, guest_user_id, guest_email, guest_name, booking_number'
    )
    .eq('id', bookingId)
    .maybeSingle();
  let existingBooking = withStay.data as Record<string, unknown> | null;
  if (withStay.error && /check_out|start_time|purchase_snapshot|booking_option_id|guest_user_id|guest_email|guest_name|booking_number|approval_/i.test(withStay.error.message)) {
    const fallback = await admin
      .from('bookings')
      .select(
        'id, status, payment_status, currency, total_amount, checkout_session_id, payment_intent_id, listing_id, booking_date, guests, check_out, start_time, guest_user_id, guest_email, guest_name, booking_number'
      )
      .eq('id', bookingId)
      .maybeSingle();
    existingBooking = fallback.data as Record<string, unknown> | null;
  } else if (withStay.error) {
    throw new Error(withStay.error.message);
  }
  const existingPay = String(existingBooking?.payment_status ?? '').toLowerCase();
  const existingApproval = String(existingBooking?.approval_status ?? '').toLowerCase();
  if (existingPay === 'authorized') {
    // Request-to-Book recovery: capture succeeded (PI.succeeded) but finalize crashed.
    // Never treat authorize-only checkout.session.completed as paid.
    let piStatus = '';
    if (paymentIntentId) {
      try {
        const piProbe = await stripe.paymentIntents.retrieve(paymentIntentId);
        piStatus = String(piProbe.status ?? '').toLowerCase();
      } catch {
        piStatus = '';
      }
    }
    const piVerifiedSucceeded =
      piStatus === 'succeeded' || event.type === 'payment_intent.succeeded';
    if (piVerifiedSucceeded && existingApproval !== 'accepted') {
      // Still awaiting host Accept claim — do not invent accept or mark paid.
      await markProcessed('processed');
      return json({
        success: true,
        duplicate: true,
        alreadyAuthorized: true,
        awaitingHostAccept: true,
        eventId: event.id,
        bookingId,
      });
    }
    if (piVerifiedSucceeded && existingApproval === 'accepted') {
      const amountFinalize =
        amountPaid ??
        (typeof existingBooking?.total_amount === 'number' ? Number(existingBooking.total_amount) : null);
      const currencyFinalize = String(
        existingBooking?.currency || session.currency || 'eur'
      ).toUpperCase();
      if (amountFinalize == null || !Number.isFinite(amountFinalize)) {
        await markProcessed('failed', 'authorized finalize missing amount');
        return json({ success: false, error: 'authorized finalize missing amount' }, 500);
      }
      const actorId =
        typeof existingBooking?.approval_decided_by === 'string'
          ? existingBooking.approval_decided_by
          : null;
      const { data: fin, error: finErr } = await admin.rpc('capture_stay_booking_request', {
        p_booking_id: bookingId,
        p_actor_id: actorId,
        p_amount_paid: amountFinalize,
        p_currency: currencyFinalize,
        p_paid_at: new Date().toISOString(),
      });
      if (finErr || !(fin && typeof fin === 'object' && (fin as { ok?: boolean }).ok === true)) {
        await markProcessed('failed', finErr?.message ?? 'authorized finalize failed');
        return json(
          {
            success: false,
            error: finErr?.message ?? String((fin as { reason?: string } | null)?.reason ?? 'finalize_failed'),
          },
          500
        );
      }
      const { error: earnErr } = await admin.rpc('record_paid_booking_earnings', {
        p_booking_id: bookingId,
      });
      if (earnErr) {
        await markProcessed('failed', earnErr.message);
        return json({ success: false, error: earnErr.message }, 500);
      }
      await admin.from('booking_payment_events').insert({
        booking_id: bookingId,
        event_id: event.id,
        event_type: 'stay_request_captured_via_webhook',
        payment_intent_id: paymentIntentId,
        checkout_session_id: session.id,
        amount: amountFinalize,
        currency: currencyFinalize,
        payload: { stripeEventType: event.type },
      });
      await notifyPaidBookingSideEffects({
        admin,
        supabaseUrl,
        serviceRoleKey,
        bookingId,
        amountPaid: amountFinalize,
        currency: currencyFinalize,
      });
      await markProcessed('processed');
      return json({
        success: true,
        finalizedFromAuthorized: true,
        eventId: event.id,
        bookingId,
      });
    }
    await markProcessed('processed');
    return json({
      success: true,
      duplicate: true,
      alreadyAuthorized: true,
      eventId: event.id,
      bookingId,
    });
  }
  if (
    !staleCheckoutFailureShouldApply({
      eventCheckoutSessionId: session.id,
      eventPaymentIntentId: paymentIntentId,
      bookingCheckoutSessionId: existingBooking?.checkout_session_id ?? null,
      bookingPaymentIntentId: existingBooking?.payment_intent_id ?? null,
    })
  ) {
    let orphanRefunded = false;
    if (
      orphanSupersededCheckoutShouldRefund({
        sessionPaymentStatus: session.payment_status,
        eventPaymentIntentId: paymentIntentId,
        bookingPaymentIntentId: existingBooking?.payment_intent_id ?? null,
      })
    ) {
      try {
        await stripe.refunds.create(
          {
            payment_intent: paymentIntentId as string,
            reason: 'duplicate',
          },
          { idempotencyKey: `orphan-checkout-refund:${session.id}` }
        );
        orphanRefunded = true;
        const orphanCurrency = String(
          existingBooking?.currency || session.currency || 'eur'
        ).toUpperCase();
        await admin.from('booking_payment_events').insert({
          booking_id: bookingId,
          event_id: event.id,
          event_type: 'orphan_checkout_refund',
          payment_intent_id: paymentIntentId,
          checkout_session_id: session.id,
          amount: amountPaid,
          currency: orphanCurrency,
          payload: {
            reason: 'stale_superseded_checkout',
            stripeEventType: event.type,
          },
        });
        // Phase 1715: superseded checkout PI refunded — tell traveler (do not cancel paid booking).
        await notifyTravelerCheckoutCaptureReversed({
          admin,
          supabaseUrl,
          serviceRoleKey,
          existingBooking,
          bookingId,
          sessionId: session.id,
          amountPaid,
          currency: orphanCurrency,
          reasonKey: 'orphan_checkout_refund',
          fieldBefore: 'A superseded checkout session was paid',
          fieldAfter: 'Stripe payment automatically reversed — your booking uses the current checkout',
          ensureCancelled: false,
        });
      } catch (refundErr) {
        const msg = refundErr instanceof Error ? refundErr.message : String(refundErr);
        if (!/already.?been.?refunded|charge_already_refunded/i.test(msg)) {
          throw refundErr;
        }
      }
    }
    await markProcessed('processed');
    return json({
      success: true,
      ignored: true,
      reason: 'stale checkout.session.completed for superseded session',
      orphanRefunded,
      eventId: event.id,
      bookingId,
    });
  }
  if (
    cancelledUnpaidBookingBlocksCheckoutPaid({
      bookingStatus: (existingBooking as { status?: string | null } | null)?.status ?? null,
      bookingPaymentStatus: existingBooking?.payment_status ?? null,
    })
  ) {
    let cancelledRefunded = false;
    if (
      cancelledCheckoutCaptureShouldRefund({
        sessionPaymentStatus: session.payment_status,
        paymentIntentId,
      })
    ) {
      try {
        await stripe.refunds.create(
          {
            payment_intent: paymentIntentId as string,
            reason: 'requested_by_customer',
          },
          { idempotencyKey: `cancelled-checkout-refund:${session.id}` }
        );
        cancelledRefunded = true;
        const cancelCurrency = String(
          existingBooking?.currency || session.currency || 'eur'
        ).toUpperCase();
        await admin.from('booking_payment_events').insert({
          booking_id: bookingId,
          event_id: event.id,
          event_type: 'cancelled_checkout_refund',
          payment_intent_id: paymentIntentId,
          checkout_session_id: session.id,
          amount: amountPaid,
          currency: cancelCurrency,
          payload: {
            reason: 'checkout_after_unpaid_cancel',
            stripeEventType: event.type,
          },
        });
        // Phase 1713: traveler must learn the bank charge was reversed.
        await notifyTravelerCheckoutCaptureReversed({
          admin,
          supabaseUrl,
          serviceRoleKey,
          existingBooking,
          bookingId,
          sessionId: session.id,
          amountPaid,
          currency: cancelCurrency,
          reasonKey: 'cancelled_checkout_refund',
          fieldBefore: 'Checkout completed after the hold was released',
          fieldAfter: 'Stripe payment automatically reversed — no booking',
        });
      } catch (refundErr) {
        const msg = refundErr instanceof Error ? refundErr.message : String(refundErr);
        if (!/already.?been.?refunded|charge_already_refunded/i.test(msg)) {
          throw refundErr;
        }
      }
    }
    await markProcessed('processed');
    return json({
      success: true,
      ignored: true,
      reason: 'checkout.session.completed for cancelled unpaid booking',
      cancelledRefunded,
      eventId: event.id,
      bookingId,
    });
  }
  if (existingPay === 'paid' || existingPay === 'refunded') {
    if (existingPay === 'paid') {
      const { error: earnErr } = await admin.rpc('record_paid_booking_earnings', {
        p_booking_id: bookingId,
      });
      if (earnErr) throw new Error(earnErr.message);
    }
    await markProcessed('processed');
    return json({
      success: true,
      duplicate: true,
      alreadyPaid: existingPay === 'paid',
      alreadyRefunded: existingPay === 'refunded',
      eventId: event.id,
      bookingId,
    });
  }

  if (paymentIntentId) {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge'],
    });
    const latest = pi.latest_charge;
    const latestCharge =
      latest && typeof latest === 'object' && !('deleted' in latest && (latest as { deleted?: boolean }).deleted)
        ? (latest as Stripe.Charge)
        : null;
    if (paidPromotionShouldRefuseFullyRefundedCharge(latestCharge)) {
      await admin
        .from('bookings')
        .update({
          payment_status: 'failed',
          payment_provider: 'stripe',
          payment_intent_id: paymentIntentId,
        })
        .eq('id', bookingId)
        .in('payment_status', ['pending', 'failed']);
      await admin.from('booking_payment_events').insert({
        booking_id: bookingId,
        event_id: event.id,
        event_type: 'refunded_before_promote',
        payment_intent_id: paymentIntentId,
        checkout_session_id: session.id,
        amount: amountPaid,
        currency: String(existingBooking?.currency || session.currency || 'eur').toUpperCase(),
        payload: {
          reason: 'charge_fully_refunded_before_paid_promotion',
          stripeEventType: event.type,
        },
      });
      // Phase 1720: charge already refunded before promote — email traveler.
      await notifyTravelerCheckoutCaptureReversed({
        admin,
        supabaseUrl,
        serviceRoleKey,
        existingBooking,
        bookingId,
        sessionId: session.id,
        amountPaid,
        currency: String(existingBooking?.currency || session.currency || 'eur').toUpperCase(),
        reasonKey: 'refunded_before_promote',
        fieldBefore: 'Checkout was charged but already fully refunded before confirmation',
        fieldAfter: 'Stripe payment reversed — no booking',
        ensureCancelled: true,
      });
      await markProcessed('processed');
      return json({
        success: true,
        ignored: true,
        reason: 'charge fully refunded before paid promotion',
        eventId: event.id,
        bookingId,
      });
    }

    // Request-to-Book: manual capture authorization — do not mark paid or capture.
    const piStatus = String(pi.status ?? '').toLowerCase();
    const captureMethod = String(pi.capture_method ?? '').toLowerCase();
    const metaRequest = String(session.metadata?.stay_request_to_book ?? pi.metadata?.stay_request_to_book ?? '') === '1';
    const isAuthorizedHold =
      piStatus === 'requires_capture' ||
      (captureMethod === 'manual' && piStatus !== 'succeeded' && metaRequest);
    if (isAuthorizedHold) {
      const amountAuthorized =
        amountToMajor(pi.amount_capturable ?? pi.amount ?? session.amount_total ?? null) ?? amountPaid;
      const currencyAuth = String(
        existingBooking?.currency || session.currency || pi.currency || 'eur'
      ).toUpperCase();
      const approvalExpiresAt = stayRequestApprovalExpiresAtIso();
      const { data: authPromote, error: authErr } = await admin.rpc('promote_authorized_checkout_booking', {
        p_booking_id: bookingId,
        p_checkout_session_id: session.id,
        p_payment_intent_id: paymentIntentId,
        p_amount_authorized: amountAuthorized,
        p_currency: currencyAuth,
        p_approval_expires_at: approvalExpiresAt,
        p_purchase_snapshot: existingBooking?.purchase_snapshot ?? null,
        p_assert_start_time: null,
        p_assert_booking_option_id:
          typeof existingBooking?.booking_option_id === 'string'
            ? existingBooking.booking_option_id
            : null,
      });
      if (authErr && isMissingPostgresFunctionError(authErr.message)) {
        throw new Error('Checkout authorize promotion guard unavailable');
      }
      const authOk =
        authPromote &&
        typeof authPromote === 'object' &&
        (authPromote as { ok?: boolean }).ok === true;
      if (!authOk) {
        const reason = String((authPromote as { reason?: string } | null)?.reason ?? authErr?.message ?? 'authorize_failed');
        // Inventory conflict on authorize: cancel the authorization (no capture occurred).
        if (/inventory|occupied|capacity|already booked/i.test(reason) || authErr?.message) {
          try {
            await stripe.paymentIntents.cancel(paymentIntentId as string, undefined, {
              idempotencyKey: `authorize-inventory-cancel:${session.id}`,
            });
          } catch {
            /* best-effort */
          }
        }
        await markProcessed('processed');
        return json({
          success: true,
          ignored: true,
          reason: `authorize promote failed: ${reason}`,
          eventId: event.id,
          bookingId,
        });
      }
      await admin.from('booking_payment_events').insert({
        booking_id: bookingId,
        event_id: event.id,
        event_type: 'stay_request_authorized',
        payment_intent_id: paymentIntentId,
        checkout_session_id: session.id,
        amount: amountAuthorized,
        currency: currencyAuth,
        payload: {
          approval_expires_at: approvalExpiresAt,
          stripeEventType: event.type,
        },
      });
      await notifyAuthorizedBookingSideEffects({
        admin,
        supabaseUrl,
        serviceRoleKey,
        bookingId,
        amountAuthorized,
        currency: currencyAuth,
        approvalExpiresAt,
      });
      await markProcessed('processed');
      return json({
        success: true,
        authorized: true,
        eventId: event.id,
        bookingId,
        approvalExpiresAt,
      });
    }
  }

  if (
    !checkoutPaidAmountAcceptable({
      amountPaid,
      bookingTotalAmount: existingBooking?.total_amount ?? null,
      quotedTotalMeta: session.metadata?.quoted_total ?? null,
    })
  ) {
    let underpayRefunded = false;
    if (
      rejectedCheckoutCaptureShouldRefund({
        sessionPaymentStatus: session.payment_status,
        paymentIntentId,
      })
    ) {
      try {
        await stripe.refunds.create(
          {
            payment_intent: paymentIntentId as string,
            reason: 'duplicate',
          },
          { idempotencyKey: `underpay-checkout-refund:${session.id}` }
        );
        underpayRefunded = true;
        const underpayCurrency = String(
          existingBooking?.currency || session.currency || 'eur'
        ).toUpperCase();
        await admin.from('booking_payment_events').insert({
          booking_id: bookingId,
          event_id: event.id,
          event_type: 'underpay_checkout_refund',
          payment_intent_id: paymentIntentId,
          checkout_session_id: session.id,
          amount: amountPaid,
          currency: underpayCurrency,
          payload: {
            reason: 'paid_amount_below_quote',
            amountPaid,
            bookingTotal: existingBooking?.total_amount ?? null,
            quotedTotalMeta: session.metadata?.quoted_total ?? null,
            stripeEventType: event.type,
          },
        });
        // Phase 1715: underpay capture reversed — email traveler.
        await notifyTravelerCheckoutCaptureReversed({
          admin,
          supabaseUrl,
          serviceRoleKey,
          existingBooking,
          bookingId,
          sessionId: session.id,
          amountPaid,
          currency: underpayCurrency,
          reasonKey: 'underpay_checkout_refund',
          fieldBefore: 'Checkout paid less than the quoted total',
          fieldAfter: 'Stripe payment automatically reversed — no booking',
          ensureCancelled: true,
        });
      } catch (refundErr) {
        const msg = refundErr instanceof Error ? refundErr.message : String(refundErr);
        if (!/already.?been.?refunded|charge_already_refunded/i.test(msg)) {
          throw refundErr;
        }
      }
    }
    await markProcessed('processed');
    return json({
      success: true,
      ignored: true,
      reason: 'checkout paid amount below quote',
      underpayRefunded,
      eventId: event.id,
      bookingId,
      amountPaid,
      bookingTotal: existingBooking?.total_amount ?? null,
    });
  }

  if (
    !checkoutPaidCurrencyMatches({
      sessionCurrency: session.currency,
      bookingCurrency: existingBooking?.currency ?? null,
    })
  ) {
    let currencyRefunded = false;
    if (
      rejectedCheckoutCaptureShouldRefund({
        sessionPaymentStatus: session.payment_status,
        paymentIntentId,
      })
    ) {
      try {
        await stripe.refunds.create(
          {
            payment_intent: paymentIntentId as string,
            reason: 'duplicate',
          },
          { idempotencyKey: `currency-checkout-refund:${session.id}` }
        );
        currencyRefunded = true;
        const mismatchCurrency = String(
          existingBooking?.currency || session.currency || 'eur'
        ).toUpperCase();
        await admin.from('booking_payment_events').insert({
          booking_id: bookingId,
          event_id: event.id,
          event_type: 'currency_mismatch_checkout_refund',
          payment_intent_id: paymentIntentId,
          checkout_session_id: session.id,
          amount: amountPaid,
          currency: mismatchCurrency,
          payload: {
            reason: 'paid_currency_mismatch',
            sessionCurrency: session.currency ?? null,
            bookingCurrency: existingBooking?.currency ?? null,
            stripeEventType: event.type,
          },
        });
        // Phase 1715: currency mismatch capture reversed — email traveler.
        await notifyTravelerCheckoutCaptureReversed({
          admin,
          supabaseUrl,
          serviceRoleKey,
          existingBooking,
          bookingId,
          sessionId: session.id,
          amountPaid,
          currency: mismatchCurrency,
          reasonKey: 'currency_mismatch_checkout_refund',
          fieldBefore: 'Checkout currency did not match the booking quote',
          fieldAfter: 'Stripe payment automatically reversed — no booking',
          ensureCancelled: true,
        });
      } catch (refundErr) {
        const msg = refundErr instanceof Error ? refundErr.message : String(refundErr);
        if (!/already.?been.?refunded|charge_already_refunded/i.test(msg)) {
          throw refundErr;
        }
      }
    }
    await markProcessed('processed');
    return json({
      success: true,
      ignored: true,
      reason: 'checkout currency does not match booking',
      currencyRefunded,
      eventId: event.id,
      bookingId,
      sessionCurrency: session.currency ?? null,
      bookingCurrency: existingBooking?.currency ?? null,
    });
  }

  const currency = String(existingBooking?.currency || session.currency || 'eur').toUpperCase();

  const listingId = String(existingBooking?.listing_id ?? '').trim();
  const bookingDate = String(existingBooking?.booking_date ?? '').trim();
  const guests = Number(existingBooking?.guests ?? 0);
  // Occupancy counting prefers purchase_snapshot.startTimeHm (mig 126). Assert must use the
  // same purchased slot — live start_time may have been ops-edited (Phase 1080).
  const startTimeHm =
    inventoryStartTimeHmFromBooking({
      start_time: typeof existingBooking?.start_time === 'string' ? existingBooking.start_time : null,
      purchase_snapshot: existingBooking?.purchase_snapshot,
    }) || '';
  const snapOptionId =
    existingBooking?.purchase_snapshot &&
    typeof existingBooking.purchase_snapshot === 'object' &&
    existingBooking.purchase_snapshot !== null &&
    typeof (existingBooking.purchase_snapshot as { optionId?: unknown }).optionId === 'string'
      ? String((existingBooking.purchase_snapshot as { optionId: string }).optionId).trim()
      : '';
  const bookingOptionId =
    String(existingBooking?.booking_option_id ?? '').trim() || snapOptionId || '';
  // Phase 1535: may be upgraded to quote-resolved option HM inside listing gate.
  let assertStartTimeHm = startTimeHm;
  if (listingId && bookingDate && Number.isFinite(guests) && guests >= 1) {
    // Phase 1284: stale Stripe completion must not promote after unpublish / season end
    // (create-booking-checkout-session 1278 parity).
    const { data: listingGate } = await admin
      .from('listings')
      .select('status, listing_extras')
      .eq('id', listingId)
      .maybeSingle();
    const listingStatus = String(listingGate?.status ?? '').trim();
    const seasonBookable = listingHasUpcomingBookableSeason(listingGate?.listing_extras);
    const listingStillBookable = listingStatus === 'published' && seasonBookable;
    if (!listingStillBookable) {
      let listingGateRefunded = false;
      if (
        rejectedCheckoutCaptureShouldRefund({
          sessionPaymentStatus: session.payment_status,
          paymentIntentId,
        })
      ) {
        try {
          await stripe.refunds.create(
            {
              payment_intent: paymentIntentId as string,
              reason: 'duplicate',
            },
            { idempotencyKey: `listing-unavailable-checkout-refund:${session.id}` }
          );
          listingGateRefunded = true;
          await admin.from('booking_payment_events').insert({
            booking_id: bookingId,
            event_id: event.id,
            event_type: 'listing_unavailable_checkout_refund',
            payment_intent_id: paymentIntentId,
            checkout_session_id: session.id,
            amount: amountPaid,
            currency,
            payload: {
              reason: 'listing_unavailable_on_paid_promotion',
              listingStatus: listingStatus || null,
              seasonBookable,
              stripeEventType: event.type,
            },
          });
          // Phase 1714: close hold + email (booking was never cancelled).
          await notifyTravelerCheckoutCaptureReversed({
            admin,
            supabaseUrl,
            serviceRoleKey,
            existingBooking,
            bookingId,
            sessionId: session.id,
            amountPaid,
            currency,
            reasonKey: 'listing_unavailable_checkout_refund',
            fieldBefore: 'Checkout completed after the listing left the live catalog',
            fieldAfter: 'Stripe payment automatically reversed — no booking',
            ensureCancelled: true,
          });
        } catch (refundErr) {
          const msg = refundErr instanceof Error ? refundErr.message : String(refundErr);
          if (!/already.?been.?refunded|charge_already_refunded/i.test(msg)) {
            throw refundErr;
          }
        }
      }
      await markProcessed('processed');
      return json({
        success: true,
        ignored: true,
        reason: 'listing unavailable on checkout.session.completed',
        inventoryRefunded: listingGateRefunded,
        eventId: event.id,
        bookingId,
      });
    }

    // Phase 1532/1533: hold can outlive departure cutoff — re-assert before paid promote
    // (1531 live-clock parity with quote). Resolve option.startTime when snapshot omitted time.
    const listingKindGate = listingKindFromExtras(listingGate?.listing_extras);
    const isStayListing = listingKindGate === 'stay';
    const isRentalListing = listingKindGate === 'rental';
    const cutoffStartTimeHm = isRentalListing
      ? null
      : resolveTourDepartureHmForCutoff({
          listingExtras: listingGate?.listing_extras,
          bookingDate,
          bookingOptionId,
          frozenStartTimeHm: startTimeHm,
        });
    // Phase 1535: inventory assert must use the same HM as cutoff (not day-wide null).
    // Rentals use interval holds — never apply tour departure cutoff.
    if (cutoffStartTimeHm) assertStartTimeHm = cutoffStartTimeHm;
    if (!isStayListing && !isRentalListing && cutoffStartTimeHm) {
      const extras =
        listingGate?.listing_extras && typeof listingGate.listing_extras === 'object'
          ? (listingGate.listing_extras as {
              bookingCutoffHoursBeforeStart?: unknown;
              departureTimezone?: unknown;
            })
          : null;
      const cut = assertDepartureStillBookable({
        bookingDate,
        startTimeHm: cutoffStartTimeHm,
        cutoffHoursBeforeStart: effectiveBookingCutoffHours({
          listingExtras: listingGate?.listing_extras,
          bookingOptionId,
          bookingDate,
          startTimeHm: cutoffStartTimeHm,
        }),
        nowMs: Date.now(),
        timeZone: resolveDepartureTimezone(extras?.departureTimezone),
      });
      if (!cut.ok) {
        let cutoffRefunded = false;
        if (
          rejectedCheckoutCaptureShouldRefund({
            sessionPaymentStatus: session.payment_status,
            paymentIntentId,
          })
        ) {
          try {
            await stripe.refunds.create(
              {
                payment_intent: paymentIntentId as string,
                reason: 'duplicate',
              },
              { idempotencyKey: `departure-cutoff-checkout-refund:${session.id}` }
            );
            cutoffRefunded = true;
            await admin.from('booking_payment_events').insert({
              booking_id: bookingId,
              event_id: event.id,
              event_type: 'departure_cutoff_checkout_refund',
              payment_intent_id: paymentIntentId,
              checkout_session_id: session.id,
              amount: amountPaid,
              currency,
              payload: {
                reason: 'departure_cutoff_on_paid_promotion',
                bookingDate,
                startTimeHm: cutoffStartTimeHm,
                cutoffError: cut.error,
                stripeEventType: event.type,
              },
            });
            // Phase 1714: cutoff race — hold outlived bookable window; reverse + email.
            await notifyTravelerCheckoutCaptureReversed({
              admin,
              supabaseUrl,
              serviceRoleKey,
              existingBooking,
              bookingId,
              sessionId: session.id,
              amountPaid,
              currency,
              reasonKey: 'departure_cutoff_checkout_refund',
              fieldBefore: 'Checkout completed after the departure booking window closed',
              fieldAfter: 'Stripe payment automatically reversed — no booking',
              ensureCancelled: true,
            });
          } catch (refundErr) {
            const msg = refundErr instanceof Error ? refundErr.message : String(refundErr);
            if (!/already.?been.?refunded|charge_already_refunded/i.test(msg)) {
              throw refundErr;
            }
          }
        }
        await markProcessed('processed');
        return json({
          success: true,
          ignored: true,
          reason: 'departure cutoff on checkout.session.completed',
          inventoryRefunded: cutoffRefunded,
          eventId: event.id,
          bookingId,
        });
      }
    }
    // Phase 1513: inventory assert runs inside promote_paid_checkout_booking with the
    // paid UPDATE so claim_pending cannot take the seat between assert and promote.
  }

  // Phase 1154: never confirm paid self-book (stale session from before 1146/1152).
  const guestUserId = String(existingBooking?.guest_user_id ?? '').trim();
  if (listingId && guestUserId) {
    const { data: listingOwn, error: listingOwnErr } = await admin
      .from('listings')
      .select('supplier_id')
      .eq('id', listingId)
      .maybeSingle();
    // Phase 1309: listing lookup failure must not skip self-book gates.
    if (listingOwnErr) {
      return json(
        {
          success: false,
          error: 'Could not verify self-book eligibility',
          reason: 'self_book_listing_lookup_failed',
          eventId: event.id,
          bookingId,
        },
        500
      );
    }
    const listingSupplierId = String(listingOwn?.supplier_id ?? '').trim();
    let isSelfBook =
      listingSupplierId.length > 0 && listingSupplierId === guestUserId;
    if (!isSelfBook && listingSupplierId) {
      const { data: teamSelf, error: teamSelfErr } = await admin
        .from('supplier_team_members')
        .select('user_id')
        .eq('supplier_id', listingSupplierId)
        .eq('user_id', guestUserId)
        .maybeSingle();
      // Phase 1308: team check failure must not promote a possible self-book to paid.
      if (teamSelfErr) {
        return json(
          {
            success: false,
            error: 'Could not verify self-book eligibility',
            reason: 'self_book_team_check_failed',
            eventId: event.id,
            bookingId,
          },
          500
        );
      }
      isSelfBook = Boolean(teamSelf?.user_id);
    }
    if (isSelfBook) {
      let selfBookRefunded = false;
      if (
        rejectedCheckoutCaptureShouldRefund({
          sessionPaymentStatus: session.payment_status,
          paymentIntentId,
        })
      ) {
        try {
          await stripe.refunds.create(
            {
              payment_intent: paymentIntentId as string,
              reason: 'requested_by_customer',
            },
            { idempotencyKey: `self-book-checkout-refund:${session.id}` }
          );
          selfBookRefunded = true;
          await admin.from('booking_payment_events').insert({
            booking_id: bookingId,
            event_id: event.id,
            event_type: 'self_book_checkout_refund',
            payment_intent_id: paymentIntentId,
            checkout_session_id: session.id,
            amount: amountPaid,
            currency,
            payload: {
              reason: 'supplier_self_book_on_paid_promotion',
              stripeEventType: event.type,
            },
          });
          // Phase 1714: self-book capture must not silently reverse without traveler notice.
          await notifyTravelerCheckoutCaptureReversed({
            admin,
            supabaseUrl,
            serviceRoleKey,
            existingBooking,
            bookingId,
            sessionId: session.id,
            amountPaid,
            currency,
            reasonKey: 'self_book_checkout_refund',
            fieldBefore: 'Checkout completed on your own listing',
            fieldAfter: 'Stripe payment automatically reversed — hosts cannot book themselves',
            ensureCancelled: true,
          });
        } catch (refundErr) {
          const msg = refundErr instanceof Error ? refundErr.message : String(refundErr);
          if (!/already.?been.?refunded|charge_already_refunded/i.test(msg)) {
            throw refundErr;
          }
        }
      }
      await markProcessed('processed');
      return json({
        success: true,
        ignored: true,
        reason: 'supplier self-book on checkout.session.completed',
        selfBookRefunded,
        eventId: event.id,
        bookingId,
      });
    }
  }

  // Phase 1325: freeze private stay check-in address only once payment is collected.
  // Phase 1535: also backfill missing purchase_snapshot.startTimeHm from assert HM.
  let purchaseSnapshotForPaid: Record<string, unknown> | null = null;
  const existingSnap = existingBooking?.purchase_snapshot;
  if (existingSnap && typeof existingSnap === 'object' && existingSnap !== null && listingId) {
    const snapObj = { ...(existingSnap as Record<string, unknown>) };
    let snapDirty = false;
    const alreadyHm =
      typeof snapObj.startTimeHm === 'string' ? snapObj.startTimeHm.trim().slice(0, 5) : '';
    if (!alreadyHm && assertStartTimeHm) {
      snapObj.startTimeHm = assertStartTimeHm;
      snapDirty = true;
    }
    const already = typeof snapObj.checkInAddress === 'string' ? snapObj.checkInAddress.trim() : '';
    if (!already) {
      const { data: listingForAddr } = await admin
        .from('listings')
        .select('listing_extras')
        .eq('id', listingId)
        .maybeSingle();
      const family =
        listingForAddr?.listing_extras &&
        typeof listingForAddr.listing_extras === 'object' &&
        (listingForAddr.listing_extras as { inventoryFamily?: unknown }).inventoryFamily === 'stay'
          ? 'stay'
          : listingKindFromExtras(listingForAddr?.listing_extras);
      if (family === 'stay') {
        const { data: priv } = await admin
          .from('listing_stay_private')
          .select('check_in_address')
          .eq('listing_id', listingId)
          .maybeSingle();
        const addr =
          priv && typeof (priv as { check_in_address?: unknown }).check_in_address === 'string'
            ? String((priv as { check_in_address: string }).check_in_address).trim().slice(0, 400)
            : '';
        if (addr) {
          snapObj.checkInAddress = addr;
          snapDirty = true;
        }
      }
    }
    const alreadyPhone =
      typeof snapObj.bookingContactPhoneE164 === 'string'
        ? snapObj.bookingContactPhoneE164.trim()
        : '';
    if (!alreadyPhone) {
      const { data: contactPriv } = await admin
        .from('listing_booking_contact')
        .select('phone_e164')
        .eq('listing_id', listingId)
        .maybeSingle();
      const phone =
        contactPriv && typeof (contactPriv as { phone_e164?: unknown }).phone_e164 === 'string'
          ? String((contactPriv as { phone_e164: string }).phone_e164).trim().slice(0, 24)
          : '';
      if (phone) {
        snapObj.bookingContactPhoneE164 = phone;
        snapDirty = true;
      }
    }
    if (snapDirty) purchaseSnapshotForPaid = snapObj;
  }

  // Phase 1513: assert inventory + mark paid in one DB transaction.
  // Phase 1535: p_assert_start_time uses quote-resolved HM when snapshot omitted time.
  const { data: promoteData, error: promoteErr } = await admin.rpc('promote_paid_checkout_booking', {
    p_booking_id: bookingId,
    p_checkout_session_id: session.id,
    p_payment_intent_id: paymentIntentId,
    p_amount_paid: amountPaid,
    p_currency: currency,
    p_paid_at: new Date().toISOString(),
    p_purchase_snapshot: purchaseSnapshotForPaid ?? null,
    p_assert_start_time: assertStartTimeHm || null,
    p_assert_booking_option_id: bookingOptionId || null,
  });

  if (promoteErr && isMissingPostgresFunctionError(promoteErr.message)) {
    throw new Error('Checkout paid promotion guard unavailable');
  }

  const promoteOutcome = promotePaidCheckoutOutcome(
    (promoteData ?? null) as { ok?: boolean; reason?: string } | null,
    promoteErr?.message ?? null
  );

  if (promoteOutcome.kind === 'inventory_conflict') {
    let inventoryRefunded = false;
    if (
      rejectedCheckoutCaptureShouldRefund({
        sessionPaymentStatus: session.payment_status,
        paymentIntentId,
      })
    ) {
      try {
        await stripe.refunds.create(
          {
            payment_intent: paymentIntentId as string,
            reason: 'duplicate',
          },
          { idempotencyKey: `inventory-conflict-checkout-refund:${session.id}` }
        );
        inventoryRefunded = true;
        await admin.from('booking_payment_events').insert({
          booking_id: bookingId,
          event_id: event.id,
          event_type: 'inventory_conflict_checkout_refund',
          payment_intent_id: paymentIntentId,
          checkout_session_id: session.id,
          amount: amountPaid,
          currency,
          payload: {
            reason: 'inventory_conflict_on_paid_promotion',
            inventoryError: promoteOutcome.message,
            stripeEventType: event.type,
          },
        });
        // Phase 1715: sold-out race — refund + email traveler.
        await notifyTravelerCheckoutCaptureReversed({
          admin,
          supabaseUrl,
          serviceRoleKey,
          existingBooking,
          bookingId,
          sessionId: session.id,
          amountPaid,
          currency,
          reasonKey: 'inventory_conflict_checkout_refund',
          fieldBefore: 'Checkout completed after this departure sold out',
          fieldAfter: 'Stripe payment automatically reversed — no booking',
          ensureCancelled: true,
        });
      } catch (refundErr) {
        const msg = refundErr instanceof Error ? refundErr.message : String(refundErr);
        if (/already.?been.?refunded|charge_already_refunded/i.test(msg)) {
          inventoryRefunded = true;
        } else {
          // Do not confirm the booking. Flag for retry/intervention; rethrow so webhook retries.
          await admin.from('booking_payment_events').insert({
            booking_id: bookingId,
            event_id: event.id,
            event_type: 'inventory_conflict_refund_failed',
            payment_intent_id: paymentIntentId,
            checkout_session_id: session.id,
            amount: amountPaid,
            currency,
            payload: {
              reason: 'inventory_conflict_refund_failed',
              inventoryError: promoteOutcome.message,
              refundError: msg,
              stripeEventType: event.type,
              needsIntervention: true,
            },
          });
          throw refundErr;
        }
      }
    }
    await markProcessed('processed');
    return json({
      success: true,
      ignored: true,
      reason: 'inventory conflict on checkout.session.completed',
      inventoryRefunded,
      eventId: event.id,
      bookingId,
    });
  }

  if (promoteOutcome.kind === 'rpc_error') {
    throw new Error(promoteOutcome.message);
  }

  if (promoteOutcome.kind !== 'promoted') {
    const { data: again } = await admin
      .from('bookings')
      .select('id, status, payment_status, checkout_session_id, payment_intent_id, currency')
      .eq('id', bookingId)
      .maybeSingle();
    const againPay = (again?.payment_status ?? '').toLowerCase();
    let unpromotedRefunded = false;
    if (
      promoteOutcome.kind === 'already_paid' ||
      promoteOutcome.kind === 'already_refunded' ||
      againPay === 'paid' ||
      againPay === 'refunded'
    ) {
      if (againPay === 'paid' || promoteOutcome.kind === 'already_paid') {
        const { error: earnErr } = await admin.rpc('record_paid_booking_earnings', {
          p_booking_id: bookingId,
        });
        if (earnErr) throw new Error(earnErr.message);
      }
      if (
        orphanSupersededCheckoutShouldRefund({
          sessionPaymentStatus: session.payment_status,
          eventPaymentIntentId: paymentIntentId,
          bookingPaymentIntentId: again?.payment_intent_id ?? null,
        })
      ) {
        try {
          await stripe.refunds.create(
            {
              payment_intent: paymentIntentId as string,
              reason: 'duplicate',
            },
            { idempotencyKey: `orphan-checkout-refund:${session.id}` }
          );
          unpromotedRefunded = true;
          await admin.from('booking_payment_events').insert({
            booking_id: bookingId,
            event_id: event.id,
            event_type: 'orphan_checkout_refund',
            payment_intent_id: paymentIntentId,
            checkout_session_id: session.id,
            amount: amountPaid,
            currency: String(again?.currency || session.currency || 'eur').toUpperCase(),
            payload: {
              reason: 'unpromoted_paid_update_orphan_pi',
              stripeEventType: event.type,
              promoteReason: promoteOutcome.kind,
            },
          });
          // Phase 1715: orphan PI on already-paid booking — email, do not cancel.
          await notifyTravelerCheckoutCaptureReversed({
            admin,
            supabaseUrl,
            serviceRoleKey,
            existingBooking,
            bookingId,
            sessionId: session.id,
            amountPaid,
            currency: String(again?.currency || session.currency || 'eur').toUpperCase(),
            reasonKey: 'orphan_checkout_refund_unpromoted',
            fieldBefore: 'An extra checkout payment was captured',
            fieldAfter: 'Stripe payment automatically reversed — your booking stays as already paid',
            ensureCancelled: false,
          });
        } catch (refundErr) {
          const msg = refundErr instanceof Error ? refundErr.message : String(refundErr);
          if (!/already.?been.?refunded|charge_already_refunded/i.test(msg)) {
            throw refundErr;
          }
        }
      }
      if ((againPay === 'paid' || promoteOutcome.kind === 'already_paid') && !unpromotedRefunded) {
        await notifyPaidBookingSideEffects({
          admin,
          supabaseUrl,
          serviceRoleKey,
          bookingId,
          amountPaid,
          currency: String(again?.currency || currency || 'eur').toUpperCase(),
        });
      }
      await markProcessed('processed');
      return json({
        success: true,
        duplicate: true,
        alreadyPaid: againPay === 'paid' || promoteOutcome.kind === 'already_paid',
        alreadyRefunded: againPay === 'refunded' || promoteOutcome.kind === 'already_refunded',
        orphanRefunded: unpromotedRefunded,
        eventId: event.id,
        bookingId,
      });
    }
    if (
      unpromotedCheckoutCaptureShouldRefund({
        sessionPaymentStatus: session.payment_status,
        paymentIntentId,
        bookingPaymentStatus: again?.payment_status ?? null,
      })
    ) {
      try {
        await stripe.refunds.create(
          {
            payment_intent: paymentIntentId as string,
            reason: 'duplicate',
          },
          { idempotencyKey: `unpromoted-checkout-refund:${session.id}` }
        );
        unpromotedRefunded = true;
        await admin.from('booking_payment_events').insert({
          booking_id: bookingId,
          event_id: event.id,
          event_type: 'unpromoted_checkout_refund',
          payment_intent_id: paymentIntentId,
          checkout_session_id: session.id,
          amount: amountPaid,
          currency: String(again?.currency || session.currency || 'eur').toUpperCase(),
          payload: {
            reason: 'paid_update_matched_zero_rows',
            bookingStatus: again?.status ?? null,
            bookingPaymentStatus: again?.payment_status ?? null,
            bookingCheckoutSessionId: again?.checkout_session_id ?? null,
            stripeEventType: event.type,
            promoteReason:
              promoteOutcome.kind === 'unpromoted' ? promoteOutcome.reason : promoteOutcome.kind,
          },
        });
        // Phase 1715: promote matched zero rows — reverse capture + email.
        await notifyTravelerCheckoutCaptureReversed({
          admin,
          supabaseUrl,
          serviceRoleKey,
          existingBooking,
          bookingId,
          sessionId: session.id,
          amountPaid,
          currency: String(again?.currency || session.currency || 'eur').toUpperCase(),
          reasonKey: 'unpromoted_checkout_refund',
          fieldBefore: 'Checkout completed but the booking could not be marked paid',
          fieldAfter: 'Stripe payment automatically reversed — no booking',
          ensureCancelled: true,
        });
      } catch (refundErr) {
        const msg = refundErr instanceof Error ? refundErr.message : String(refundErr);
        if (!/already.?been.?refunded|charge_already_refunded/i.test(msg)) {
          throw refundErr;
        }
      }
    }
    await markProcessed('processed');
    return json({
      success: true,
      ignored: true,
      reason: stripeWebhookCanMarkPaidFrom(againPay || existingPay)
        ? 'booking was not pending or failed'
        : 'booking was not pending',
      unpromotedRefunded,
      eventId: event.id,
      bookingId,
    });
  }

  await admin.from('booking_payment_events').insert({
    booking_id: bookingId,
    event_id: event.id,
    event_type: event.type,
    payment_intent_id: paymentIntentId,
    checkout_session_id: session.id,
    amount: amountPaid,
    currency,
    payload: event as unknown as Record<string, unknown>,
  });

  const { error: earnErr } = await admin.rpc('record_paid_booking_earnings', {
    p_booking_id: bookingId,
  });
  if (earnErr) throw new Error(earnErr.message);

  await notifyPaidBookingSideEffects({
    admin,
    supabaseUrl,
    serviceRoleKey,
    bookingId,
    amountPaid,
    currency,
  });

  await markProcessed('processed');
  return json({ success: true, eventId: event.id, bookingId, status: 'paid' });
}

