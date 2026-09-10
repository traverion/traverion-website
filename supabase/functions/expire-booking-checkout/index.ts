import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { unpaidCancelShouldExpireCheckout } from '../_shared/cancelled-booking-checkout.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
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

    const body = (await req.json()) as { bookingId?: string };
    const bookingId = String(body.bookingId ?? '').trim();
    if (!bookingId) return json({ success: false, error: 'bookingId is required' }, 400);

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: booking, error: bookingErr } = await admin
      .from('bookings')
      .select(
        'id, status, payment_status, checkout_session_id, guest_email, guest_user_id, listing_id'
      )
      .eq('id', bookingId)
      .maybeSingle();
    if (bookingErr) return json({ success: false, error: bookingErr.message }, 500);
    if (!booking) return json({ success: false, error: 'Booking not found' }, 404);

    const ownerEmail = String(booking.guest_email ?? '')
      .trim()
      .toLowerCase();
    const ownsByEmail = Boolean(email) && ownerEmail === email;
    const ownsByUserId =
      typeof booking.guest_user_id === 'string' && booking.guest_user_id === user.id;

    let ownsAsSupplier = false;
    if (booking.listing_id) {
      const { data: listing } = await admin
        .from('listings')
        .select('supplier_id')
        .eq('id', booking.listing_id)
        .maybeSingle();
      ownsAsSupplier = Boolean(listing?.supplier_id) && String(listing?.supplier_id) === user.id;
    }

    if (!ownsByEmail && !ownsByUserId && !ownsAsSupplier) {
      return json({ success: false, error: 'Not allowed to expire this checkout' }, 403);
    }

    if (
      !unpaidCancelShouldExpireCheckout({
        bookingStatus: booking.status,
        bookingPaymentStatus: booking.payment_status,
        checkoutSessionId: booking.checkout_session_id,
      })
    ) {
      return json({
        success: true,
        skipped: true,
        reason: 'not an unpaid cancelled checkout with a session',
      });
    }

    const sessionId = String(booking.checkout_session_id).trim();
    const stripe = new Stripe(stripeSecret);
    try {
      await stripe.checkout.sessions.expire(sessionId);
    } catch {
      // Already expired, completed, or unknown — still ack.
    }

    return json({
      success: true,
      expired: true,
      bookingId,
      checkoutSessionId: sessionId,
    });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
