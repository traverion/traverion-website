// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {
  escapeHtml,
  fieldDiffPlainText,
  fieldDiffTableHtml,
  type FieldDiff,
} from '../_shared/transactional-html.ts';

type EventType =
  | 'new_booking'
  | 'booking_cancelled'
  | 'new_review'
  | 'supplier_welcome'
  | 'guest_message'
  | 'booking_detail_changed'
  /** Copy of schedule change you saved — guest is notified separately */
  | 'host_schedule_updated';

type Payload = {
  supplierId: string;
  eventType: EventType;
  listingId?: string;
  listingTitle?: string;
  bookingId?: string;
  bookingDate?: string;
  guests?: number;
  guestName?: string;
  reviewRating?: number;
  reviewTitle?: string;
  /** Base site URL (no trailing slash), e.g. https://www.traverion.com — used in supplier_welcome body */
  portalBaseUrl?: string;
  /** Short preview of a guest message (guest_message) */
  messagePreview?: string;
  /** Human-readable summary of what changed (booking_detail_changed) */
  changeSummary?: string;
  /** new_booking: whether traveler already paid online (Stripe). */
  bookingPaymentStatus?: 'paid' | 'pending' | 'none';
  /** guest_message / booking_detail_changed: structured previous → new values. */
  fieldDiffs?: FieldDiff[];
  /** Global sequential order number; emails show as #N */
  bookingNumber?: number;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function siteBase(payload: Payload): string {
  return (payload.portalBaseUrl ?? 'https://partner.traverion.com').replace(/\/$/, '');
}

function logoUrl(base: string): string {
  return `${base}/traverionlogotransparent.png?v=3`;
}

function eventSubject(payload: Payload): string {
  if (payload.eventType === 'supplier_welcome') return 'Welcome to Traverion for suppliers';
  const listing = payload.listingTitle ?? 'your listing';
  const refTag =
    typeof payload.bookingNumber === 'number' && payload.bookingNumber > 0
      ? `#${payload.bookingNumber} — `
      : '';
  if (payload.eventType === 'new_booking') {
    if (payload.bookingPaymentStatus === 'paid') return `${refTag}New paid booking: ${listing}`;
    return `${refTag}New booking: ${listing}`;
  }
  if (payload.eventType === 'booking_cancelled') return `${refTag}Booking cancelled: ${listing}`;
  if (payload.eventType === 'guest_message') return `${refTag}Message from a guest: ${listing}`;
  if (payload.eventType === 'booking_detail_changed') return `${refTag}Booking updated: ${listing}`;
  if (payload.eventType === 'host_schedule_updated') return `${refTag}Schedule saved (your update): ${listing}`;
  return `New review received: ${listing}`;
}

function eventBody(payload: Payload): string {
  if (payload.eventType === 'supplier_welcome') {
    const base = siteBase(payload);
    return [
      'Thanks for creating a supplier account on Traverion.',
      '',
      'Next steps:',
      '1. Complete your business profile and payout details in Settings.',
      '2. Create and publish your first listing when you are ready.',
      '',
      `Open your supplier portal: ${base}/partner`,
      '',
      '— Traverion',
    ].join('\n');
  }
  const listing = payload.listingTitle ?? 'Listing';
  const lines: string[] = [];
  if (payload.eventType === 'host_schedule_updated') {
    lines.push('Schedule update confirmation (saved by you)');
    lines.push(`Listing: ${listing}`);
    lines.push('The guest was sent the same previous → new summary by email.');
  } else {
    lines.push(`Event: ${payload.eventType}`);
    lines.push(`Listing: ${listing}`);
  }
  if (payload.eventType === 'new_booking' && payload.bookingPaymentStatus === 'paid') {
    lines.push('Payment: paid online (Stripe)');
  } else if (payload.eventType === 'new_booking') {
    lines.push('Payment: pending / not via online checkout');
  }
  if (
    typeof payload.bookingNumber === 'number' &&
    payload.bookingNumber > 0
  ) {
    lines.push(`Booking #: ${payload.bookingNumber}`);
  }
  if (payload.bookingId) lines.push(`Booking id: ${payload.bookingId}`);
  if (payload.bookingDate) lines.push(`Date: ${payload.bookingDate}`);
  if (typeof payload.guests === 'number' && payload.guests > 0) lines.push(`Guests: ${payload.guests}`);
  if (payload.guestName) lines.push(`Guest: ${payload.guestName}`);
  if (typeof payload.reviewRating === 'number' && payload.reviewRating > 0) lines.push(`Rating: ${payload.reviewRating}/5`);
  if (payload.reviewTitle) lines.push(`Review: ${payload.reviewTitle}`);
  if (payload.messagePreview) lines.push(`Latest note: ${payload.messagePreview}`);
  if (payload.changeSummary) lines.push(`Changes: ${payload.changeSummary}`);
  if (payload.fieldDiffs?.length) lines.push('', fieldDiffPlainText(payload.fieldDiffs));
  lines.push('');
  lines.push('Open your supplier portal to review and take action.');
  return lines.join('\n');
}

function eventHtml(payload: Payload): string {
  const base = siteBase(payload);
  const logo = logoUrl(base);
  const portal = `${base}/partner`;
  const bookingsUrl = `${base}/partner/bookings`;

  if (payload.eventType === 'supplier_welcome') {
    const bodyText = escapeHtml(eventBody(payload)).replace(/\n/g, '<br/>');
    return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f6f8;font-family:Georgia,serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
<tr><td style="padding:28px 28px 16px;text-align:center;background:#ffffff;">
<img src="${logo}" width="200" height="auto" alt="Traverion" style="display:block;margin:0 auto;max-width:85%;height:auto;border:0;"/>
</td></tr>
<tr><td style="padding:0 32px 32px;font-size:15px;line-height:1.6;color:#1f2937;">
${bodyText}
<p style="margin:20px 0 0;"><a href="${portal}" style="display:inline-block;padding:12px 20px;background:#003580;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-family:system-ui,sans-serif;">Open supplier portal</a></p>
</td></tr>
</table>
<p style="font-size:12px;color:#9ca3af;margin-top:16px;font-family:system-ui,sans-serif;"><a href="${base}" style="color:#003580;">traverion.com</a></p>
</td></tr></table></body></html>`;
  }

  const listing = escapeHtml(payload.listingTitle ?? 'Your listing');
  let headline = 'Notification';
  let sub = '';
  if (payload.eventType === 'new_booking') {
    if (payload.bookingPaymentStatus === 'paid') {
      headline = 'New paid booking';
      sub = 'A traveler completed payment online. The booking is confirmed — review details in your dashboard.';
    } else {
      headline = 'New booking';
      sub = 'A traveler has a booking on your listing. Open your dashboard to confirm details or collect payment if still pending.';
    }
  } else if (payload.eventType === 'booking_cancelled') {
    headline = 'Booking cancelled';
    sub = 'A booking was cancelled.';
  } else if (payload.eventType === 'new_review') {
    headline = 'New review';
    sub = 'Someone left a review on your tour.';
  } else if (payload.eventType === 'guest_message') {
    headline = 'Guest updated their booking details';
    sub = 'A guest changed notes or meeting / place-of-stay information. Compare previous vs new values below.';
  } else if (payload.eventType === 'booking_detail_changed') {
    headline = 'Booking details updated';
    sub = 'Details changed for a booking — review in your dashboard.';
  } else if (payload.eventType === 'host_schedule_updated') {
    headline = 'Schedule update saved';
    sub =
      'You just updated start or pickup times for this booking. Below is a record of what changed. The guest receives the same summary by email.';
  }

  const rows: string[] = [];
  rows.push(`<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;width:120px;vertical-align:top;">Experience</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;">${listing}</td></tr>`);
  if (typeof payload.bookingNumber === 'number' && payload.bookingNumber > 0) {
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Booking no.</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;">#${payload.bookingNumber}</td></tr>`,
    );
  }
  if (payload.bookingId) {
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Booking id</td><td style="padding:6px 0;font-size:14px;color:#111827;font-family:ui-monospace,monospace;">${escapeHtml(payload.bookingId)}</td></tr>`,
    );
  }
  if (payload.bookingDate) {
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Date</td><td style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(payload.bookingDate)}</td></tr>`,
    );
  }
  if (typeof payload.guests === 'number' && payload.guests > 0) {
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Guests</td><td style="padding:6px 0;font-size:14px;color:#111827;">${payload.guests}</td></tr>`,
    );
  }
  if (payload.guestName) {
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Guest</td><td style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(payload.guestName)}</td></tr>`,
    );
  }
  if (typeof payload.reviewRating === 'number' && payload.reviewRating > 0) {
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Rating</td><td style="padding:6px 0;font-size:14px;color:#111827;">${payload.reviewRating} / 5</td></tr>`,
    );
  }
  if (payload.reviewTitle) {
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Review</td><td style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(payload.reviewTitle)}</td></tr>`,
    );
  }
  if (payload.messagePreview) {
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;vertical-align:top;">Latest note</td><td style="padding:6px 0;font-size:14px;color:#111827;line-height:1.5;">${escapeHtml(payload.messagePreview)}</td></tr>`,
    );
  }
  if (payload.changeSummary) {
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;vertical-align:top;">Changes</td><td style="padding:6px 0;font-size:14px;color:#111827;line-height:1.5;">${escapeHtml(payload.changeSummary)}</td></tr>`,
    );
  }

  const diffBlock =
    payload.fieldDiffs && payload.fieldDiffs.length > 0
      ? `<tr><td colspan="2" style="padding:12px 0 0;">${fieldDiffTableHtml(payload.fieldDiffs)}</td></tr>`
      : '';

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f6f8;font-family:system-ui,-apple-system,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
<tr><td style="padding:28px 28px 12px;text-align:center;background:#ffffff;">
<img src="${logo}" width="200" height="auto" alt="Traverion" style="display:block;margin:0 auto;max-width:85%;height:auto;border:0;"/>
</td></tr>
<tr><td style="padding:8px 32px 8px;font-size:20px;font-weight:700;color:#003580;font-family:Georgia,serif;">${escapeHtml(headline)}</td></tr>
<tr><td style="padding:0 32px 16px;font-size:14px;line-height:1.5;color:#4b5563;">${escapeHtml(sub)}</td></tr>
<tr><td style="padding:0 32px 24px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e5e7eb;padding-top:16px;">
${rows.join('')}
${diffBlock}
</table>
</td></tr>
<tr><td style="padding:0 32px 32px;">
<a href="${bookingsUrl}" style="display:inline-block;padding:12px 20px;background:#003580;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">View in supplier dashboard</a>
<a href="${portal}" style="display:inline-block;margin-left:8px;padding:12px 16px;color:#003580;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;border:1px solid #003580;">Supplier home</a>
</td></tr>
</table>
<p style="font-size:12px;color:#9ca3af;margin-top:16px;">You are receiving this because you manage listings on Traverion.</p>
<p style="font-size:12px;color:#9ca3af;"><a href="${base}" style="color:#003580;">traverion.com</a></p>
</td></tr></table></body></html>`;
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
  try {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('SUPPLIER_EMAIL_FROM') ?? 'Traverion <no-reply@traverion.com>';
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!apiKey) return json({ success: false, error: 'RESEND_API_KEY not configured' }, 500);
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ success: false, error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured' }, 500);
    }

    const payload = (await req.json()) as Payload;
    if (!payload?.supplierId || !payload?.eventType) {
      return json({ success: false, error: 'Missing supplierId/eventType' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    if (payload.eventType === 'supplier_welcome') {
      const { data: prof } = await admin
        .from('supplier_profiles')
        .select('welcome_email_sent_at')
        .eq('id', payload.supplierId)
        .maybeSingle();
      if (prof?.welcome_email_sent_at) {
        return json({ success: true, skipped: true, notified: 0 });
      }
    }

    const recipients = new Set<string>();

    const { data: teamRows } = await admin
      .from('supplier_team_members')
      .select('user_id, label')
      .eq('supplier_id', payload.supplierId);

    const userIds = new Set<string>([payload.supplierId]);
    for (const row of teamRows ?? []) {
      if (row?.user_id) userIds.add(String(row.user_id));
      const label = typeof row?.label === 'string' ? row.label.trim() : '';
      if (label.includes('@')) recipients.add(label);
    }

    for (const uid of userIds) {
      const res = await admin.auth.admin.getUserById(uid);
      const email = res.data?.user?.email?.trim();
      if (email) recipients.add(email);
    }

    if (recipients.size === 0) {
      return json({ success: false, error: 'No recipient emails found for supplier' }, 400);
    }

    const textBody = eventBody(payload);
    const htmlBody = eventHtml(payload);

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [...recipients],
        subject: eventSubject(payload),
        text: textBody,
        html: htmlBody,
      }),
    });
    const resendJson: any = await resendResp.json();
    if (!resendResp.ok) {
      return json({ success: false, error: resendJson?.message ?? 'Resend error' }, 500);
    }

    if (payload.eventType === 'supplier_welcome') {
      const now = new Date().toISOString();
      await admin
        .from('supplier_profiles')
        .update({ welcome_email_sent_at: now, updated_at: now })
        .eq('id', payload.supplierId);
    }

    return json({
      success: true,
      providerMessageId: resendJson?.id ?? null,
      notified: recipients.size,
    });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
