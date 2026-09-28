// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {
  escapeHtml,
  fieldDiffPlainText,
  fieldDiffTableHtml,
  type FieldDiff,
} from '../_shared/transactional-html.ts';
import {
  claimTransactionalSend,
  recordTransactionalSend,
  sendResendEmail,
} from '../_shared/transactional-email.ts';
import { isBookingTiedSupplierEvent, isReviewTiedSupplierEvent, isAuthorizedSupplierSelfNotifyCaller, isSupplierSelfNotifyEvent, resolveSupplierEventContext } from '../_shared/notify-supplier-event-guard.ts';
import {
  guestMayInvokeSupplierEvent,
  isServiceRoleBearer,
  supplierEventPartyAllowsNotify,
} from '../_shared/notify-supplier-event-auth.ts';
import { authUserVerifiedEmail } from '../_shared/auth-verified-email.ts';
import { notifyUnpaidCheckoutFromPaymentStatus } from '../_shared/notify-unpaid-checkout.ts';
import { travelerOwnsCheckoutBooking } from '../_shared/booking-traveler-ownership.ts';
import { resolveSupplierEmailIdempotencyKey } from '../_shared/transactional-idempotency-key.ts';
import {
  supplierEventRequiresDeclinedCancellation,
  supplierLifecycleNotifyAllowed,
} from '../_shared/notify-lifecycle-gate.ts';

type EventType =
  | 'new_booking'
  | 'booking_cancelled'
  | 'new_review'
  | 'supplier_welcome'
  | 'verification_submitted'
  | 'guest_message'
  | 'booking_detail_changed'
  /** Copy of schedule change you saved — guest is notified separately */
  | 'host_schedule_updated'
  | 'cancellation_accepted'
  | 'cancellation_declined';

type Payload = {
  supplierId: string;
  eventType: EventType;
  listingId?: string;
  listingTitle?: string;
  bookingId?: string;
  bookingDate?: string;
  /** Phase 1528: exclusive stay check-out when listingKind is stay. */
  checkOutDate?: string;
  listingKind?: 'stay' | 'tour';
  guests?: number;
  guestName?: string;
  reviewRating?: number;
  reviewTitle?: string;
  /** new_review: the real reviews row this notification is about (Phase 579 ownership/content check). */
  reviewId?: string;
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
  /** booking_cancelled: true when traveler cancelled an unpaid checkout. */
  unpaidCheckout?: boolean;
  /** Explicit idempotency key. */
  idempotencyKey?: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// Phase 562: payload.portalBaseUrl used to be trusted verbatim, so any
// caller (this endpoint has no auth check on its own -- see index.ts's
// serve() handler) could send a legitimate-looking Traverion email to a
// real supplier's real inbox with every link/logo pointing at an
// attacker's domain. No legitimate caller needs to override the portal's
// own base URL, so it is now fixed, matching the same constant
// admin-supplier-verification/index.ts already hardcodes for supplier
// emails (no PARTNER_PORTAL_URL-style secret exists in this project, so
// an env override here would just be a dangling, never-set reference).
function siteBase(_payload: Payload): string {
  return 'https://partner.traverion.com';
}

function logoUrl(base: string): string {
  return `${base}/traverionlogotransparent.png?v=3`;
}

function eventSubject(payload: Payload): string {
  if (payload.eventType === 'supplier_welcome') return 'Welcome to Traverion for suppliers';
  if (payload.eventType === 'verification_submitted') {
    return 'We received your Traverion business verification';
  }
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
  if (payload.eventType === 'cancellation_accepted') {
    return `${refTag}Traveler accepted cancellation: ${listing}`;
  }
  if (payload.eventType === 'cancellation_declined') return `${refTag}Traveler declined cancellation: ${listing}`;
  if (payload.eventType === 'guest_message') {
    if (payload.fieldDiffs?.length) return `${refTag}Guest updated booking details: ${listing}`;
    return `${refTag}Message from a guest: ${listing}`;
  }
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
      // Keep in sync with SUPPLIER_WELCOME_LISTING_STEP_NOTE in booking-confirmation-copy.ts
      '2. Create your first listing (draft anytime). Publishing needs Traverion business and payout verification.',
      '',
      `Open your supplier portal: ${base}/partner`,
      '',
      '— Traverion',
    ].join('\n');
  }
  if (payload.eventType === 'verification_submitted') {
    const base = siteBase(payload);
    return [
      'Traverion received your business verification submission.',
      '',
      'Our team will review your details and registration document. Status updates appear in partner Settings — Traverion does not treat email as the decision.',
      '',
      `Open Settings: ${base}/partner/settings`,
      '',
      '— Traverion',
    ].join('\n');
  }
  const listing = payload.listingTitle ?? 'Listing';
  const lines: string[] = [];
  if (payload.eventType === 'host_schedule_updated') {
    lines.push('Schedule update confirmation (saved by you)');
    lines.push(`Listing: ${listing}`);
    // Keep in sync with SUPPLIER_HOST_SCHEDULE_UPDATED_NOTIFY_SUB
    lines.push('The guest sees the update on Trips; Traverion does not treat email delivery as proof they saw it.');
  } else if (payload.eventType === 'booking_cancelled') {
    lines.push(payload.unpaidCheckout === true ? 'Unpaid checkout cancelled (traveler)' : 'Booking cancelled (traveler)');
    lines.push(`Listing: ${listing}`);
    lines.push(
      payload.unpaidCheckout === true
        ? 'No payment was collected. The hold is released; nothing is Refund due.'
        : 'When a refund applies, traveler status is Refund due until Stripe records a refund — Traverion does not send refunds automatically.',
    );
  } else if (payload.eventType === 'cancellation_accepted') {
    lines.push('Traveler chose cancellation after your cancellation request.');
    lines.push(`Listing: ${listing}`);
    lines.push(
      'This booking is cancelled. Traveler refund is due until Stripe records Refunded — Traverion does not refund automatically.',
    );
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
  if (payload.listingKind === 'stay' && payload.bookingDate) {
    lines.push(`Check-in: ${payload.bookingDate}`);
    if (payload.checkOutDate) lines.push(`Check-out: ${payload.checkOutDate}`);
  } else if (payload.bookingDate) {
    lines.push(`Date: ${payload.bookingDate}`);
  }
  if (typeof payload.guests === 'number' && payload.guests > 0) lines.push(`Guests: ${payload.guests}`);
  if (payload.guestName) lines.push(`Guest: ${payload.guestName}`);
  if (typeof payload.reviewRating === 'number' && payload.reviewRating > 0) lines.push(`Rating: ${payload.reviewRating}/5`);
  if (payload.reviewTitle) lines.push(`Review: ${payload.reviewTitle}`);
  if (payload.messagePreview) {
    const previewLabel =
      payload.eventType === 'guest_message' && !(payload.fieldDiffs?.length)
        ? 'Message'
        : 'Latest note';
    lines.push(`${previewLabel}: ${payload.messagePreview}`);
  }
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
  const bookingsUrl = payload.bookingId
    ? `${base}/partner/bookings?booking=${encodeURIComponent(payload.bookingId)}`
    : `${base}/partner/bookings`;

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

  if (payload.eventType === 'verification_submitted') {
    const settingsUrl = `${base}/partner/settings`;
    return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f6f8;font-family:system-ui,-apple-system,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
<tr><td style="padding:28px 28px 12px;text-align:center;"><img src="${logo}" width="200" height="auto" alt="Traverion" style="display:block;margin:0 auto;max-width:85%;height:auto;border:0;"/></td></tr>
<tr><td style="padding:8px 32px 8px;font-size:20px;font-weight:700;color:#003580;font-family:Georgia,serif;">Verification received</td></tr>
<tr><td style="padding:0 32px 16px;font-size:14px;line-height:1.5;color:#4b5563;">Traverion successfully received your business verification submission. Our team will review it. Status updates appear in Settings.</td></tr>
<tr><td style="padding:0 32px 32px;"><a href="${settingsUrl}" style="display:inline-block;padding:12px 20px;background:#003580;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Open Settings</a></td></tr>
</table>
<p style="font-size:12px;color:#9ca3af;margin-top:16px;"><a href="${base}" style="color:#003580;">traverion.com</a></p>
</td></tr></table></body></html>`;
  }

  const listing = escapeHtml(payload.listingTitle ?? 'Your listing');
  let headline = 'Notification';
  let sub = '';
  if (payload.eventType === 'new_booking') {
    if (payload.bookingPaymentStatus === 'paid') {
      headline = 'New paid booking';
      // Keep in sync with SUPPLIER_NEW_BOOKING_PAID_NOTIFY_SUB
      sub =
        'A traveler completed payment online. The booking is confirmed — review details in Bookings. Traverion does not treat email delivery as proof you saw this booking.';
    } else {
      headline = 'New booking';
      // Keep in sync with SUPPLIER_NEW_BOOKING_PENDING_NOTIFY_SUB
      sub =
        'A traveler has a booking on your listing. Open Bookings to review details. If payment is still pending, the traveler completes checkout on Traverion — Traverion does not treat email delivery as proof you saw this booking.';
    }
  } else if (payload.eventType === 'booking_cancelled') {
    headline = payload.unpaidCheckout === true ? 'Unpaid checkout cancelled' : 'Booking cancelled';
    // Keep in sync with SUPPLIER_BOOKING_CANCELLED_*_NOTIFY_SUB in booking-confirmation-copy.ts
    sub =
      payload.unpaidCheckout === true
        ? 'The traveler cancelled an unpaid checkout. No payment was collected. The hold is released; nothing is Refund due. Check Bookings if you need the record.'
        : 'The traveler cancelled this booking. When a refund applies, traveler status is Refund due until Stripe records a refund — Traverion does not send refunds automatically. Inventory is released; check Bookings and Money.';
  } else if (payload.eventType === 'cancellation_accepted') {
    headline = 'Traveler chose cancellation';
    sub =
      'The traveler accepted your cancellation request (they chose cancel, not to keep the booking). The booking is cancelled. Traveler status is Refund due until Stripe records a refund — Traverion does not send refunds automatically.';
  } else if (payload.eventType === 'cancellation_declined') {
    headline = 'Traveler declined cancellation';
    // Keep in sync with SUPPLIER_CANCELLATION_DECLINED_NOTIFY_SUB
    sub =
      'The traveler declined your cancellation request. The booking stays active. Open Bookings — Traverion does not treat email delivery as proof you saw this update.';
  } else if (payload.eventType === 'new_review') {
    headline = 'New review';
    // Keep in sync with SUPPLIER_NEW_REVIEW_NOTIFY_SUB in booking-confirmation-copy.ts
    sub =
      'Someone left a review on your tour. Open Reviews in the partner portal — Traverion does not treat email delivery as proof you saw it.';
  } else if (payload.eventType === 'guest_message') {
    if (payload.fieldDiffs?.length) {
      headline = 'Guest updated their booking details';
      // Keep in sync with SUPPLIER_GUEST_DETAILS_UPDATED_NOTIFY_SUB
      sub =
        'A guest changed notes or meeting / place-of-stay information. Compare previous vs new values below. Bookings is the durable record; Traverion does not treat email delivery as proof you saw the update.';
    } else {
      headline = 'Message from a guest';
      // Keep in sync with SUPPLIER_GUEST_INBOX_MESSAGE_NOTIFY_SUB
      sub =
        'A guest posted a message on this booking. Open Inbox or Bookings — Traverion does not treat email delivery as proof you saw it.';
    }
  } else if (payload.eventType === 'booking_detail_changed') {
    headline = 'Booking details updated';
    // Keep in sync with SUPPLIER_BOOKING_DETAIL_CHANGED_NOTIFY_SUB in booking-confirmation-copy.ts
    sub =
      'Details changed for a booking — review in Bookings. Traverion does not treat email delivery as proof you saw the update.';
  } else if (payload.eventType === 'host_schedule_updated') {
    headline = 'Schedule update saved';
    // Keep in sync with SUPPLIER_HOST_SCHEDULE_UPDATED_NOTIFY_SUB in booking-confirmation-copy.ts
    sub =
      'You just updated start or pickup times for this booking. Below is a record of what changed. The guest sees the update on Trips; Traverion does not treat email delivery as proof they saw it.';
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
    if (payload.listingKind === 'stay') {
      rows.push(
        `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Check-in</td><td style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(payload.bookingDate)}</td></tr>`,
      );
      if (payload.checkOutDate) {
        rows.push(
          `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Check-out</td><td style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(payload.checkOutDate)}</td></tr>`,
        );
      }
    } else {
      rows.push(
        `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Date</td><td style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(payload.bookingDate)}</td></tr>`,
      );
    }
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
    const previewLabel =
      payload.eventType === 'guest_message' && !(payload.fieldDiffs?.length)
        ? 'Message'
        : 'Latest note';
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;vertical-align:top;">${previewLabel}</td><td style="padding:6px 0;font-size:14px;color:#111827;line-height:1.5;">${escapeHtml(payload.messagePreview)}</td></tr>`,
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
<a href="${bookingsUrl}" style="display:inline-block;padding:12px 20px;background:#003580;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${payload.bookingId ? 'Open booking' : 'View in supplier dashboard'}</a>
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

    // Phase 1033: supplier_welcome / verification_submitted have no booking to
    // re-derive against. Mirror traveler_welcome (Phase 580): require the
    // caller's JWT user id to match payload.supplierId. Legitimate callers
    // (SupplierAuth, Settings) already invoke with the supplier session.
    // No Stripe/webhook/cron callers use these eventTypes.
    if (isSupplierSelfNotifyEvent(payload.eventType)) {
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
      const authHeader = req.headers.get('Authorization') ?? '';
      if (!anonKey) {
        return json({ success: false, error: 'SUPABASE_ANON_KEY not configured' }, 500);
      }
      if (!authHeader) {
        return json({ success: false, error: 'Missing Authorization header' }, 401);
      }
      const authedClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: authData, error: authError } = await authedClient.auth.getUser();
      if (authError || !isAuthorizedSupplierSelfNotifyCaller(authData?.user?.id, payload.supplierId)) {
        return json({ success: false, error: 'Unauthorized' }, 401);
      }
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    // Phase 1139: fieldDiffs/changeSummary only from supplier-side or service-role
    // (guest_message / booking_detail_changed may still carry guest-authored copy).
    let allowCallerFieldDiffs = false;

    // Phase 1093: booking/review-tied kinds reject anonymous forgery (1092 parity).
    // Service-role (webhook/promote) or JWT owner/team/guest/review-author only.
    // Recipient remains DB-derived; static fields remain re-derived; this closes
    // the open send gate so fieldDiffs/messagePreview cannot be forged anonymously.
    // Phase 1127: guest JWT may only invoke guest-originated booking events.
    if (isBookingTiedSupplierEvent(payload.eventType) || isReviewTiedSupplierEvent(payload.eventType)) {
      const authHeader = req.headers.get('Authorization');
      if (isServiceRoleBearer(authHeader, serviceRoleKey)) {
        allowCallerFieldDiffs = true;
      } else {
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
        if (!anonKey || !authHeader) {
          return json({ success: false, error: 'Unauthorized' }, 401);
        }
        const authedClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: authData, error: authError } = await authedClient.auth.getUser();
        const callerId = authData?.user?.id ?? null;
        // Phase 1120: guest-email party match requires confirmed email.
        const callerEmail = authUserVerifiedEmail(authData?.user);
        if (authError || !callerId) {
          return json({ success: false, error: 'Unauthorized' }, 401);
        }

        const listingId = String(payload.listingId ?? '').trim();
        if (!listingId) {
          return json({ success: false, error: 'Unauthorized' }, 401);
        }
        const { data: listingOwn } = await admin
          .from('listings')
          .select('supplier_id')
          .eq('id', listingId)
          .maybeSingle();
        const listingSupplierId = String(listingOwn?.supplier_id ?? '').trim();

        let guestUserId: string | null = null;
        let guestEmail: string | null = null;
        let reviewAuthorUserId: string | null = null;
        let callerIsTeamMember = false;

        if (isBookingTiedSupplierEvent(payload.eventType)) {
          const bookingId = String(payload.bookingId ?? '').trim();
          if (!bookingId) {
            return json({ success: false, error: 'Unauthorized' }, 401);
          }
          const { data: partyBooking } = await admin
            .from('bookings')
            .select('guest_user_id, guest_email, listing_id')
            .eq('id', bookingId)
            .maybeSingle();
          if (!partyBooking || String(partyBooking.listing_id ?? '').trim() !== listingId) {
            return json({ success: false, error: 'Unauthorized' }, 401);
          }
          guestUserId = partyBooking.guest_user_id ?? null;
          guestEmail = partyBooking.guest_email ?? null;
        } else {
          const reviewId = String(payload.reviewId ?? '').trim();
          if (!reviewId) {
            return json({ success: false, error: 'Unauthorized' }, 401);
          }
          const { data: partyReview } = await admin
            .from('reviews')
            .select('user_id, listing_id')
            .eq('id', reviewId)
            .maybeSingle();
          if (!partyReview || String(partyReview.listing_id ?? '').trim() !== listingId) {
            return json({ success: false, error: 'Unauthorized' }, 401);
          }
          reviewAuthorUserId = partyReview.user_id ?? null;
        }

        if (callerId !== listingSupplierId) {
          const { data: teamRow, error: teamErr } = await admin
            .from('supplier_team_members')
            .select('user_id')
            .eq('supplier_id', String(payload.supplierId).trim())
            .eq('user_id', callerId)
            .maybeSingle();
          // Phase 1317: team lookup failure ≠ invent “not a team member”.
          if (teamErr) {
            return json({ success: false, error: 'Could not verify authorization. Try again.' }, 500);
          }
          callerIsTeamMember = Boolean(teamRow?.user_id);
        }

        if (
          !supplierEventPartyAllowsNotify({
            callerUserId: callerId,
            callerEmail,
            listingSupplierId,
            claimedSupplierId: payload.supplierId,
            callerIsTeamMember,
            guestUserId,
            guestEmail,
            reviewAuthorUserId,
          })
        ) {
          return json({ success: false, error: 'Unauthorized' }, 401);
        }

        const callerIsSupplierSide =
          (listingSupplierId.length > 0 && callerId === listingSupplierId) || callerIsTeamMember;
        const callerIsGuest = travelerOwnsCheckoutBooking({
          authUserId: callerId,
          verifiedEmail: callerEmail,
          guestUserId,
          guestEmail,
        });
        // Phase 1127: guests must not fire host/ops supplier events.
        if (
          callerIsGuest &&
          !callerIsSupplierSide &&
          isBookingTiedSupplierEvent(payload.eventType) &&
          !guestMayInvokeSupplierEvent(payload.eventType)
        ) {
          return json({ success: false, error: 'Unauthorized' }, 401);
        }
        allowCallerFieldDiffs = callerIsSupplierSide;
      }
    }

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

    if (payload.eventType === 'verification_submitted') {
      const { data: prof } = await admin
        .from('supplier_profiles')
        .select('verification_submitted_email_sent_at')
        .eq('id', payload.supplierId)
        .maybeSingle();
      if (prof?.verification_submitted_email_sent_at) {
        return json({ success: true, skipped: true, notified: 0 });
      }
    }

    // Phase 579: this endpoint's recipient resolution was already safe --
    // always DB-derived from supplierId, never a caller-supplied address --
    // but every content field (listingTitle, guestName, bookingDate, guests,
    // bookingNumber, bookingPaymentStatus, reviewRating, reviewTitle) was
    // trusted verbatim from the request, for every eventType. An attacker
    // who knew or guessed a real supplierId could trigger a fully fabricated
    // "new booking", "booking cancelled", "cancellation accepted/declined",
    // or "new review" notification to that supplier's real inbox. Every
    // booking-tied eventType now requires bookingId+listingId and re-derives
    // its fields from the real bookings/listings rows; new_review now
    // requires reviewId+listingId and re-derives from the real reviews row.
    // messagePreview/changeSummary/fieldDiffs/unpaidCheckout have no single
    // authoritative DB source and remain caller-supplied (same scoping
    // decision Phase 578 made for notify-customer-booking's fieldDiffs), but
    // forging them now requires citing a real booking/review that actually
    // belongs to the targeted supplier, not merely a real supplierId. See
    // ../_shared/notify-supplier-event-guard.ts.
    let listingRow: { id?: string | null; supplier_id?: string | null; title?: string | null } | null = null;
    let bookingRow:
      | {
          id?: string | null;
          listing_id?: string | null;
          guest_name?: string | null;
          booking_date?: string | null;
          guests?: number | null;
          booking_number?: number | null;
          payment_status?: string | null;
          status?: string | null;
        }
      | null = null;
    let reviewRow:
      | { id?: string | null; listing_id?: string | null; rating?: number | null; title?: string | null; guest_name?: string | null }
      | null = null;

    if (isBookingTiedSupplierEvent(payload.eventType) || isReviewTiedSupplierEvent(payload.eventType)) {
      const listingId = String(payload.listingId ?? '').trim();
      if (listingId) {
        const { data } = await admin.from('listings').select('id, supplier_id, title').eq('id', listingId).maybeSingle();
        listingRow = data;
      }
      if (isBookingTiedSupplierEvent(payload.eventType)) {
        const bookingId = String(payload.bookingId ?? '').trim();
        if (bookingId) {
          const { data } = await admin
            .from('bookings')
            .select(
              'id, listing_id, guest_name, booking_date, check_out, nights, guests, booking_number, payment_status, status, purchase_snapshot'
            )
            .eq('id', bookingId)
            .maybeSingle();
          bookingRow = data;
        }
      } else {
        const reviewId = String(payload.reviewId ?? '').trim();
        if (reviewId) {
          const { data } = await admin
            .from('reviews')
            .select('id, listing_id, rating, title, guest_name')
            .eq('id', reviewId)
            .maybeSingle();
          reviewRow = data;
        }
      }
    }

    const resolved = resolveSupplierEventContext({
      eventType: payload.eventType,
      supplierId: payload.supplierId,
      bookingId: payload.bookingId,
      listingId: payload.listingId,
      reviewId: payload.reviewId,
      listingRow,
      bookingRow,
      reviewRow,
    });
    if (!resolved.ok) {
      return json({ success: false, error: resolved.error }, resolved.status);
    }

    // Phase 1511: cancel/accept/decline supplier mail must match booking truth.
    let declinedCancellationRequest: boolean | null = null;
    if (
      supplierEventRequiresDeclinedCancellation(payload.eventType) &&
      String(payload.bookingId ?? '').trim()
    ) {
      const { data: cancelRows } = await admin
        .from('cancellation_requests')
        .select('status')
        .eq('booking_id', String(payload.bookingId).trim())
        .order('created_at', { ascending: false })
        .limit(5);
      declinedCancellationRequest = (cancelRows ?? []).some(
        (r: { status?: string }) => String(r.status ?? '').trim().toLowerCase() === 'declined'
      );
    }
    const lifecycleGate = supplierLifecycleNotifyAllowed({
      eventType: payload.eventType,
      bookingStatus: bookingRow?.status ?? null,
      declinedCancellationRequest,
    });
    if (!lifecycleGate.ok) {
      return json({ success: false, error: lifecycleGate.error }, lifecycleGate.status);
    }

    const effectivePayload: Payload = { ...payload, ...resolved.overrides };
    // Phase 1129: cancel unpaid copy from booking payment_status, not caller flag.
    if (effectivePayload.eventType === 'booking_cancelled' && bookingRow) {
      effectivePayload.unpaidCheckout = notifyUnpaidCheckoutFromPaymentStatus(bookingRow.payment_status);
    }
    // Phase 1139: guests may not forge cancel fieldDiffs; rebuild from unpaid truth.
    if (effectivePayload.eventType === 'booking_cancelled' && !allowCallerFieldDiffs) {
      const unpaid = effectivePayload.unpaidCheckout === true;
      effectivePayload.changeSummary = undefined;
      effectivePayload.fieldDiffs = [
        {
          label: 'Cancellation & refund',
          before: unpaid ? 'Unpaid checkout' : 'Active booking',
          after: unpaid
            ? 'Unpaid checkout cancelled — no payment collected'
            : 'Cancelled — refund status follows Trips / Stripe',
        },
      ];
    }

    // Phase 1510: client idempotencyKey may only extend supplier:${eventType}:…
    const idempotencyKey = resolveSupplierEmailIdempotencyKey({
      eventType: payload.eventType,
      supplierId: payload.supplierId,
      bookingId: payload.bookingId,
      clientKey: typeof payload.idempotencyKey === 'string' ? payload.idempotencyKey : null,
    });

    const claim = await claimTransactionalSend(admin, {
      idempotencyKey,
      channel: 'supplier',
      templateKey: payload.eventType,
      entityType: payload.bookingId ? 'booking' : 'supplier_profile',
      entityId: payload.bookingId ?? payload.supplierId,
      cooldownSeconds:
        payload.eventType === 'guest_message' || payload.eventType === 'booking_detail_changed'
          ? 900
          : undefined,
    });
    if (claim.action === 'skip') {
      return json({ success: true, skipped: true, reason: claim.reason, notified: 0, idempotencyKey });
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

    const textBody = eventBody(effectivePayload);
    const htmlBody = eventHtml(effectivePayload);

    const sent = await sendResendEmail({
      apiKey,
      from: fromEmail,
      to: [...recipients],
      subject: eventSubject(effectivePayload),
      text: textBody,
      html: htmlBody,
    });

    if (!sent.ok) {
      await recordTransactionalSend(admin, {
        idempotencyKey,
        channel: 'supplier',
        templateKey: payload.eventType,
        recipientEmail: [...recipients].join(','),
        entityType: payload.bookingId ? 'booking' : 'supplier_profile',
        entityId: payload.bookingId ?? payload.supplierId,
        status: 'failed',
        errorMessage: sent.error,
      });
      return json({ success: false, error: 'Email could not be sent. Delivery is not available right now.' }, 500);
    }

    await recordTransactionalSend(admin, {
      idempotencyKey,
      channel: 'supplier',
      templateKey: payload.eventType,
      recipientEmail: [...recipients].join(','),
      entityType: payload.bookingId ? 'booking' : 'supplier_profile',
      entityId: payload.bookingId ?? payload.supplierId,
      providerMessageId: sent.id,
      status: 'sent',
    });

    const now = new Date().toISOString();
    if (payload.eventType === 'supplier_welcome') {
      await admin
        .from('supplier_profiles')
        .update({ welcome_email_sent_at: now, updated_at: now })
        .eq('id', payload.supplierId);
    }
    if (payload.eventType === 'verification_submitted') {
      await admin
        .from('supplier_profiles')
        .update({ verification_submitted_email_sent_at: now, updated_at: now })
        .eq('id', payload.supplierId);
    }

    return json({
      success: true,
      providerMessageId: sent.id ?? null,
      notified: recipients.size,
      idempotencyKey,
    });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
