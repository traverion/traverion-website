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
import { listingHasUpcomingBookableSeason, resolveTourDepartureHmForCutoff } from './booking-quote.ts';
import {
  assertDepartureStillBookable,
  normalizeBookingCutoffHours,
  resolveDepartureTimezone,
} from './tour-departure-cutoff.ts';

function listingKindFromExtras(extras: unknown): 'stay' | 'tour' {
  if (extras && typeof extras === 'object') {
    const family = (extras as { inventoryFamily?: unknown }).inventoryFamily;
    if (family === 'stay') return 'stay';
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

export async function notifyPaidBookingSideEffects(params: {
  admin: SupabaseClient;
  supabaseUrl: string;
  serviceRoleKey: string;
  bookingId: string;
  amountPaid: number | null;
  currency: string;
}) {
  const { admin, supabaseUrl, serviceRoleKey, bookingId, amountPaid, currency } = params;
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: anon || serviceRoleKey,
  };

  const b = booking as Record<string, unknown>;
  const bn = b.booking_number;
  const orderNum = typeof bn === 'number' && Number.isFinite(bn) ? Math.floor(bn) : undefined;
  const paidAtIso = typeof booking.paid_at === 'string' ? booking.paid_at : undefined;
  const paymentIntentId =
    typeof booking.payment_intent_id === 'string' ? booking.payment_intent_id : undefined;

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
          guests: Number(booking.guests ?? 0),
          guestName: booking.guest_name ?? undefined,
          portalBaseUrl: portalBase,
          bookingPaymentStatus: 'paid',
          bookingNumber: orderNum,
        }),
      });
    } catch {
      /* non-fatal */
    }
  }

  if (guestEmailResolved) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/notify-customer-booking`, {
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
    } catch {
      /* non-fatal */
    }
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
      'id, status, payment_status, currency, total_amount, checkout_session_id, payment_intent_id, listing_id, booking_date, guests, check_out, start_time, purchase_snapshot, booking_option_id, guest_user_id'
    )
    .eq('id', bookingId)
    .maybeSingle();
  let existingBooking = withStay.data as Record<string, unknown> | null;
  if (withStay.error && /check_out|start_time|purchase_snapshot|booking_option_id|guest_user_id/i.test(withStay.error.message)) {
    const fallback = await admin
      .from('bookings')
      .select(
        'id, status, payment_status, currency, total_amount, checkout_session_id, payment_intent_id, listing_id, booking_date, guests, check_out, start_time, guest_user_id'
      )
      .eq('id', bookingId)
      .maybeSingle();
    existingBooking = fallback.data as Record<string, unknown> | null;
  } else if (withStay.error) {
    throw new Error(withStay.error.message);
  }
  const existingPay = String(existingBooking?.payment_status ?? '').toLowerCase();
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
      await markProcessed('processed');
      return json({
        success: true,
        ignored: true,
        reason: 'charge fully refunded before paid promotion',
        eventId: event.id,
        bookingId,
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
    const isStayListing = listingKindFromExtras(listingGate?.listing_extras) === 'stay';
    const cutoffStartTimeHm = resolveTourDepartureHmForCutoff({
      listingExtras: listingGate?.listing_extras,
      bookingDate,
      bookingOptionId,
      frozenStartTimeHm: startTimeHm,
    });
    // Phase 1535: inventory assert must use the same HM as cutoff (not day-wide null).
    if (cutoffStartTimeHm) assertStartTimeHm = cutoffStartTimeHm;
    if (!isStayListing && cutoffStartTimeHm) {
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
        cutoffHoursBeforeStart: normalizeBookingCutoffHours(extras?.bookingCutoffHoursBeforeStart),
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

