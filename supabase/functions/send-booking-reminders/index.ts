/**
 * Scheduled job: ~24h experience reminders + post-trip review requests.
 *
 * Invoke with service role (cron / GitHub Action / Supabase schedule).
 * Secrets: RESEND_API_KEY (via notify-customer-booking), SUPABASE_SERVICE_ROLE_KEY,
 *          BOOKING_REMINDER_CRON_SECRET (Authorization: Bearer <secret>).
 *
 * verify_jwt = false — auth via shared secret.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const expected = Deno.env.get('BOOKING_REMINDER_CRON_SECRET')?.trim();
  if (!expected) return json({ error: 'BOOKING_REMINDER_CRON_SECRET not set' }, 500);
  const auth = req.headers.get('authorization')?.trim() ?? '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (bearer !== expected) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Missing Supabase env' }, 500);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const publicSite = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://www.traverion.com').replace(/\/$/, '');
  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    'Content-Type': 'application/json',
  };

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowYmd = ymd(tomorrow);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayYmd = ymd(yesterday);

  let remindersSent = 0;
  let reviewsSent = 0;
  const errors: string[] = [];

  // ~24h reminders: paid/confirmed tours starting tomorrow
  const { data: reminderRows, error: remErr } = await admin
    .from('bookings')
    .select(
      'id, guest_email, guest_name, booking_date, guests, booking_number, listing_id, pickup_time, start_time, reminder_email_sent_at, status, payment_status'
    )
    .eq('booking_date', tomorrowYmd)
    .eq('status', 'confirmed')
    .eq('payment_status', 'paid')
    .is('reminder_email_sent_at', null)
    .limit(200);

  if (remErr) return json({ error: remErr.message }, 500);

  for (const row of reminderRows ?? []) {
    const email = (row.guest_email ?? '').trim().toLowerCase();
    if (!email) continue;
    let listingTitle = 'Your experience';
    let meetingPoint = '';
    if (row.listing_id) {
      const { data: lt } = await admin
        .from('listings')
        .select('title, meeting_point, pickup_instructions')
        .eq('id', row.listing_id)
        .maybeSingle();
      if (lt?.title?.trim()) listingTitle = lt.title.trim();
      meetingPoint = [lt?.meeting_point, lt?.pickup_instructions].filter(Boolean).join(' — ').trim();
    }
    const diffs: { label: string; before: string; after: string }[] = [];
    if (row.pickup_time) {
      diffs.push({ label: 'Pickup time', before: '—', after: String(row.pickup_time).slice(0, 5) });
    }
    if (row.start_time) {
      diffs.push({ label: 'Start time', before: '—', after: String(row.start_time).slice(0, 5) });
    }
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/notify-customer-booking`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerEmail: email,
          customerName: row.guest_name ?? undefined,
          listingTitle,
          bookingId: row.id,
          bookingNumber: row.booking_number ?? undefined,
          bookingDate: row.booking_date ?? undefined,
          guests: row.guests ?? undefined,
          emailKind: 'experience_reminder',
          meetingPoint: meetingPoint || undefined,
          fieldDiffs: diffs.length ? diffs : undefined,
          publicSiteUrl: publicSite,
          idempotencyKey: `customer:experience_reminder:${row.id}`,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.success) {
        await admin
          .from('bookings')
          .update({ reminder_email_sent_at: now.toISOString() })
          .eq('id', row.id)
          .is('reminder_email_sent_at', null);
        remindersSent += 1;
      } else {
        errors.push(`reminder ${row.id}: ${body?.error ?? res.status}`);
      }
    } catch (e) {
      errors.push(`reminder ${row.id}: ${e instanceof Error ? e.message : 'fail'}`);
    }
  }

  // Review requests: paid bookings whose date was yesterday (genuinely completed day)
  const { data: reviewRows, error: revErr } = await admin
    .from('bookings')
    .select(
      'id, guest_email, guest_name, booking_date, booking_number, listing_id, review_request_email_sent_at, status, payment_status'
    )
    .eq('booking_date', yesterdayYmd)
    .eq('status', 'confirmed')
    .eq('payment_status', 'paid')
    .is('review_request_email_sent_at', null)
    .limit(200);

  if (revErr) return json({ error: revErr.message }, 500);

  for (const row of reviewRows ?? []) {
    const email = (row.guest_email ?? '').trim().toLowerCase();
    if (!email) continue;
    let listingTitle = 'Your experience';
    if (row.listing_id) {
      const { data: lt } = await admin.from('listings').select('title').eq('id', row.listing_id).maybeSingle();
      if (lt?.title?.trim()) listingTitle = lt.title.trim();
    }
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/notify-customer-booking`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerEmail: email,
          customerName: row.guest_name ?? undefined,
          listingTitle,
          bookingId: row.id,
          bookingNumber: row.booking_number ?? undefined,
          bookingDate: row.booking_date ?? undefined,
          emailKind: 'review_request',
          publicSiteUrl: publicSite,
          idempotencyKey: `customer:review_request:${row.id}`,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.success) {
        await admin
          .from('bookings')
          .update({ review_request_email_sent_at: now.toISOString() })
          .eq('id', row.id)
          .is('review_request_email_sent_at', null);
        reviewsSent += 1;
      } else {
        errors.push(`review ${row.id}: ${body?.error ?? res.status}`);
      }
    } catch (e) {
      errors.push(`review ${row.id}: ${e instanceof Error ? e.message : 'fail'}`);
    }
  }

  return json({
    ok: true,
    tomorrowYmd,
    yesterdayYmd,
    remindersSent,
    reviewsSent,
    errors: errors.slice(0, 20),
  });
});
