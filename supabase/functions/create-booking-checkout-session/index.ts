// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { quoteListingBooking, type DiscountRow, type ListingQuoteRow } from '../_shared/booking-quote.ts';

type RequestBody = {
  bookingId?: string;
  listingId: string;
  listingTitle?: string;
  bookingDate: string;
  guests: number;
  customerName?: string;
  customerPhone?: string;
  specialRequests?: string;
  /** Ignored for pricing. Kept so old clients do not break; server recomputes. */
  totalAmount?: number;
  currency?: string;
  bookingOptionId?: string;
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

function optionIdFromNotes(notes: string | null | undefined): string | null {
  const line = (notes ?? '')
    .split(/\n+/)
    .map((l) => l.trim())
    .find((l) => /^booking_option_id:/i.test(l));
  if (!line) return null;
  const id = line.replace(/^booking_option_id:/i, '').trim();
  return id || null;
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
    const requestedOptionId = String(body.bookingOptionId ?? '').trim();
    const successPath = sanitizePath(body.successPath, '/booking-confirmed');
    const cancelPath = sanitizePath(body.cancelPath, '/bookings?payment=cancelled');

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    let targetBookingId = bookingId;
    let storedOptionId: string | null = requestedOptionId || null;

    if (targetBookingId) {
      const withOption = await admin
        .from('bookings')
        .select(
          'id, listing_id, guest_email, guest_user_id, guest_name, guests, booking_date, status, payment_status, total_amount, currency, special_requests, booking_option_id'
        )
        .eq('id', targetBookingId)
        .maybeSingle();
      let row = withOption.data as Record<string, unknown> | null;
      if (withOption.error || !row) {
        const fallback = await admin
          .from('bookings')
          .select(
            'id, listing_id, guest_email, guest_user_id, guest_name, guests, booking_date, status, payment_status, total_amount, currency, special_requests'
          )
          .eq('id', targetBookingId)
          .maybeSingle();
        if (fallback.error) return json({ success: false, error: fallback.error.message }, 500);
        row = fallback.data as Record<string, unknown> | null;
      }
      if (!row) return json({ success: false, error: 'Booking not found' }, 404);
      const ownerEmail = (row.guest_email ?? '').trim().toLowerCase();
      const ownsByEmail = ownerEmail.length > 0 && ownerEmail === email;
      const ownsByUserId = typeof row.guest_user_id === 'string' && row.guest_user_id === user.id;
      if (!ownsByEmail && !ownsByUserId) {
        return json({ success: false, error: 'You can only pay your own booking' }, 403);
      }
      if (email) {
        const shouldSyncEmail = ownerEmail.length === 0 || ownerEmail !== email;
        const shouldSyncUserId = !row.guest_user_id || String(row.guest_user_id) !== user.id;
        if (shouldSyncEmail || shouldSyncUserId) {
          const { error: syncErr } = await admin
            .from('bookings')
            .update({ guest_email: email, guest_user_id: user.id })
            .eq('id', targetBookingId);
          if (syncErr) return json({ success: false, error: syncErr.message }, 500);
        }
      }
      if (row.status !== 'pending') {
        return json({ success: false, error: 'Only pending bookings can be paid' }, 400);
      }
      if ((row.payment_status ?? 'pending') === 'paid') {
        return json({ success: false, error: 'This booking is already paid' }, 400);
      }
      listingId = String(row.listing_id ?? '').trim();
      bookingDate = String(row.booking_date ?? '').trim();
      guests = Number(row.guests ?? 0);
      storedOptionId =
        (typeof (row as { booking_option_id?: string }).booking_option_id === 'string' &&
          (row as { booking_option_id?: string }).booking_option_id?.trim()) ||
        optionIdFromNotes(row.special_requests) ||
        requestedOptionId ||
        null;
    } else {
      if (!listingId) return json({ success: false, error: 'listingId is required' }, 400);
      if (!bookingDate || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
        return json({ success: false, error: 'bookingDate must be YYYY-MM-DD' }, 400);
      }
      if (!Number.isFinite(guests) || guests < 1 || guests > 99) {
        return json({ success: false, error: 'guests must be between 1 and 99' }, 400);
      }
    }

    const { data: listingRow, error: listingError } = await admin
      .from('listings')
      .select('id, title, status, price_starting_from, price_currency, listing_extras, group_size')
      .eq('id', listingId)
      .maybeSingle();
    if (listingError) return json({ success: false, error: listingError.message }, 500);
    if (!listingRow) return json({ success: false, error: 'Listing not found' }, 404);
    if (listingRow.title?.trim()) listingTitle = listingRow.title.trim();

    const { data: discountRows } = await admin
      .from('listing_discounts')
      .select('type, value, valid_from, valid_until, booking_option_id')
      .eq('listing_id', listingId);

    const listing: ListingQuoteRow = {
      status: listingRow.status ?? null,
      price_starting_from: Number(listingRow.price_starting_from ?? 0),
      price_currency: listingRow.price_currency ?? 'USD',
      listing_extras: listingRow.listing_extras,
      group_size: listingRow.group_size ?? null,
      title: listingRow.title,
    };
    const discounts = (discountRows ?? []) as DiscountRow[];

    const quote = quoteListingBooking({
      listing,
      discounts,
      bookingDate,
      guests,
      bookingOptionId: storedOptionId,
    });
    if (!quote.ok) {
      return json({ success: false, error: quote.error }, 400);
    }

    const totalAmount = quote.totalAmount;
    const currency = quote.currency;
    const notesParts = [
      customerPhone ? `Guest phone: ${customerPhone}` : '',
      specialRequests,
      quote.optionId ? `booking_option_id: ${quote.optionId}` : '',
    ].filter(Boolean);

    if (!targetBookingId) {
      const insertBase: Record<string, unknown> = {
        listing_id: listingId,
        guest_email: email,
        guest_name: customerName || null,
        guests,
        booking_date: bookingDate,
        status: 'pending',
        special_requests: notesParts.join('\n\n') || null,
        total_amount: totalAmount,
        currency,
        guest_user_id: user.id,
        payment_status: 'pending',
        payment_provider: 'stripe',
        booking_option_id: quote.optionId,
      };
      let inserted: { id: string } | null = null;
      let insertError: { message: string } | null = null;
      {
        const res = await admin.from('bookings').insert(insertBase).select('id').single();
        inserted = res.data;
        insertError = res.error;
      }
      if (insertError && /booking_option_id/i.test(insertError.message)) {
        delete insertBase.booking_option_id;
        const res = await admin.from('bookings').insert(insertBase).select('id').single();
        inserted = res.data;
        insertError = res.error;
      }
      if (insertError || !inserted?.id) {
        return json({ success: false, error: insertError?.message ?? 'Could not create booking' }, 500);
      }
      targetBookingId = inserted.id;
    } else {
      const updatePayload: Record<string, unknown> = {
        total_amount: totalAmount,
        currency,
      };
      if (quote.optionId) updatePayload.booking_option_id = quote.optionId;
      const { error: priceSyncErr } = await admin.from('bookings').update(updatePayload).eq('id', targetBookingId);
      if (priceSyncErr && !/booking_option_id/i.test(priceSyncErr.message)) {
        return json({ success: false, error: priceSyncErr.message }, 500);
      }
      if (priceSyncErr) {
        const { error: retryErr } = await admin
          .from('bookings')
          .update({ total_amount: totalAmount, currency })
          .eq('id', targetBookingId);
        if (retryErr) return json({ success: false, error: retryErr.message }, 500);
      }
    }

    const stripe = new Stripe(stripeSecret);
    const amountMinor = Math.round(totalAmount * 100);
    if (!Number.isFinite(amountMinor) || amountMinor < 1) {
      return json({ success: false, error: 'Booking amount must be > 0' }, 400);
    }

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
              description: `${bookingDate} · ${guests} ${guests === 1 ? 'guest' : 'guests'}${
                quote.optionLabel ? ` · ${quote.optionLabel}` : ''
              }`,
            },
          },
        },
      ],
      metadata: {
        booking_id: targetBookingId,
        listing_id: listingId,
        user_id: user.id,
        booking_option_id: quote.optionId ?? '',
        quoted_total: String(totalAmount),
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
      quotedTotal: totalAmount,
      currency,
    });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
