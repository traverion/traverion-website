// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
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

async function incrementAvailabilityBookedAdmin(
  admin: SupabaseClient,
  listingId: string,
  bookingDate: string | null
) {
  if (!bookingDate) return;
  const { data: row } = await admin
    .from('listing_availability')
    .select('booked')
    .eq('listing_id', listingId)
    .eq('available_date', bookingDate)
    .maybeSingle();
  if (!row) return;
  await admin
    .from('listing_availability')
    .update({ booked: (row.booked ?? 0) + 1 })
    .eq('listing_id', listingId)
    .eq('available_date', bookingDate);
}

/** Supplier + traveler emails after paid checkout (same as legacy submitBooking flow). */
async function notifyPaidBookingSideEffects(params: {
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

  const { data: booking } = await admin
    .from('bookings')
    .select('listing_id, booking_date, guests, guest_name, guest_email')
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking?.listing_id) return;

  await incrementAvailabilityBookedAdmin(admin, booking.listing_id, booking.booking_date ?? null);

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
        }),
      });
    } catch {
      /* non-fatal */
    }
  }

  const guestEmail = (booking.guest_email ?? '').trim().toLowerCase();
  if (guestEmail) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/notify-customer-booking`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerEmail: guestEmail,
          customerName: booking.guest_name ?? undefined,
          listingTitle: listing?.title ?? 'Experience',
          bookingId,
          bookingDate: booking.booking_date ?? undefined,
          guests: Number(booking.guests ?? 0),
          totalAmount: amountPaid ?? undefined,
          currency,
        }),
      });
    } catch {
      /* non-fatal */
    }
  }
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
