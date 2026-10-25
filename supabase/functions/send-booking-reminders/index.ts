/**
 * Scheduled job: experience-local calendar reminders + post-trip review requests.
 *
 * Phase 1073: do NOT use UTC calendar days. Per booking:
 *   TZ = purchase_snapshot.departureTimezone (else Europe/Helsinki)
 *   Reminder: local day before tour departure / stay check-in / rental pickup
 *   Rental return reminder: local day before returnAt (separate idempotency)
 *   Review:   local day after tour departure, stay CHECK-OUT, or rental return
 *             (never after check-in / pickup alone)
 *
 * Title / logistics come from purchase_snapshot via notify-customer-booking.
 * Idempotency: reminder_email_sent_at / review_request_email_sent_at columns
 * plus notify idempotencyKey — cron retries cannot double-send.
 * Rental return: rental_booking_events.event_type = return_reminder_sent.
 *
 * Invoke with cron / GitHub Action:
 * Secrets: RESEND_API_KEY (via notify-customer-booking), SUPABASE_SERVICE_ROLE_KEY,
 *          BOOKING_REMINDER_CRON_SECRET (Authorization: Bearer <secret>).
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {
  lifecycleBookingIsRental,
  lifecycleCandidateUtcWindow,
  lifecycleStayNightsCandidateUtcWindow,
  shouldSendExperienceReminder,
  shouldSendRentalReturnReminder,
  shouldSendReviewRequest,
} from '../_shared/booking-lifecycle-calendar.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function snapshotStartHm(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const v = (snapshot as Record<string, unknown>).startTimeHm;
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 5) : null;
}

/** Phase 1786: empty guest_email still reaches account holders via auth. */
async function resolveGuestEmail(
  admin: ReturnType<typeof createClient>,
  row: { id: string; guest_email?: string | null; guest_user_id?: string | null }
): Promise<string> {
  let email = String(row.guest_email ?? '')
    .trim()
    .toLowerCase();
  if (email) return email;
  const uid = String(row.guest_user_id ?? '').trim();
  if (!uid) return '';
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(uid);
    const fromAuth = (authUser?.user?.email ?? '').trim().toLowerCase();
    if (fromAuth) {
      email = fromAuth;
      await admin.from('bookings').update({ guest_email: fromAuth }).eq('id', row.id);
    }
  } catch {
    /* ignore auth lookup failures */
  }
  return email;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const expected = Deno.env.get('BOOKING_REMINDER_CRON_SECRET')?.trim();
  if (!expected) return json({ error: 'BOOKING_REMINDER_CRON_SECRET not set' }, 500);
  const auth = req.headers.get('authorization')?.trim() ?? '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (bearer !== expected) return json({ error: 'Unauthorized' }, 401);

  // Empty body and `{}` keep the scheduled full scan. A uuid list limits every
  // query to those bookings so a certification run cannot email other guests.
  const rawBody = await req.text();
  let onlyBookingIds: string[] | null = null;
  if (rawBody.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    const requested =
      parsed && typeof parsed === 'object' && Array.isArray((parsed as { onlyBookingIds?: unknown }).onlyBookingIds)
        ? (parsed as { onlyBookingIds: unknown[] }).onlyBookingIds
        : null;
    if (requested) {
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (
        requested.length < 1 ||
        requested.length > 8 ||
        requested.some((id) => typeof id !== 'string' || !uuid.test(id))
      ) {
        return json({ error: 'onlyBookingIds must be 1–8 booking uuids' }, 400);
      }
      onlyBookingIds = requested;
    }
  }

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
  // Production cron leaves this unset and calls the hosted notify function.
  // An isolated certification process can point at a local notify server.
  const notifyCustomerUrl = (
    Deno.env.get('NOTIFY_CUSTOMER_URL') ?? `${supabaseUrl}/functions/v1/notify-customer-booking`
  ).replace(/\/$/, '');

  const now = new Date();
  const nowMs = now.getTime();
  const { fromYmd, toYmd } = lifecycleCandidateUtcWindow(nowMs);

  let remindersSent = 0;
  let returnRemindersSent = 0;
  let reviewsSent = 0;
  let reminderCandidates = 0;
  let returnReminderCandidates = 0;
  let reviewCandidates = 0;
  const errors: string[] = [];

  // Wide UTC window, then filter per booking experience-local calendar.
  let reminderQuery = admin
    .from('bookings')
    .select(
      'id, guest_email, guest_user_id, guest_name, booking_date, check_out, guests, booking_number, listing_id, pickup_time, start_time, purchase_snapshot, reminder_email_sent_at, status, payment_status'
    )
    .eq('status', 'confirmed')
    .eq('payment_status', 'paid')
    .is('reminder_email_sent_at', null)
    .gte('booking_date', fromYmd)
    .lte('booking_date', toYmd);
  if (onlyBookingIds) reminderQuery = reminderQuery.in('id', onlyBookingIds);
  const { data: reminderRows, error: remErr } = await reminderQuery.limit(500);

  if (remErr) return json({ error: remErr.message }, 500);

  for (const row of reminderRows ?? []) {
    if (!shouldSendExperienceReminder(row, nowMs)) continue;
    reminderCandidates += 1;
    const email = await resolveGuestEmail(admin, row);
    if (!email) continue;
    const diffs: { label: string; before: string; after: string }[] = [];
    if (row.pickup_time) {
      diffs.push({ label: 'Pickup time', before: '—', after: String(row.pickup_time).slice(0, 5) });
    }
    const startHm =
      snapshotStartHm(row.purchase_snapshot) ||
      (row.start_time ? String(row.start_time).slice(0, 5) : '');
    if (startHm) {
      diffs.push({ label: 'Start time', before: '—', after: startHm });
    }
    try {
      const res = await fetch(notifyCustomerUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerEmail: email,
          bookingId: row.id,
          emailKind: 'experience_reminder',
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
      } else if (res.ok && body?.skipped) {
        // Notify idempotency already claimed — still stamp so we do not retry forever.
        await admin
          .from('bookings')
          .update({ reminder_email_sent_at: now.toISOString() })
          .eq('id', row.id)
          .is('reminder_email_sent_at', null);
      } else {
        errors.push(`reminder ${row.id}: ${body?.error ?? res.status}`);
      }
    } catch (e) {
      errors.push(`reminder ${row.id}: ${e instanceof Error ? e.message : 'fail'}`);
    }
  }

  // Rental return reminders (day before returnAt). Separate from pickup reminder stamp.
  let returnQuery = admin
    .from('bookings')
    .select(
      'id, guest_email, guest_user_id, guest_name, booking_date, check_out, guests, booking_number, listing_id, purchase_snapshot, status, payment_status'
    )
    .eq('status', 'confirmed')
    .eq('payment_status', 'paid')
    .filter('purchase_snapshot->>inventoryFamily', 'eq', 'rental')
    .not('check_out', 'is', null)
    .gte('check_out', fromYmd)
    .lte('check_out', toYmd);
  if (onlyBookingIds) returnQuery = returnQuery.in('id', onlyBookingIds);
  const { data: returnRows, error: retErr } = await returnQuery.limit(500);

  if (retErr) return json({ error: retErr.message }, 500);

  const returnBookingIds = (returnRows ?? [])
    .map((r) => (r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string' ? (r as { id: string }).id : ''))
    .filter(Boolean);
  const alreadyReturned = new Set<string>();
  if (returnBookingIds.length > 0) {
    const { data: prior } = await admin
      .from('rental_booking_events')
      .select('booking_id')
      .in('booking_id', returnBookingIds)
      .eq('event_type', 'return_reminder_sent');
    for (const row of prior ?? []) {
      const id = String((row as { booking_id?: unknown }).booking_id ?? '');
      if (id) alreadyReturned.add(id);
    }
  }

  for (const row of returnRows ?? []) {
    if (!lifecycleBookingIsRental(row)) continue;
    if (alreadyReturned.has(row.id)) continue;
    if (!shouldSendRentalReturnReminder(row, nowMs)) continue;
    returnReminderCandidates += 1;
    const email = await resolveGuestEmail(admin, row);
    if (!email) continue;
    try {
      const res = await fetch(notifyCustomerUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerEmail: email,
          bookingId: row.id,
          emailKind: 'experience_reminder',
          fieldDiffs: [
            {
              label: 'Return',
              before: '—',
              after: String(row.check_out ?? '').slice(0, 10) || 'Tomorrow (local)',
            },
          ],
          publicSiteUrl: publicSite,
          idempotencyKey: `customer:rental_return_reminder:${row.id}`,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && (body?.success || body?.skipped)) {
        const { error: stampErr } = await admin.rpc('record_rental_booking_event', {
          p_booking_id: row.id,
          p_listing_id: row.listing_id,
          p_event_type: 'return_reminder_sent',
          p_actor_role: 'system',
          p_actor_user_id: null,
          p_payload: { kind: 'return_reminder' },
        });
        if (stampErr) {
          errors.push(`return_reminder_stamp ${row.id}: ${stampErr.message}`);
        } else {
          returnRemindersSent += 1;
          alreadyReturned.add(row.id);
        }
      } else {
        errors.push(`return_reminder ${row.id}: ${body?.error ?? res.status}`);
      }
    } catch (e) {
      errors.push(`return_reminder ${row.id}: ${e instanceof Error ? e.message : 'fail'}`);
    }
  }

  // Reviews: tour completion ≈ booking_date; stay completion = check_out / nights / snap.
  // Fetch by booking_date window OR check_out window OR nights-only OR snapshot checkOut, then filter locally.
  const reviewSelect =
    'id, guest_email, guest_user_id, guest_name, booking_date, check_out, nights, special_requests, booking_number, listing_id, purchase_snapshot, review_request_email_sent_at, status, payment_status';
  let reviewDepartureQuery = admin
    .from('bookings')
    .select(reviewSelect)
    .eq('status', 'confirmed')
    .eq('payment_status', 'paid')
    .is('review_request_email_sent_at', null)
    .gte('booking_date', fromYmd)
    .lte('booking_date', toYmd);
  if (onlyBookingIds) reviewDepartureQuery = reviewDepartureQuery.in('id', onlyBookingIds);
  const { data: reviewByDeparture, error: revErr1 } = await reviewDepartureQuery.limit(500);

  if (revErr1) return json({ error: revErr1.message }, 500);

  // Phase 1332/1565/1567: wide stay windows for nights + stale short check_out columns.
  const stayNightsWindow = lifecycleStayNightsCandidateUtcWindow(nowMs);

  let reviewCheckoutQuery = admin
    .from('bookings')
    .select(reviewSelect)
    .eq('status', 'confirmed')
    .eq('payment_status', 'paid')
    .is('review_request_email_sent_at', null)
    .not('check_out', 'is', null)
    // Phase 1567: wide lookback on raw check_out so stale short columns still load
    // when true completion (1564 max) is in today’s review window.
    .gte('check_out', stayNightsWindow.fromYmd)
    .lte('check_out', stayNightsWindow.toYmd);
  if (onlyBookingIds) reviewCheckoutQuery = reviewCheckoutQuery.in('id', onlyBookingIds);
  const { data: reviewByCheckout, error: revErr2 } = await reviewCheckoutQuery.limit(500);

  if (revErr2) return json({ error: revErr2.message }, 500);

  // Phase 1332/1565: nights stays need a wider check-in window (check-out = booking_date + nights).
  // Phase 1565: do not require check_out IS NULL — stale short column + longer nights must still load.
  let reviewNightsQuery = admin
    .from('bookings')
    .select(reviewSelect)
    .eq('status', 'confirmed')
    .eq('payment_status', 'paid')
    .is('review_request_email_sent_at', null)
    .gte('nights', 1)
    .gte('booking_date', stayNightsWindow.fromYmd)
    .lte('booking_date', stayNightsWindow.toYmd);
  if (onlyBookingIds) reviewNightsQuery = reviewNightsQuery.in('id', onlyBookingIds);
  const { data: reviewByNights, error: revErr3 } = await reviewNightsQuery.limit(500);

  if (revErr3) return json({ error: revErr3.message }, 500);

  // Phase 1537/1565: snapshot checkOut in window — even when column/nights are set short (1564 max).
  let reviewSnapQuery = admin
    .from('bookings')
    .select(reviewSelect)
    .eq('status', 'confirmed')
    .eq('payment_status', 'paid')
    .is('review_request_email_sent_at', null)
    .filter('purchase_snapshot->>checkOut', 'gte', fromYmd)
    .filter('purchase_snapshot->>checkOut', 'lte', toYmd);
  if (onlyBookingIds) reviewSnapQuery = reviewSnapQuery.in('id', onlyBookingIds);
  const { data: reviewBySnapCheckout, error: revErr4 } = await reviewSnapQuery.limit(500);

  if (revErr4) return json({ error: revErr4.message }, 500);

  const reviewById = new Map<string, Record<string, unknown>>();
  for (const row of [
    ...(reviewByDeparture ?? []),
    ...(reviewByCheckout ?? []),
    ...(reviewByNights ?? []),
    ...(reviewBySnapCheckout ?? []),
  ]) {
    if (row && typeof row === 'object' && typeof (row as { id?: unknown }).id === 'string') {
      reviewById.set((row as { id: string }).id, row as Record<string, unknown>);
    }
  }

  for (const row of reviewById.values()) {
    if (!shouldSendReviewRequest(row as Parameters<typeof shouldSendReviewRequest>[0], nowMs)) continue;
    reviewCandidates += 1;
    const email = await resolveGuestEmail(admin, {
      id: String(row.id ?? ''),
      guest_email: typeof row.guest_email === 'string' ? row.guest_email : null,
      guest_user_id: typeof row.guest_user_id === 'string' ? row.guest_user_id : null,
    });
    if (!email) continue;
    const bookingId = String(row.id ?? '');
    try {
      const res = await fetch(notifyCustomerUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerEmail: email,
          bookingId,
          emailKind: 'review_request',
          publicSiteUrl: publicSite,
          idempotencyKey: `customer:review_request:${bookingId}`,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.success) {
        await admin
          .from('bookings')
          .update({ review_request_email_sent_at: now.toISOString() })
          .eq('id', bookingId)
          .is('review_request_email_sent_at', null);
        reviewsSent += 1;
      } else if (res.ok && body?.skipped) {
        await admin
          .from('bookings')
          .update({ review_request_email_sent_at: now.toISOString() })
          .eq('id', bookingId)
          .is('review_request_email_sent_at', null);
      } else {
        errors.push(`review ${bookingId}: ${body?.error ?? res.status}`);
      }
    } catch (e) {
      errors.push(`review ${bookingId}: ${e instanceof Error ? e.message : 'fail'}`);
    }
  }

  return json({
    ok: true,
    candidateWindow: { fromYmd, toYmd },
    scopedToBookingIds: onlyBookingIds?.length ?? 0,
    reminderCandidates,
    returnReminderCandidates,
    reviewCandidates,
    remindersSent,
    returnRemindersSent,
    reviewsSent,
    errors: errors.length ? errors : undefined,
  });
});
