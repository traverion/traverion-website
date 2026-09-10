// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { quoteListingBooking, stayCheckoutNightsAlreadyBooked, stayNightIsOperatorBlocked, stayRangeFromBooking, type DiscountRow, type ListingQuoteRow, type StayCheckoutOccupancyRow } from '../_shared/booking-quote.ts';
import { tourCheckoutOccupiedGuests, type TourCheckoutOccupancyRow } from '../_shared/booking-hold.ts';
import { checkoutPaymentStatusCanResume, resumeStayCheckoutDate } from '../_shared/checkout-resume.ts';
import { resumeStayLeadGuestName, stayCheckoutLeadGuestNameReady } from '../_shared/stay-checkout-guest.ts';

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
  checkoutDate?: string;
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
  if (raw.startsWith('/\\')) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw.slice(1))) return fallback;
  return raw;
}

function optionIdFromNotes(notes: unknown): string | null {
  if (typeof notes !== 'string') return null;
  const line = notes
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
    let checkoutDate = String(body.checkoutDate ?? '').trim();
    const successPath = sanitizePath(body.successPath, '/booking-confirmed');
    const cancelPath = sanitizePath(body.cancelPath, '/bookings?payment=cancelled');

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    let targetBookingId = bookingId;
    let storedOptionId: string | null = requestedOptionId || null;
    let resumeStayCheckOut: string | null = null;
    let resumeStayNights: number | null = null;
    let resumeStayNotes: string | null = null;
    let resumeGuestName: string | null = null;

    if (targetBookingId) {
      const withOption = await admin
        .from('bookings')
        .select(
          'id, listing_id, guest_email, guest_user_id, guest_name, guests, booking_date, check_out, nights, status, payment_status, total_amount, currency, special_requests, booking_option_id'
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
      if (!checkoutPaymentStatusCanResume(row.payment_status)) {
        return json({ success: false, error: 'This booking cannot be paid' }, 400);
      }
      listingId = String(row.listing_id ?? '').trim();
      bookingDate = String(row.booking_date ?? '').trim();
      guests = Number(row.guests ?? 0);
      resumeStayCheckOut = typeof row.check_out === 'string' ? row.check_out.trim() : null;
      const nightsRaw = Number(row.nights ?? NaN);
      resumeStayNights = Number.isFinite(nightsRaw) && nightsRaw >= 1 ? Math.floor(nightsRaw) : null;
      resumeStayNotes = typeof row.special_requests === 'string' ? row.special_requests : null;
      resumeGuestName = typeof row.guest_name === 'string' ? row.guest_name.trim() : null;
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
      {
        const [y, m, d] = bookingDate.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
          return json({ success: false, error: 'bookingDate must be a real calendar date' }, 400);
        }
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
    const listingStatus = String(listingRow.status ?? '').trim();
    if (listingStatus && listingStatus !== 'published') {
      return json({ success: false, error: 'This listing is not available to book.' }, 400);
    }
    if (listingRow.title?.trim()) listingTitle = listingRow.title.trim();
    await admin.rpc('expire_stale_checkout_holds', { p_listing_id: listingId });

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

    const extrasFamily =
      listingRow.listing_extras && typeof listingRow.listing_extras === 'object'
        ? (listingRow.listing_extras as { inventoryFamily?: unknown }).inventoryFamily
        : null;
    if (extrasFamily === 'stay' && targetBookingId) {
      const restored = resumeStayCheckoutDate({
        bodyCheckoutDate: checkoutDate,
        bookingCheckOut: resumeStayCheckOut,
        bookingDate,
        bookingNights: resumeStayNights,
        specialRequests: resumeStayNotes,
        resolveFromBooking: stayRangeFromBooking,
      });
      if (restored) checkoutDate = restored;
    }
    if (extrasFamily === 'stay' && !checkoutDate) {
      return json({ success: false, error: 'Choose valid check-in and check-out dates.' }, 400);
    }

    const effectiveGuestName = resumeStayLeadGuestName({
      bodyCustomerName: customerName,
      bookingGuestName: resumeGuestName,
    });
    if (extrasFamily === 'stay' && !stayCheckoutLeadGuestNameReady(effectiveGuestName)) {
      return json(
        { success: false, error: 'Enter the lead guest name so the host knows who is arriving.' },
        400
      );
    }

    const quote = quoteListingBooking({
      listing,
      discounts,
      bookingDate,
      guests,
      bookingOptionId: storedOptionId,
      checkoutDate: checkoutDate || null,
    });
    if (!quote.ok) {
      return json({ success: false, error: quote.error }, 400);
    }

    if (extrasFamily === 'stay' && checkoutDate) {
      const { data: existingStayBookings, error: stayBusyErr } = await admin
        .from('bookings')
        .select('id, booking_date, check_out, nights, special_requests, status, payment_status, hold_expires_at, created_at')
        .eq('listing_id', listingId)
        .neq('status', 'cancelled');
      const stayRows = stayBusyErr && /check_out|nights/i.test(stayBusyErr.message)
        ? (
            await admin
              .from('bookings')
              .select('id, booking_date, special_requests, status, payment_status, hold_expires_at, created_at')
              .eq('listing_id', listingId)
              .neq('status', 'cancelled')
          ).data
        : existingStayBookings;
      if (stayBusyErr && !/check_out|nights/i.test(stayBusyErr.message)) {
        return json({ success: false, error: stayBusyErr.message }, 500);
      }
      if (
        stayCheckoutNightsAlreadyBooked(
          (stayRows ?? []) as StayCheckoutOccupancyRow[],
          bookingDate,
          checkoutDate,
          targetBookingId
        )
      ) {
        return json({ success: false, error: 'Those nights are already booked.' }, 409);
      }

      const { data: blockedRows } = await admin
        .from('listing_availability')
        .select('available_date, capacity')
        .eq('listing_id', listingId)
        .gte('available_date', bookingDate)
        .lt('available_date', checkoutDate);
      for (const row of blockedRows ?? []) {
        if (stayNightIsOperatorBlocked(Number(row.capacity ?? 0))) {
          return json({ success: false, error: 'Those nights are blocked.' }, 409);
        }
      }
    } else {
      const { data: tourRows, error: tourBusyErr } = await admin
        .from('bookings')
        .select('id, booking_date, guests, status, payment_status, hold_expires_at, created_at')
        .eq('listing_id', listingId)
        .eq('booking_date', bookingDate);
      if (tourBusyErr) return json({ success: false, error: tourBusyErr.message }, 500);
      const occupied = tourCheckoutOccupiedGuests(
        (tourRows ?? []) as TourCheckoutOccupancyRow[],
        bookingDate,
        targetBookingId
      );
      const { data: capRow } = await admin
        .from('listing_availability')
        .select('capacity')
        .eq('listing_id', listingId)
        .eq('available_date', bookingDate)
        .maybeSingle();
      let capacity = Number(capRow?.capacity ?? NaN);
      if (!Number.isFinite(capacity) || capacity < 1) {
        const extras = listingRow.listing_extras as { bookingOptions?: Array<{ maxSpotsPerSlot?: unknown }> } | null;
        let max = 0;
        for (const opt of extras?.bookingOptions ?? []) {
          const spots = opt.maxSpotsPerSlot;
          if (typeof spots !== 'number' || !Number.isFinite(spots) || spots < 1) continue;
          max = Math.max(max, Math.floor(spots));
        }
        capacity = Math.min(99, max >= 1 ? max : 8);
      }
      if (Math.max(0, capacity - occupied) < guests) {
        return json({ success: false, error: 'Not enough capacity left for this date.' }, 409);
      }
    }

    const totalAmount = quote.totalAmount;
    const currency = quote.currency;
    const holdExpiresAtUnix = Math.floor(Date.now() / 1000) + 30 * 60;
    const holdExpiresAtIso = new Date(holdExpiresAtUnix * 1000).toISOString();
    const notesParts = [
      customerPhone ? `Guest phone: ${customerPhone}` : '',
      specialRequests,
      quote.optionId ? `booking_option_id: ${quote.optionId}` : '',
      checkoutDate ? `check_out: ${checkoutDate}` : '',
    ].filter(Boolean);

    if (!targetBookingId) {
      const stayNights =
        extrasFamily === 'stay' && checkoutDate
          ? Math.round(
              (Date.parse(`${checkoutDate}T12:00:00Z`) - Date.parse(`${bookingDate}T12:00:00Z`)) / 86400000
            )
          : null;
      const claimArgs = {
        p_listing_id: listingId,
        p_guest_email: email,
        p_guest_name: effectiveGuestName || null,
        p_guests: guests,
        p_booking_date: bookingDate,
        p_check_out: extrasFamily === 'stay' && checkoutDate ? checkoutDate : null,
        p_special_requests: notesParts.join('\n\n') || null,
        p_total_amount: totalAmount,
        p_currency: currency,
        p_guest_user_id: user.id,
        p_booking_option_id: quote.optionId,
        p_nights: stayNights != null && stayNights >= 1 ? stayNights : null,
        p_nightly_amount: stayNights != null && stayNights >= 1 ? quote.unitPrice : null,
        p_cleaning_fee:
          stayNights != null && stayNights >= 1
            ? Math.round((quote.totalAmount - quote.unitPrice * stayNights) * 100) / 100
            : null,
        p_hold_expires_at: holdExpiresAtIso,
      };
      const claimed = await admin.rpc('claim_pending_checkout_booking', claimArgs);
      if (claimed.error) {
        const conflict = /already booked|not enough capacity|occupied/i.test(claimed.error.message);
        if (conflict) return json({ success: false, error: claimed.error.message }, 409);
        const missingFn = /could not find the function|schema cache/i.test(claimed.error.message);
        if (!missingFn) return json({ success: false, error: claimed.error.message }, 500);
        const { error: inventoryErr } = await admin.rpc('assert_checkout_inventory', {
          p_listing_id: listingId,
          p_check_in: bookingDate,
          p_guests: guests,
          p_check_out: extrasFamily === 'stay' && checkoutDate ? checkoutDate : null,
          p_exclude_booking_id: null,
        });
        if (inventoryErr && !/could not find the function|schema cache/i.test(inventoryErr.message)) {
          const invConflict = /already booked|not enough capacity|occupied/i.test(inventoryErr.message);
          return json({ success: false, error: inventoryErr.message }, invConflict ? 409 : 500);
        }
        const insertBase: Record<string, unknown> = {
          listing_id: listingId,
          guest_email: email,
          guest_name: effectiveGuestName || null,
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
          hold_expires_at: holdExpiresAtIso,
        };
        if (extrasFamily === 'stay' && checkoutDate) {
          insertBase.check_out = checkoutDate;
          if (stayNights != null && stayNights >= 1) {
            insertBase.nights = stayNights;
            insertBase.nightly_amount = quote.unitPrice;
            insertBase.cleaning_fee = Math.round((quote.totalAmount - quote.unitPrice * stayNights) * 100) / 100;
          }
        }
        const res = await admin.from('bookings').insert(insertBase).select('id').single();
        if (res.error || !res.data?.id) {
          return json({ success: false, error: res.error?.message ?? 'Could not create booking' }, 500);
        }
        targetBookingId = res.data.id;
      } else {
        const id = claimed.data as string | null;
        if (!id) return json({ success: false, error: 'Could not create booking' }, 500);
        targetBookingId = id;
      }
    } else {
      const { error: inventoryErr } = await admin.rpc('assert_checkout_inventory', {
        p_listing_id: listingId,
        p_check_in: bookingDate,
        p_guests: guests,
        p_check_out: extrasFamily === 'stay' && checkoutDate ? checkoutDate : null,
        p_exclude_booking_id: targetBookingId,
      });
      if (inventoryErr && !/could not find the function|schema cache/i.test(inventoryErr.message)) {
        const conflict = /already booked|not enough capacity|occupied/i.test(inventoryErr.message);
        return json({ success: false, error: inventoryErr.message }, conflict ? 409 : 500);
      }
      const updatePayload: Record<string, unknown> = {
        total_amount: totalAmount,
        currency,
        // Revive holds that expire_stale_checkout_holds just flipped to failed mid-Pay-now.
        payment_status: 'pending',
        hold_expires_at: holdExpiresAtIso,
      };
      if (effectiveGuestName) updatePayload.guest_name = effectiveGuestName;
      if (quote.optionId) updatePayload.booking_option_id = quote.optionId;
      const { error: priceSyncErr } = await admin.from('bookings').update(updatePayload).eq('id', targetBookingId);
      if (priceSyncErr && !/booking_option_id|hold_expires_at/i.test(priceSyncErr.message)) {
        return json({ success: false, error: priceSyncErr.message }, 500);
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
      expires_at: holdExpiresAtUnix,
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
      .update({
        checkout_session_id: session.id,
        // Clear prior PI so stale payment_intent.payment_failed cannot kill this session.
        payment_intent_id: null,
        hold_expires_at: session.expires_at
          ? new Date(session.expires_at * 1000).toISOString()
          : holdExpiresAtIso,
      })
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
