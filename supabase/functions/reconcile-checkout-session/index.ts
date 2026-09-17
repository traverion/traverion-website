import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return json({ success: false, error: 'Supabase env missing' }, 500);
    }
    if (!stripeSecret) return json({ success: false, error: 'STRIPE_SECRET_KEY not configured' }, 500);

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ success: false, error: 'Missing Authorization header' }, 401);

    const authed = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await authed.auth.getUser();
    if (authError || !authData?.user) return json({ success: false, error: 'Unauthorized' }, 401);
    const user = authData.user;
    const email = user.email?.trim().toLowerCase() ?? '';

    const body = (await req.json()) as { sessionId?: string };
    const sessionId = String(body.sessionId ?? '').trim();
    if (!sessionId) return json({ success: false, error: 'sessionId is required' }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: booking, error: bookingErr } = await admin
      .from('bookings')
      .select('id, status, payment_status, guest_email, guest_user_id, checkout_session_id')
      .eq('checkout_session_id', sessionId)
      .maybeSingle();
    if (bookingErr) return json({ success: false, error: bookingErr.message }, 500);
    if (!booking) return json({ success: false, error: 'Booking not found for this checkout' }, 404);

    const ownerEmail = String(booking.guest_email ?? '')
      .trim()
      .toLowerCase();
    const ownsByEmail = Boolean(email) && ownerEmail === email;
    const ownsByUserId =
      typeof booking.guest_user_id === 'string' && booking.guest_user_id === user.id;
    if (!ownsByEmail && !ownsByUserId) {
      return json({ success: false, error: 'Not allowed to reconcile this checkout' }, 403);
    }

    const pay = String(booking.payment_status ?? '').toLowerCase();
    if (pay === 'paid' || pay === 'refunded') {
      return json({
        success: true,
        alreadySettled: true,
        paymentStatus: pay,
        bookingId: booking.id,
      });
    }

    const stripe = new Stripe(stripeSecret);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return json({
        success: true,
        promoted: false,
        stripePaymentStatus: session.payment_status,
        bookingId: booking.id,
        paymentStatus: pay,
      });
    }

    const eventId = `reconcile_${session.id}`;
    const syntheticEvent = {
      id: eventId,
      type: 'checkout.session.completed',
      data: { object: session },
    } as unknown as Stripe.Event;

    let processedStatus: 'processed' | 'ignored' | 'failed' = 'processed';
    const markProcessed = async (
      status: 'processed' | 'ignored' | 'failed',
      _errorMessage?: string
    ) => {
      processedStatus = status;
    };

    const response = await promotePaidFromCheckoutSession({
      admin,
      stripe,
      session,
      event: syntheticEvent,
      markProcessed,
      supabaseUrl,
      serviceRoleKey,
    });

    const payload = await response.json().catch(() => ({}));
    return json({
      success: true,
      promoted: Boolean(payload?.status === 'paid' || payload?.alreadyPaid),
      reconcileStatus: processedStatus,
      bookingId: booking.id,
      result: payload,
    });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
