// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';

type RequestBody = {
  bookingId?: string;
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
    const bookingId = String(body.bookingId ?? '').trim();
    let listingId = String(body.listingId ?? '').trim();
    let listingTitle = String(body.listingTitle ?? 'Experience').trim() || 'Experience';
    let bookingDate = String(body.bookingDate ?? '').trim();
    let guests = Number(body.guests ?? 0);
    const customerName = String(body.customerName ?? '').trim();
    const customerPhone = String(body.customerPhone ?? '').trim();
    const specialRequests = String(body.specialRequests ?? '').trim();
    let totalAmount = Number(body.totalAmount ?? NaN);
    let currency = String(body.currency ?? 'USD').trim().toUpperCase() || 'USD';
    const successPath = sanitizePath(body.successPath, '/booking-confirmed');
    const cancelPath = sanitizePath(body.cancelPath, '/bookings?payment=cancelled');

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    let targetBookingId = bookingId;

    if (targetBookingId) {
      const { data: existing, error: existingError } = await admin
        .from('bookings')
        .select('id, listing_id, guest_email, guest_user_id, guest_name, guests, booking_date, status, payment_status, total_amount, currency')
        .eq('id', targetBookingId)
        .maybeSingle();
      if (existingError) return json({ success: false, error: existingError.message }, 500);
      if (!existing) return json({ success: false, error: 'Booking not found' }, 404);
      const ownerEmail = (existing.guest_email ?? '').trim().toLowerCase();
      const ownsByEmail = ownerEmail.length > 0 && ownerEmail === email;
      const ownsByUserId = typeof existing.guest_user_id === 'string' && existing.guest_user_id === user.id;
      if (!ownsByEmail && !ownsByUserId) {
        return json({ success: false, error: 'You can only pay your own booking' }, 403);
      }
      if (email) {
        const ownerNorm = ownerEmail;
        const shouldSyncEmail = ownerNorm.length === 0 || ownerNorm !== email;
        const shouldSyncUserId = !existing.guest_user_id || String(existing.guest_user_id) !== user.id;
        if (shouldSyncEmail || shouldSyncUserId) {
          const { error: syncErr } = await admin
            .from('bookings')
            .update({ guest_email: email, guest_user_id: user.id })
            .eq('id', targetBookingId);
          if (syncErr) return json({ success: false, error: syncErr.message }, 500);
        }
      }
      if (existing.status !== 'pending') {
        return json({ success: false, error: 'Only pending bookings can be paid' }, 400);
      }
      if ((existing.payment_status ?? 'pending') === 'paid') {
        return json({ success: false, error: 'This booking is already paid' }, 400);
      }
      listingId = String(existing.listing_id ?? '').trim();
      bookingDate = String(existing.booking_date ?? '').trim();
      guests = Number(existing.guests ?? 0);
      totalAmount = Number(existing.total_amount ?? NaN);
      currency = String(existing.currency ?? 'USD').trim().toUpperCase() || 'USD';
      const { data: listingRow } = await admin
        .from('listings')
        .select('title')
        .eq('id', listingId)
        .maybeSingle();
      if (listingRow?.title?.trim()) listingTitle = listingRow.title.trim();
    } else {
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
      targetBookingId = inserted.id;
    }

    if (!listingId) return json({ success: false, error: 'Booking listing is missing' }, 400);
    if (!bookingDate || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
      return json({ success: false, error: 'Booking date must be YYYY-MM-DD' }, 400);
    }
    if (!Number.isFinite(guests) || guests < 1 || guests > 99) {
      return json({ success: false, error: 'Booking guests must be between 1 and 99' }, 400);
    }
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return json({ success: false, error: 'Booking amount must be > 0' }, 400);
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
        booking_id: targetBookingId,
        listing_id: listingId,
        user_id: user.id,
      },
      payment_intent_data: {
        metadata: {
          booking_id: targetBookingId,
          listing_id: listingId,
          user_id: user.id,
        },
      },
    });

    const { error: updateError } = await admin
      .from('bookings')
      .update({ checkout_session_id: session.id })
      .eq('id', targetBookingId);
    if (updateError) {
      return json({ success: false, error: 'Checkout created but booking update failed' }, 500);
    }

    return json({
      success: true,
      bookingId: targetBookingId,
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
    });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
