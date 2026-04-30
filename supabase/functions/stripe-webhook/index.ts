// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';

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

    // Idempotency guard: if event id already exists, ignore safely.
    const { error: lockErr } = await admin.from('stripe_webhook_events').insert({
      id: event.id,
      event_type: event.type,
      status: 'received',
    });
    if (lockErr) {
      if ((lockErr as any).code === '23505') {
        return json({ success: true, duplicate: true, eventId: event.id });
      }
      return json({ success: false, error: lockErr.message }, 500);
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
        const currency = (session.currency ?? 'usd').toUpperCase();

        const { error: bookingErr } = await admin
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
          .eq('id', bookingId);
        if (bookingErr) throw new Error(bookingErr.message);

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

        await markProcessed('processed');
        return json({ success: true, eventId: event.id, bookingId, status: 'paid' });
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

        const { error: bookingErr } = await admin
          .from('bookings')
          .update({
            payment_status: 'failed',
            payment_provider: 'stripe',
            payment_intent_id: paymentIntentId,
          })
          .eq('id', bookingId);
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

      await markProcessed('ignored', `Unhandled event type: ${event.type}`);
      return json({ success: true, ignored: true, eventType: event.type });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown processing error';
      await markProcessed('failed', msg);
      return json({ success: false, error: msg }, 500);
    }
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
