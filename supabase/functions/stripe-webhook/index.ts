// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { stripeWebhookReplayDecision } from '../_shared/stripe-webhook-replay.ts';
import { isStripeChargeFullyRefunded, refundBeforePaidShouldMarkFailed } from '../_shared/stripe-charge-refund.ts';
import { staleCheckoutFailureShouldApply } from '../_shared/checkout-resume.ts';
import { paymentIntentSucceededShouldPromote } from '../_shared/checkout-pi-succeeded.ts';
import { promotePaidFromCheckoutSession } from '../_shared/promote-paid-from-checkout.ts';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
      },
    });
  }
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!supabaseUrl || !serviceRoleKey) return json({ success: false, error: 'Supabase env missing' }, 500);
    if (!stripeSecret) return json({ success: false, error: 'STRIPE_SECRET_KEY not configured' }, 500);
    if (!stripeWebhookSecret) return json({ success: false, error: 'STRIPE_WEBHOOK_SECRET not configured' }, 500);

    const signature = req.headers.get('stripe-signature');
    if (!signature) return json({ success: false, error: 'Missing stripe-signature header' }, 400);

    const rawBody = await req.text();
    const stripe = new Stripe(stripeSecret);

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, stripeWebhookSecret);
    } catch (err) {
      return json({ success: false, error: `Invalid signature: ${err instanceof Error ? err.message : 'unknown'}` }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Idempotency: first delivery inserts; retries must not 200-ack failed/stale rows
    // or Stripe stops retrying and paid/refund side-effects never finish.
    const { error: lockErr } = await admin.from('stripe_webhook_events').insert({
      id: event.id,
      event_type: event.type,
      status: 'received',
    });
    if (lockErr) {
      if ((lockErr as any).code !== '23505') {
        return json({ success: false, error: lockErr.message }, 500);
      }

      const { data: existing, error: existingErr } = await admin
        .from('stripe_webhook_events')
        .select('id, status, received_at')
        .eq('id', event.id)
        .maybeSingle();
      if (existingErr) {
        return json({ success: false, error: existingErr.message }, 500);
      }

      const decision = stripeWebhookReplayDecision({
        status: existing?.status,
        receivedAt: existing?.received_at ?? null,
      });

      if (decision === 'terminal') {
        return json({
          success: true,
          duplicate: true,
          eventId: event.id,
          status: existing?.status ?? null,
        });
      }

      if (decision === 'in_flight') {
        // Still being processed by the first delivery — ask Stripe to retry later.
        return json(
          {
            success: false,
            error: 'Webhook event still processing',
            eventId: event.id,
            status: existing?.status ?? null,
          },
          503
        );
      }

      if (decision !== 'claim') {
        return json(
          {
            success: false,
            error: `Unexpected webhook event status: ${existing?.status ?? 'missing'}`,
            eventId: event.id,
          },
          500
        );
      }

      const claimFilter =
        String(existing?.status ?? '').toLowerCase() === 'failed'
          ? { column: 'status' as const, value: 'failed' }
          : { column: 'status' as const, value: 'received' };

      const { data: claimed, error: claimErr } = await admin
        .from('stripe_webhook_events')
        .update({
          status: 'received',
          error_message: null,
          processed_at: null,
          received_at: new Date().toISOString(),
          event_type: event.type,
        })
        .eq('id', event.id)
        .eq(claimFilter.column, claimFilter.value)
        .select('id');
      if (claimErr) {
        return json({ success: false, error: claimErr.message }, 500);
      }
      if ((claimed ?? []).length === 0) {
        const { data: again } = await admin
          .from('stripe_webhook_events')
          .select('status')
          .eq('id', event.id)
          .maybeSingle();
        if (stripeWebhookReplayDecision({ status: again?.status, receivedAt: null }) === 'terminal') {
          return json({
            success: true,
            duplicate: true,
            eventId: event.id,
            status: again?.status ?? null,
          });
        }
        return json(
          {
            success: false,
            error: 'Could not claim webhook event for replay',
            eventId: event.id,
            status: again?.status ?? null,
          },
          503
        );
      }
      // Claimed failed/stale row — fall through and re-run handlers (booking updates stay idempotent).
    }

    const markProcessed = async (status: 'processed' | 'ignored' | 'failed', errorMessage?: string) => {
      await admin
        .from('stripe_webhook_events')
        .update({
          processed_at: new Date().toISOString(),
          status,
          error_message: errorMessage ?? null,
        })
        .eq('id', event.id);
    };

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        return await promotePaidFromCheckoutSession({ admin, stripe, session, event, markProcessed, supabaseUrl, serviceRoleKey });
      }

      if (event.type === 'payment_intent.succeeded') {
        const pi = event.data.object as Stripe.PaymentIntent;
        const bookingId = pi.metadata?.booking_id ?? null;
        if (
          !paymentIntentSucceededShouldPromote({
            status: pi.status,
            bookingId,
          })
        ) {
          await markProcessed(
            'ignored',
            pi.status !== 'succeeded' ? 'PaymentIntent not succeeded' : 'Missing booking_id metadata'
          );
          return json({
            success: true,
            ignored: true,
            reason:
              pi.status !== 'succeeded' ? 'payment_intent not succeeded' : 'missing booking metadata',
          });
        }
        const listed = await stripe.checkout.sessions.list({ payment_intent: pi.id, limit: 1 });
        const session = listed.data[0] ?? null;
        if (!session) {
          await markProcessed('ignored', 'No Checkout session for PaymentIntent');
          return json({
            success: true,
            ignored: true,
            reason: 'no checkout session for payment_intent',
            bookingId,
          });
        }
        return await promotePaidFromCheckoutSession({
          admin,
          stripe,
          session,
          event,
          markProcessed,
          supabaseUrl,
          serviceRoleKey,
        });
      }

      if (event.type === 'payment_intent.payment_failed') {
        const pi = event.data.object as Stripe.PaymentIntent;
        const bookingId = pi.metadata?.booking_id ?? null;
        if (!bookingId) {
          await markProcessed('ignored', 'Missing booking_id metadata');
          return json({ success: true, ignored: true, reason: 'missing booking metadata' });
        }

        const amount = amountToMajor(pi.amount ?? null);
        const currency = (pi.currency ?? 'usd').toUpperCase();
        const paymentIntentId = pi.id;

        const { data: failedBooking } = await admin
          .from('bookings')
          .select('id, payment_status, checkout_session_id, payment_intent_id')
          .eq('id', bookingId)
          .maybeSingle();
        if ((failedBooking?.payment_status ?? '').toLowerCase() === 'paid') {
          await markProcessed('processed');
          return json({ success: true, ignored: true, alreadyPaid: true, bookingId });
        }
        if (
          !staleCheckoutFailureShouldApply({
            eventPaymentIntentId: paymentIntentId,
            bookingCheckoutSessionId: failedBooking?.checkout_session_id ?? null,
            bookingPaymentIntentId: failedBooking?.payment_intent_id ?? null,
          })
        ) {
          await markProcessed('processed');
          return json({
            success: true,
            ignored: true,
            reason: 'stale payment_intent failure for superseded checkout',
            eventId: event.id,
            bookingId,
          });
        }
        const { error: bookingErr } = await admin
          .from('bookings')
          .update({
            payment_status: 'failed',
            payment_provider: 'stripe',
            payment_intent_id: paymentIntentId,
          })
          .eq('id', bookingId)
          .eq('payment_status', 'pending');
        if (bookingErr) throw new Error(bookingErr.message);

        await admin.from('booking_payment_events').insert({
          booking_id: bookingId,
          event_id: event.id,
          event_type: event.type,
          payment_intent_id: paymentIntentId,
          amount,
          currency,
          payload: event as unknown as Record<string, unknown>,
        });

        await markProcessed('processed');
        return json({ success: true, eventId: event.id, bookingId, status: 'failed' });
      }

      if (event.type === 'checkout.session.expired') {
        const session = event.data.object as Stripe.Checkout.Session;
        const bookingId = session.metadata?.booking_id ?? null;
        let row: {
          id: string;
          payment_status: string | null;
          checkout_session_id?: string | null;
          payment_intent_id?: string | null;
        } | null = null;
        if (bookingId) {
          const found = await admin
            .from('bookings')
            .select('id, payment_status, checkout_session_id, payment_intent_id')
            .eq('id', bookingId)
            .maybeSingle();
          row = found.data;
        }
        if (!row && session.id) {
          const found = await admin
            .from('bookings')
            .select('id, payment_status, checkout_session_id, payment_intent_id')
            .eq('checkout_session_id', session.id)
            .maybeSingle();
          row = found.data;
        }
        if (!row) {
          await markProcessed('ignored', 'Expired session had no matching pending booking');
          return json({ success: true, ignored: true, reason: 'no booking for expired session' });
        }
        if ((row.payment_status ?? '').toLowerCase() === 'paid') {
          await markProcessed('processed');
          return json({ success: true, ignored: true, alreadyPaid: true, bookingId: row.id });
        }
        if ((row.payment_status ?? '').toLowerCase() !== 'pending') {
          await markProcessed('processed');
          return json({ success: true, duplicate: true, bookingId: row.id, status: row.payment_status });
        }
        if (
          !staleCheckoutFailureShouldApply({
            eventCheckoutSessionId: session.id,
            bookingCheckoutSessionId: row.checkout_session_id ?? null,
            bookingPaymentIntentId: row.payment_intent_id ?? null,
          })
        ) {
          await markProcessed('processed');
          return json({
            success: true,
            ignored: true,
            reason: 'stale checkout.session.expired for superseded session',
            eventId: event.id,
            bookingId: row.id,
          });
        }
        const { error: expireErr } = await admin
          .from('bookings')
          .update({ payment_status: 'failed' })
          .eq('id', row.id)
          .eq('payment_status', 'pending');
        if (expireErr) throw new Error(expireErr.message);
        await admin.from('booking_payment_events').insert({
          booking_id: row.id,
          event_id: event.id,
          event_type: event.type,
          checkout_session_id: session.id,
          payload: event as unknown as Record<string, unknown>,
        });
        await markProcessed('processed');
        return json({ success: true, eventId: event.id, bookingId: row.id, status: 'expired' });
      }

      if (event.type === 'charge.refunded') {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id ?? null;
        if (!paymentIntentId) {
          await markProcessed('ignored', 'Refunded charge missing payment_intent');
          return json({ success: true, ignored: true, reason: 'no payment intent' });
        }

        let booking: {
          id: string;
          payment_status: string | null;
          listing_id?: string | null;
          booking_date?: string | null;
          check_out?: string | null;
          guests?: number | null;
        } | null = null;
        const byPi = await admin
          .from('bookings')
          .select('id, payment_status, listing_id, booking_date, check_out, guests')
          .eq('payment_intent_id', paymentIntentId)
          .maybeSingle();
        booking = byPi.data;
        if (!booking) {
          let metaBookingId = String(charge.metadata?.booking_id ?? '').trim();
          if (!metaBookingId) {
            try {
              const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
              metaBookingId = String(pi.metadata?.booking_id ?? '').trim();
            } catch {
              /* ignore */
            }
          }
          if (metaBookingId) {
            const byMeta = await admin
              .from('bookings')
              .select('id, payment_status, listing_id, booking_date, check_out, guests')
              .eq('id', metaBookingId)
              .maybeSingle();
            booking = byMeta.data;
          }
        }
        if (!booking) {
          await markProcessed('ignored', 'Refunded charge had no matching booking');
          return json({ success: true, ignored: true, reason: 'no booking' });
        }
        if ((booking.payment_status ?? '').toLowerCase() === 'refunded') {
          await markProcessed('processed');
          return json({ success: true, duplicate: true, alreadyRefunded: true, bookingId: booking.id });
        }

        const refundAmount = amountToMajor(charge.amount_refunded ?? charge.amount ?? null);
        const currency = (charge.currency ?? 'eur').toUpperCase();
        const fullyRefunded = isStripeChargeFullyRefunded(charge);

        if (
          refundBeforePaidShouldMarkFailed({
            bookingPaymentStatus: booking.payment_status,
            fullyRefunded,
          })
        ) {
          const { error: failErr } = await admin
            .from('bookings')
            .update({
              payment_status: 'failed',
              payment_provider: 'stripe',
              payment_intent_id: paymentIntentId,
            })
            .eq('id', booking.id)
            .in('payment_status', ['pending', 'failed']);
          if (failErr) throw new Error(failErr.message);
          await admin.from('booking_payment_events').insert({
            booking_id: booking.id,
            event_id: event.id,
            event_type: event.type,
            payment_intent_id: paymentIntentId,
            amount: refundAmount,
            currency,
            payload: {
              ...(event as unknown as Record<string, unknown>),
              reason: 'full_refund_before_paid_promotion',
            },
          });
          await markProcessed('processed');
          return json({
            success: true,
            eventId: event.id,
            bookingId: booking.id,
            status: 'failed',
            fullyRefunded: true,
            refundBeforePaid: true,
          });
        }

        if ((booking.payment_status ?? '').toLowerCase() !== 'paid') {
          await markProcessed('processed');
          return json({ success: true, ignored: true, reason: 'booking was not paid', bookingId: booking.id });
        }

        // Partial refunds must not flip payment_status or release inventory.
        if (!fullyRefunded) {
          await admin.from('booking_payment_events').insert({
            booking_id: booking.id,
            event_id: event.id,
            event_type: event.type,
            payment_intent_id: paymentIntentId,
            amount: refundAmount,
            currency,
            payload: event as unknown as Record<string, unknown>,
          });
          await markProcessed('processed');
          return json({
            success: true,
            eventId: event.id,
            bookingId: booking.id,
            status: 'partial_refund_recorded',
            fullyRefunded: false,
            amountRefunded: refundAmount,
          });
        }

        const { data: refundedRows, error: refundErr } = await admin
          .from('bookings')
          .update({ payment_status: 'refunded' })
          .eq('id', booking.id)
          .eq('payment_status', 'paid')
          .select('id');
        if (refundErr) throw new Error(refundErr.message);
        if ((refundedRows ?? []).length > 0) {
          // Occupancy releases via payment_status=refunded (paid+holds rules). Do not mutate .booked.
          const { error: reverseErr } = await admin.rpc('reverse_paid_booking_earnings', {
            p_booking_id: booking.id,
          });
          if (reverseErr) throw new Error(reverseErr.message);
        }
        await admin.from('booking_payment_events').insert({
          booking_id: booking.id,
          event_id: event.id,
          event_type: event.type,
          payment_intent_id: paymentIntentId,
          amount: refundAmount,
          currency,
          payload: event as unknown as Record<string, unknown>,
        });
        await markProcessed('processed');
        return json({
          success: true,
          eventId: event.id,
          bookingId: booking.id,
          status: 'refunded',
          fullyRefunded: true,
        });
      }

      await markProcessed('ignored', `Unhandled event type: ${event.type}`);
      return json({ success: true, ignored: true, eventType: event.type });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown processing error';
      console.error(
        JSON.stringify({
          source: 'stripe-webhook',
          eventId: event.id,
          eventType: event.type,
          error: msg,
        })
      );
      await markProcessed('failed', msg);
      return json({ success: false, error: msg }, 500);
    }
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
