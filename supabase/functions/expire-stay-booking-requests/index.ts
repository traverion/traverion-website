/**
 * Cron / scheduled: expire Stay Request-to-Book rows past approval_expires_at.
 * Idempotent. Cancels Stripe authorizations for expired rows.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { isStripeTestSecretKey, stripeLiveSecretBlockedMessage } from '../_shared/stripe-test-only.ts';
import { serviceRoleEdgeInvokeHeaders } from '../_shared/promote-paid-from-checkout.ts';

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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    // Prefer dedicated expire secret; fall back to existing reminder cron secret.
    const cronSecret = (
      Deno.env.get('STAY_REQUEST_EXPIRE_SECRET') ??
      Deno.env.get('CRON_SECRET') ??
      Deno.env.get('BOOKING_REMINDER_CRON_SECRET') ??
      ''
    ).trim();

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ success: false, error: 'Supabase env missing' }, 500);
    }
    if (!stripeSecret) return json({ success: false, error: 'STRIPE_SECRET_KEY not configured' }, 500);
    if (!isStripeTestSecretKey(stripeSecret)) {
      return json({ success: false, error: stripeLiveSecretBlockedMessage() }, 503);
    }

    // Allow service-role Bearer or shared cron secret.
    const authHeader = req.headers.get('Authorization') ?? '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    const headerCron = (req.headers.get('x-cron-secret') ?? '').trim();
    const okAuth =
      (bearer && bearer === serviceRoleKey) ||
      (cronSecret && bearer === cronSecret) ||
      (cronSecret && headerCron === cronSecret);
    if (!okAuth) return json({ success: false, error: 'Unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const stripe = new Stripe(stripeSecret);
    const headers = serviceRoleEdgeInvokeHeaders(serviceRoleKey);
    const portalBase = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://www.traverion.com').replace(/\/$/, '');

    const { data: expired, error: expErr } = await admin.rpc('expire_stay_booking_requests', {
      p_limit: 50,
    });
    if (expErr) return json({ success: false, error: expErr.message }, 500);

    const result = expired as {
      ok?: boolean;
      expired_count?: number;
      booking_ids?: string[];
      payment_intent_ids?: string[];
    } | null;

    const bookingIds = Array.isArray(result?.booking_ids) ? result!.booking_ids! : [];
    const piIds = Array.isArray(result?.payment_intent_ids) ? result!.payment_intent_ids! : [];

    for (const piId of piIds) {
      const id = String(piId ?? '').trim();
      if (!id) continue;
      try {
        await stripe.paymentIntents.cancel(id, undefined, {
          idempotencyKey: `stay-request-expire-cancel:${id}`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/already.?cancel|cannot.?cancel|canceled/i.test(msg)) {
          console.error(JSON.stringify({ source: 'expire-stay-booking-requests', piId: id, error: msg }));
        }
      }
    }

    for (const bookingId of bookingIds) {
      const id = String(bookingId ?? '').trim();
      if (!id) continue;
      const { data: booking } = await admin
        .from('bookings')
        .select('listing_id, guest_email, guest_user_id, guest_name, booking_date, check_out, guests, booking_number')
        .eq('id', id)
        .maybeSingle();
      if (!booking?.listing_id) continue;
      const { data: listing } = await admin
        .from('listings')
        .select('supplier_id, title')
        .eq('id', booking.listing_id)
        .maybeSingle();

      let guestEmail = String(booking.guest_email ?? '').trim().toLowerCase();
      if (!guestEmail && booking.guest_user_id) {
        try {
          const { data: authUser } = await admin.auth.admin.getUserById(String(booking.guest_user_id));
          guestEmail = (authUser?.user?.email ?? '').trim().toLowerCase();
        } catch {
          /* ignore */
        }
      }
      if (guestEmail) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/notify-customer-booking`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              emailKind: 'booking_cancelled',
              bookingId: id,
              to: guestEmail,
              listingTitle: listing?.title ?? undefined,
              unpaidCheckout: true,
              idempotencyKey: `customer:stay_request_expire:${id}`,
              fieldDiffs: [
                { field: 'Request status', before: 'Pending host approval', after: 'Expired (24h)' },
                { field: 'Payment', before: 'Authorized', after: 'Authorization released' },
              ],
            }),
          });
        } catch {
          /* best-effort */
        }
      }
      if (listing?.supplier_id) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/notify-supplier-event`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              supplierId: listing.supplier_id,
              eventType: 'booking_cancelled',
              listingId: booking.listing_id,
              listingTitle: listing.title ?? undefined,
              bookingId: id,
              unpaidCheckout: true,
              portalBaseUrl: portalBase,
              idempotencyKey: `supplier:stay_request_expire:${id}`,
            }),
          });
        } catch {
          /* best-effort */
        }
      }
      await admin.from('booking_payment_events').insert({
        booking_id: id,
        event_type: 'stay_request_expired',
        payload: { source: 'expire-stay-booking-requests' },
      });
    }

    return json({
      success: true,
      expiredCount: result?.expired_count ?? 0,
      bookingIds,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Expire job failed';
    return json({ success: false, error: msg }, 500);
  }
});
