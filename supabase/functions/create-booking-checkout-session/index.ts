// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';

type RequestBody = {
  listingId: string;
  listingTitle?: string;
  bookingDate: string;
  guests: number;
  customerName?: string;
  customerPhone?: string;
  specialRequests?: string;
  totalAmount: number;
  currency?: string;
  successPath?: string;
  cancelPath?: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function sanitizePath(path: string | undefined, fallback: string): string {
  const raw = (path ?? '').trim();
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  return raw;
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
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    const publicSiteUrl = (Deno.env.get('PUBLIC_SITE_URL') ?? 'http://localhost:5173').replace(/\/$/, '');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return json({ success: false, error: 'Supabase env missing' }, 500);
    }
    if (!stripeSecret) return json({ success: false, error: 'STRIPE_SECRET_KEY not configured' }, 500);

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
    const email = user.email?.trim().toLowerCase() ?? '';
    if (!email) return json({ success: false, error: 'Signed-in account has no email' }, 400);

    const body = (await req.json()) as Partial<RequestBody>;
    const listingId = String(body.listingId ?? '').trim();
    const listingTitle = String(body.listingTitle ?? 'Experience').trim() || 'Experience';
    const bookingDate = String(body.bookingDate ?? '').trim();
    const guests = Number(body.guests ?? 0);
    const customerName = String(body.customerName ?? '').trim();
    const customerPhone = String(body.customerPhone ?? '').trim();
    const specialRequests = String(body.specialRequests ?? '').trim();
    const totalAmount = Number(body.totalAmount ?? NaN);
    const currency = String(body.currency ?? 'USD').trim().toUpperCase() || 'USD';
    const successPath = sanitizePath(body.successPath, '/bookings?payment=success');
    const cancelPath = sanitizePath(body.cancelPath, '/bookings?payment=cancelled');

    if (!listingId) return json({ success: false, error: 'listingId is required' }, 400);
    if (!bookingDate || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
      return json({ success: false, error: 'bookingDate must be YYYY-MM-DD' }, 400);
    }
    if (!Number.isFinite(guests) || guests < 1 || guests > 99) {
      return json({ success: false, error: 'guests must be between 1 and 99' }, 400);
    }
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return json({ success: false, error: 'totalAmount must be > 0' }, 400);
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: inserted, error: insertError } = await admin
      .from('bookings')
      .insert({
        listing_id: listingId,
        guest_email: email,
        guest_name: customerName || null,
        guests,
        booking_date: bookingDate,
        status: 'pending',
        special_requests: [customerPhone ? `Guest phone: ${customerPhone}` : '', specialRequests]
          .filter(Boolean)
          .join('\n\n') || null,
        total_amount: totalAmount,
        currency,
        guest_user_id: user.id,
        payment_status: 'pending',
        payment_provider: 'stripe',
      })
      .select('id')
      .single();

    if (insertError || !inserted?.id) {
      return json({ success: false, error: insertError?.message ?? 'Could not create booking' }, 500);
    }

    const stripe = new Stripe(stripeSecret);
    const amountMinor = Math.round(totalAmount * 100);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      success_url: `${publicSiteUrl}${successPath}${successPath.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicSiteUrl}${cancelPath}`,
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: amountMinor,
            product_data: {
              name: listingTitle,
              description: `${bookingDate} · ${guests} ${guests === 1 ? 'guest' : 'guests'}`,
            },
          },
        },
      ],
      metadata: {
        booking_id: inserted.id,
        listing_id: listingId,
        user_id: user.id,
      },
      payment_intent_data: {
        metadata: {
          booking_id: inserted.id,
          listing_id: listingId,
          user_id: user.id,
        },
      },
    });

    const { error: updateError } = await admin
      .from('bookings')
      .update({ checkout_session_id: session.id })
      .eq('id', inserted.id);
    if (updateError) {
      return json({ success: false, error: 'Checkout created but booking update failed' }, 500);
    }

    return json({
      success: true,
      bookingId: inserted.id,
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
    });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
