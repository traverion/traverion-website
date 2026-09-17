// Shared paid-promotion path for stripe-webhook + reconcile-checkout-session.
import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { staleCheckoutFailureShouldApply, stripeWebhookCanMarkPaidFrom } from './checkout-resume.ts';
import { isCheckoutInventoryConflictError } from './checkout-inventory-conflict.ts';
import { checkoutPaidAmountAcceptable, checkoutPaidCurrencyMatches, rejectedCheckoutCaptureShouldRefund, unpromotedCheckoutCaptureShouldRefund } from './checkout-paid-amount.ts';
import { orphanSupersededCheckoutShouldRefund } from './orphan-checkout-refund.ts';
import {
  cancelledCheckoutCaptureShouldRefund,
  cancelledUnpaidBookingBlocksCheckoutPaid,
} from './cancelled-booking-checkout.ts';
import { paidPromotionShouldRefuseFullyRefundedCharge } from './stripe-charge-refund.ts';

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
    .select('supplier_id, title')
    .eq('id', booking.listing_id)
    .maybeSingle();

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
          listingTitle: listing?.title ?? 'Experience',
          bookingId,
          bookingDate: booking.booking_date ?? undefined,
          guests: Number(booking.guests ?? 0),
          totalAmount: amountPaid ?? undefined,
          currency,
          emailKind: 'booking_confirmed_paid',
          publicSiteUrl: portalBase,
          paidAtIso,
          paymentIntentId,
          bookingNumber: orderNum,
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
      'id, status, payment_status, currency, total_amount, checkout_session_id, payment_intent_id, listing_id, booking_date, guests, check_out'
    )
    .eq('id', bookingId)
    .maybeSingle();
  let existingBooking = withStay.data as Record<string, unknown> | null;
  if (withStay.error && /check_out/i.test(withStay.error.message)) {
    const fallback = await admin
      .from('bookings')
      .select(
        'id, status, payment_status, currency, total_amount, checkout_session_id, payment_intent_id, listing_id, booking_date, guests'
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
  const checkOutRaw = String(existingBooking?.check_out ?? '').trim();
  if (listingId && bookingDate && Number.isFinite(guests) && guests >= 1) {
    const { error: inventoryErr } = await admin.rpc('assert_checkout_inventory', {
      p_listing_id: listingId,
      p_check_in: bookingDate,
      p_guests: guests,
      p_check_out: checkOutRaw || null,
      p_exclude_booking_id: bookingId,
    });
    if (
      inventoryErr &&
      !/could not find the function|schema cache/i.test(inventoryErr.message) &&
      isCheckoutInventoryConflictError(inventoryErr.message)
    ) {
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
              inventoryError: inventoryErr.message,
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
    if (
      inventoryErr &&
      !/could not find the function|schema cache/i.test(inventoryErr.message) &&
      !isCheckoutInventoryConflictError(inventoryErr.message)
    ) {
      throw new Error(inventoryErr.message);
    }
  }

  let paidUpdate = admin
    .from('bookings')
    .update({
      status: 'confirmed',
      payment_status: 'paid',
      payment_provider: 'stripe',
      checkout_session_id: session.id,
      payment_intent_id: paymentIntentId,
      amount_paid: amountPaid,
      currency,
      paid_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .in('payment_status', ['pending', 'failed'])
    .neq('status', 'cancelled');
  const currentCheckoutSessionId = String(existingBooking?.checkout_session_id ?? '').trim();
  if (currentCheckoutSessionId) {
    paidUpdate = paidUpdate.eq('checkout_session_id', session.id);
  }
  const { data: paidRows, error: bookingErr } = await paidUpdate.select('id');
  if (bookingErr) throw new Error(bookingErr.message);
  if ((paidRows ?? []).length === 0) {
    const { data: again } = await admin
      .from('bookings')
      .select('id, status, payment_status, checkout_session_id, payment_intent_id, currency')
      .eq('id', bookingId)
      .maybeSingle();
    const againPay = (again?.payment_status ?? '').toLowerCase();
    let unpromotedRefunded = false;
    if (againPay === 'paid' || againPay === 'refunded') {
      if (againPay === 'paid') {
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
        duplicate: true,
        alreadyPaid: againPay === 'paid',
        alreadyRefunded: againPay === 'refunded',
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

