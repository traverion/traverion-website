// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {
  escapeHtml,
  fieldDiffPlainText,
  fieldDiffTableHtml,
  transactionalEmailDocument,
  travelerTimeLabel,
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
  supplierTeamRoleIsEditor,
} from '../_shared/notify-supplier-event-auth.ts';
import { authUserVerifiedEmail } from '../_shared/auth-verified-email.ts';
import { notifyUnpaidCheckoutFromPaymentStatus } from '../_shared/notify-unpaid-checkout.ts';
import { travelerOwnsCheckoutBooking } from '../_shared/booking-traveler-ownership.ts';
import { resolveSupplierEmailIdempotencyKey } from '../_shared/transactional-idempotency-key.ts';
import {
  supplierEventRequiresDeclinedCancellation,
  supplierLifecycleNotifyAllowed,
} from '../_shared/notify-lifecycle-gate.ts';
import { isTransactionalEmailLogOnly } from '../_shared/transactional-email-mode.ts';

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
  | 'cancellation_declined'
  /** Phase 1733: Stripe full refund — Money/ledger reversed */
  | 'refund_completed'
  | 'refund_initiated'
  /** Phase 1735: Stripe partial refund — amount_paid shrunk, stays Paid */
  | 'partial_refund_recorded';

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
  /** new_review: traveler chose public anonymity (supplier still sees booking guest name). */
  reviewPostedAnonymously?: boolean;
  /** new_review: the real reviews row this notification is about (Phase 579 ownership/content check). */
  reviewId?: string;
  /** Base site URL (no trailing slash), e.g. https://www.traverion.com — used in supplier_welcome body */
  portalBaseUrl?: string;
  /** Short preview of a guest message (guest_message) */
  messagePreview?: string;
  /** Human-readable summary of what changed (booking_detail_changed) */
  changeSummary?: string;
  /** new_booking: whether traveler already paid online (Stripe), or Request-to-Book authorized. */
  bookingPaymentStatus?: 'paid' | 'pending' | 'none' | 'authorized';
  /** guest_message / booking_detail_changed: structured previous → new values. */
  fieldDiffs?: FieldDiff[];
  /** Global sequential order number; emails show as #N */
  bookingNumber?: number;
  /** booking_cancelled: true when traveler cancelled an unpaid checkout. */
  unpaidCheckout?: boolean;
  /**
   * Phase 1724: booking_cancelled paid path — DB refund_choice after rebuild
   * (`full_refund` / `no_refund`). Callers must not forge this; server overwrites.
   */
  refundChoice?: string | null;
  /**
   * Phase 1738: Stripe refund emails — major units for the refunded figure
   * (incremental on partial; cumulative on full). Service-role webhook only.
   */
  refundAmount?: number;
  currency?: string;
  /** Phase 1738 partial: remaining bookings.amount_paid after shrink. */
  amountPaidRemaining?: number;
  /**
   * Phase 1740: partial refund on cancelled Refund due — honest copy (not “stays Paid”).
   * Re-derived from booking row when possible; webhook may also pass.
   */
  cancelledRefundDue?: boolean;
  /** Explicit idempotency key. */
  idempotencyKey?: string;
  /** Purchased option, clock, place, and contact. Re-derived from the booking row. */
  optionLabel?: string;
  startTimeLabel?: string;
  guestEmail?: string;
  arrivalLabel?: string;
  arrivalPlace?: string;
  publicReference?: string;
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

function eventSubject(payload: Payload): string {
  if (payload.eventType === 'supplier_welcome') return 'Welcome to Traverion for suppliers';
  if (payload.eventType === 'verification_submitted') {
    return 'We received your Traverion business verification';
  }
  const listing = payload.listingTitle ?? 'your listing';
  const ref = (payload.publicReference ?? '').trim();
  const dated = payload.bookingDate ? ` · ${payload.bookingDate}` : '';
  if (payload.eventType === 'new_booking') {
    if (payload.bookingPaymentStatus === 'authorized') {
      return `Booking request · ${listing}${dated}`;
    }
    if (payload.bookingPaymentStatus === 'paid') return `New booking · ${listing}${dated}`;
    return `New booking · ${listing}${dated}`;
  }
  if (payload.eventType === 'booking_cancelled') {
    return ref ? `Booking cancelled · ${ref}` : `Booking cancelled · ${listing}`;
  }
  if (payload.eventType === 'cancellation_accepted') {
    return ref ? `Booking cancelled · ${ref}` : `Traveler accepted cancellation · ${listing}`;
  }
  if (payload.eventType === 'cancellation_declined') {
    return ref ? `Cancellation declined · ${ref}` : `Traveler declined cancellation · ${listing}`;
  }
  if (payload.eventType === 'guest_message') {
    if (payload.fieldDiffs?.length) return ref ? `Booking updated · ${ref}` : `Guest updated booking details · ${listing}`;
    return ref ? `New message · ${ref}` : `Message from a guest · ${listing}`;
  }
  if (payload.eventType === 'booking_detail_changed') {
    return ref ? `Booking updated · ${ref}` : `Booking updated · ${listing}`;
  }
  if (payload.eventType === 'host_schedule_updated') {
    return ref ? `Schedule updated · ${ref}` : `Schedule updated · ${listing}`;
  }
  if (payload.eventType === 'refund_completed') {
    return ref ? `Refund complete · ${ref}` : `Refund recorded · ${listing}`;
  }
  if (payload.eventType === 'refund_initiated') {
    return ref ? `Refund submitted · ${ref}` : `Refund submitted to Stripe · ${listing}`;
  }
  if (payload.eventType === 'partial_refund_recorded') {
    return ref ? `Partial refund · ${ref}` : `Partial refund recorded · ${listing}`;
  }
  if (payload.eventType === 'new_review') {
    const stars =
      typeof payload.reviewRating === 'number' && payload.reviewRating >= 1 && payload.reviewRating <= 5
        ? payload.reviewRating
        : null;
    return stars != null ? `New ${stars}-star review received · ${listing}` : `New review · ${listing}`;
  }
  return `New review · ${listing}`;
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
      'Our team will review your details and registration document. Status updates appear in partner Settings.',
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
    lines.push('The guest can see the update on their booking.');
  } else if (payload.eventType === 'booking_cancelled') {
    lines.push(payload.unpaidCheckout === true ? 'Unpaid checkout cancelled (traveler)' : 'Booking cancelled (traveler)');
    lines.push(`Listing: ${listing}`);
    // Phase 1724: paid cancel plain-text follows DB refund_choice (keep in sync with eventHtml).
    lines.push(
      payload.unpaidCheckout === true
        ? 'No payment was collected. The hold is released; nothing is Refund due.'
        : payload.refundChoice === 'full_refund'
          ? 'A full refund is due. For stays Traverion submits the refund to Stripe automatically. Inventory is released.'
          : payload.refundChoice === 'no_refund'
            ? 'No refund applies for this traveler-initiated cancellation. Inventory is released.'
            : 'When a refund applies, traveler status updates when Stripe confirms the refund.',
    );
  } else if (payload.eventType === 'cancellation_accepted') {
    lines.push('Traveler chose cancellation after your cancellation request.');
    lines.push(`Listing: ${listing}`);
    lines.push(
      'This booking is cancelled. For stays Traverion submits a full refund to Stripe automatically. Status becomes Refunded when Stripe confirms it.',
    );
  } else if (payload.eventType === 'refund_initiated') {
    lines.push('A refund was submitted to Stripe for this cancelled booking.');
    lines.push(`Listing: ${listing}`);
    if (typeof payload.refundAmount === 'number' && Number.isFinite(payload.refundAmount)) {
      const cur = (payload.currency ?? 'EUR').trim().toUpperCase() || 'EUR';
      lines.push(`Refund amount: ${cur} ${payload.refundAmount.toFixed(2)}`);
    }
    lines.push('Bookings will show Refunded when Stripe confirms the refund. Earnings were already reversed on cancel.');
  } else if (payload.eventType === 'cancellation_declined') {
    lines.push('Traveler declined your cancellation request.');
    lines.push(`Listing: ${listing}`);
    lines.push('The booking stays active. Open Bookings if you need the record.');
  } else if (payload.eventType === 'refund_completed') {
    // Phase 1733/1738: keep in sync with SUPPLIER_REFUND_COMPLETED_NOTIFY_SUB
    lines.push('Stripe recorded a full refund for this booking.');
    lines.push(`Listing: ${listing}`);
    if (typeof payload.refundAmount === 'number' && Number.isFinite(payload.refundAmount)) {
      const cur = (payload.currency ?? 'EUR').trim().toUpperCase() || 'EUR';
      lines.push(`Refunded: ${cur} ${payload.refundAmount.toFixed(2)}`);
    }
    lines.push(
      'Stripe recorded a full refund for this booking. Payment status is Refunded. Collected earnings for this booking were reversed. Check Bookings and Income — Traverion does not treat email delivery as proof you saw this.'
    );
  } else if (payload.eventType === 'partial_refund_recorded') {
    // Phase 1735/1738/1740
    lines.push('Stripe recorded a partial refund for this booking.');
    lines.push(`Listing: ${listing}`);
    if (typeof payload.refundAmount === 'number' && Number.isFinite(payload.refundAmount)) {
      const cur = (payload.currency ?? 'EUR').trim().toUpperCase() || 'EUR';
      lines.push(`Refunded this time: ${cur} ${payload.refundAmount.toFixed(2)}`);
    }
    if (
      typeof payload.amountPaidRemaining === 'number' &&
      Number.isFinite(payload.amountPaidRemaining)
    ) {
      const cur = (payload.currency ?? 'EUR').trim().toUpperCase() || 'EUR';
      lines.push(
        payload.cancelledRefundDue
          ? `Refund due remaining: ${cur} ${payload.amountPaidRemaining.toFixed(2)}`
          : `Collected remaining: ${cur} ${payload.amountPaidRemaining.toFixed(2)}`
      );
    }
    if (payload.cancelledRefundDue) {
      lines.push(
        'The booking is already cancelled (Refund due). This partial refund reduces the remaining charge.'
      );
    } else {
      lines.push(
        'The booking stays paid. The collected amount was reduced to the remaining charge.'
      );
    }
  } else {
    lines.push(`Event: ${payload.eventType}`);
    lines.push(`Listing: ${listing}`);
  }
  if (payload.eventType === 'new_booking' && payload.bookingPaymentStatus === 'paid') {
    lines.push('Payment: paid online (Stripe)');
  } else if (payload.eventType === 'new_booking' && payload.bookingPaymentStatus === 'authorized') {
    lines.push('Payment: authorized · capture after you accept (24h)');
  } else if (payload.eventType === 'new_booking') {
    lines.push('Payment: pending / not via online checkout');
  }
  if (payload.publicReference) lines.push(`Booking reference: ${payload.publicReference}`);
  if (payload.listingKind === 'stay' && payload.bookingDate) {
    lines.push(`Check-in: ${payload.bookingDate}`);
    if (payload.checkOutDate) lines.push(`Check-out: ${payload.checkOutDate}`);
  } else if (payload.bookingDate) {
    lines.push(`Date: ${payload.bookingDate}`);
  }
  if (typeof payload.guests === 'number' && payload.guests > 0) lines.push(`Guests: ${payload.guests}`);
  if (payload.optionLabel) lines.push(`Option: ${payload.optionLabel}`);
  if (payload.startTimeLabel) lines.push(`Start time: ${payload.startTimeLabel}`);
  if (payload.guestName) lines.push(`Guest: ${payload.guestName}`);
  // new_review: never include guest email — privacy (booking party name is enough).
  if (payload.guestEmail && payload.eventType !== 'new_review') {
    lines.push(`Guest email: ${payload.guestEmail}`);
  }
  if (payload.eventType === 'new_review' && payload.reviewPostedAnonymously) {
    lines.push('Public display: Anonymous traveler');
  }
  if (payload.arrivalLabel && payload.arrivalPlace) {
    lines.push(`${payload.arrivalLabel}: ${payload.arrivalPlace}`);
  }
  if (typeof payload.reviewRating === 'number' && payload.reviewRating > 0) lines.push(`Rating: ${payload.reviewRating}/5`);
  if (payload.reviewTitle) lines.push(`Review: ${payload.reviewTitle}`);
  if (payload.messagePreview) {
    const previewLabel =
      payload.eventType === 'new_review'
        ? 'Comment'
        : payload.eventType === 'guest_message' && !(payload.fieldDiffs?.length)
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
  const portal = `${base}/partner`;
  // Stays open Reservations; tours/activities open Bookings.
  const deskPath = payload.listingKind === 'stay' ? '/partner/reservations' : '/partner/bookings';
  const bookingsUrl =
    payload.eventType === 'new_review' && payload.reviewId
      ? `${base}/partner/reviews?highlight=${encodeURIComponent(payload.reviewId)}`
      : payload.bookingId
        ? `${base}${deskPath}?booking=${encodeURIComponent(payload.bookingId)}`
        : `${base}${deskPath}`;

  if (payload.eventType === 'supplier_welcome') {
    const bodyText = escapeHtml(eventBody(payload)).replace(/\n/g, '<br/>');
    return transactionalEmailDocument({
      headline: 'Welcome to Traverion',
      introHtml: `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#3d4450;">${bodyText}</p>`,
      bodyHtml: '',
      ctaUrl: portal,
      ctaLabel: 'Open supplier portal',
      siteUrl: 'https://www.traverion.com',
    });
  }

  if (payload.eventType === 'verification_submitted') {
    const settingsUrl = `${base}/partner/settings`;
    return transactionalEmailDocument({
      headline: 'Verification received',
      introHtml: '<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#3d4450;">We received your business verification. Status updates appear in Settings.</p>',
      bodyHtml: '',
      ctaUrl: settingsUrl,
      ctaLabel: 'Open Settings',
      siteUrl: 'https://www.traverion.com',
    });
  }

  const listing = escapeHtml(payload.listingTitle ?? 'Your listing');
  let headline = 'Notification';
  let sub = '';
  if (payload.eventType === 'new_booking') {
    if (payload.bookingPaymentStatus === 'paid') {
      headline = 'New booking confirmed';
      // Keep in sync with SUPPLIER_NEW_BOOKING_PAID_NOTIFY_SUB
      sub =
        'Payment is confirmed. The booking details are below.';
    } else if (payload.bookingPaymentStatus === 'authorized') {
      headline = 'New booking request';
      sub =
        'A guest requested this stay. Payment is authorized. Accept within 24 hours to capture payment, or decline to release the hold.';
    } else {
      headline = 'New booking';
      // Keep in sync with SUPPLIER_NEW_BOOKING_PENDING_NOTIFY_SUB
      sub =
        'A traveler started this booking. Payment is not confirmed yet.';
    }
  } else if (payload.eventType === 'booking_cancelled') {
    headline = payload.unpaidCheckout === true ? 'Unpaid checkout cancelled' : 'Booking cancelled';
    // Keep in sync with SUPPLIER_BOOKING_CANCELLED_*_NOTIFY_SUB in booking-confirmation-copy.ts
    // Phase 1724: paid path branches on DB refund_choice (full_refund / no_refund).
    sub =
      payload.unpaidCheckout === true
        ? 'The traveler cancelled an unpaid checkout. No payment was collected. The hold is released; nothing is Refund due. Check Bookings if you need the record.'
        : payload.refundChoice === 'full_refund'
          ? 'The traveler cancelled this booking. A full refund is due until Stripe records it — Traverion does not send refunds automatically. Inventory is released; check Bookings and Income.'
          : payload.refundChoice === 'no_refund'
            ? 'The traveler cancelled this booking. No refund applies for this traveler-initiated cancellation. Inventory is released; check Bookings.'
            : 'The traveler cancelled this booking. When a refund applies, traveler status is Refund due until Stripe records a refund — Traverion does not send refunds automatically. Inventory is released; check Bookings and Money.';
  } else if (payload.eventType === 'cancellation_accepted') {
    headline = 'Traveler chose cancellation';
    sub =
      'The traveler accepted your cancellation request (they chose cancel, not to keep the booking). The booking is cancelled. Traveler status is Refund due until Stripe records a refund — Traverion does not send refunds automatically.';
  } else if (payload.eventType === 'cancellation_declined') {
    headline = 'Traveler declined cancellation';
    // Keep in sync with SUPPLIER_CANCELLATION_DECLINED_NOTIFY_SUB
    sub =
      'The traveler declined your cancellation request. The booking stays active.';
  } else if (payload.eventType === 'refund_completed') {
    headline = 'Refund recorded';
    // Keep in sync with SUPPLIER_REFUND_COMPLETED_NOTIFY_SUB
    sub =
      'Stripe recorded a full refund for this booking. Payment status is Refunded. Collected earnings for this booking were reversed. Check Bookings and Income — Traverion does not treat email delivery as proof you saw this.';
  } else if (payload.eventType === 'partial_refund_recorded') {
    headline = 'Partial refund recorded';
    sub = payload.cancelledRefundDue
      ? 'The booking is already cancelled (Refund due). Stripe recorded a partial refund and reduced the remaining charge. The booking stays cancelled.'
      : 'Stripe recorded a partial refund. The booking stays paid for the remaining amount.';
  } else if (payload.eventType === 'new_review') {
    const stars =
      typeof payload.reviewRating === 'number' && payload.reviewRating >= 1 && payload.reviewRating <= 5
        ? payload.reviewRating
        : null;
    headline = stars != null ? `New ${stars}-star review received` : 'New review received';
    // Keep in sync with SUPPLIER_NEW_REVIEW_NOTIFY_SUB in booking-confirmation-copy.ts
    sub = payload.messagePreview?.trim()
      ? 'A traveler left a review. Open Reviews to read it and reply.'
      : stars != null
        ? `Customer left a ${stars}-star rating. Open Reviews in the partner portal.`
        : 'A traveler left a review. Open Reviews to read it.';
  } else if (payload.eventType === 'guest_message') {
    if (payload.fieldDiffs?.length) {
      headline = 'Guest updated their booking details';
      // Keep in sync with SUPPLIER_GUEST_DETAILS_UPDATED_NOTIFY_SUB
      sub =
        'A guest updated their booking details. Previous and new values are below.';
    } else {
      headline = 'Message from a guest';
      // Keep in sync with SUPPLIER_GUEST_INBOX_MESSAGE_NOTIFY_SUB
      sub =
        'A guest sent a message on this booking.';
    }
  } else if (payload.eventType === 'booking_detail_changed') {
    headline = 'Booking details updated';
    // Keep in sync with SUPPLIER_BOOKING_DETAIL_CHANGED_NOTIFY_SUB in booking-confirmation-copy.ts
    sub =
      'Details changed for this booking.';
  } else if (payload.eventType === 'host_schedule_updated') {
    headline = 'Schedule update saved';
    // Keep in sync with SUPPLIER_HOST_SCHEDULE_UPDATED_NOTIFY_SUB in booking-confirmation-copy.ts
    sub =
      'You updated the start or pickup time. The change is shown below.';
  }

  const rows: string[] = [];
  rows.push(`<tr><td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280;width:140px;vertical-align:top;">Experience</td><td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0b1f44;font-weight:700;">${listing}</td></tr>`);
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
  if (payload.publicReference) {
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Reference</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;">${escapeHtml(payload.publicReference)}</td></tr>`,
    );
  }
  if (payload.optionLabel) {
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Option</td><td style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(payload.optionLabel)}</td></tr>`,
    );
  }
  if (payload.startTimeLabel) {
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Start time</td><td style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(payload.startTimeLabel)}</td></tr>`,
    );
  }
  if (payload.guestName) {
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Guest</td><td style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(payload.guestName)}</td></tr>`,
    );
  }
  if (payload.eventType === 'new_review' && payload.reviewPostedAnonymously) {
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Public display</td><td style="padding:6px 0;font-size:14px;color:#111827;">Anonymous traveler</td></tr>`,
    );
  }
  if (payload.guestEmail && payload.eventType !== 'new_review') {
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Guest email</td><td style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(payload.guestEmail)}</td></tr>`,
    );
  }
  if (payload.arrivalLabel && payload.arrivalPlace) {
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">${escapeHtml(payload.arrivalLabel)}</td><td style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(payload.arrivalPlace)}</td></tr>`,
    );
  }
  // Phase 1738: refund amounts for host Money honesty (parity with traveler mail).
  if (
    (payload.eventType === 'refund_completed' || payload.eventType === 'partial_refund_recorded') &&
    typeof payload.refundAmount === 'number' &&
    Number.isFinite(payload.refundAmount)
  ) {
    const cur = escapeHtml((payload.currency ?? 'EUR').trim().toUpperCase() || 'EUR');
    const label = payload.eventType === 'partial_refund_recorded' ? 'Refunded this time' : 'Refunded';
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">${label}</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;">${cur} ${payload.refundAmount.toFixed(2)}</td></tr>`,
    );
  }
  if (
    payload.eventType === 'partial_refund_recorded' &&
    typeof payload.amountPaidRemaining === 'number' &&
    Number.isFinite(payload.amountPaidRemaining)
  ) {
    const cur = escapeHtml((payload.currency ?? 'EUR').trim().toUpperCase() || 'EUR');
    const remLabel = payload.cancelledRefundDue ? 'Refund due remaining' : 'Collected remaining';
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">${remLabel}</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;">${cur} ${payload.amountPaidRemaining.toFixed(2)}</td></tr>`,
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
      payload.eventType === 'new_review'
        ? 'Comment'
        : payload.eventType === 'guest_message' && !(payload.fieldDiffs?.length)
          ? 'Message'
          : 'Latest note';
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;vertical-align:top;">${previewLabel}</td><td style="padding:6px 0;font-size:14px;color:#111827;line-height:1.5;">${escapeHtml(payload.messagePreview)}</td></tr>`,
    );
  } else if (payload.eventType === 'new_review' && typeof payload.reviewRating === 'number') {
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;vertical-align:top;">Comment</td><td style="padding:6px 0;font-size:14px;color:#111827;line-height:1.5;">Customer left a ${payload.reviewRating}-star rating.</td></tr>`,
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

  const ctaLabel =
    payload.eventType === 'guest_message' && !(payload.fieldDiffs?.length)
      ? 'View message'
      : payload.eventType === 'new_review'
        ? 'View review'
        : 'View booking';
  return transactionalEmailDocument({
    headline,
    introHtml: `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#3d4450;">${escapeHtml(sub)}</p>`,
    bodyHtml: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e6e8ec;">${rows.join('')}${diffBlock}</table>`,
    ctaUrl: bookingsUrl,
    ctaLabel,
    preheader: headline,
    siteUrl: 'https://www.traverion.com',
  });
}

const handler = async (req: Request): Promise<Response> => {
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
    const logOnly = isTransactionalEmailLogOnly();
    if (!apiKey && !logOnly) return json({ success: false, error: 'RESEND_API_KEY not configured' }, 500);
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ success: false, error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured' }, 500);
    }

    const payload = (await req.json()) as Payload;
    if (!payload?.supplierId || !payload?.eventType) {
      return json({ success: false, error: 'Missing supplierId/eventType' }, 400);
    }

    // Phase 1033: supplier_welcome / verification_submitted have no booking to
    // re-derive against. Require JWT owner match OR supplier_team_members row
    // (Phase 1703 — team company save notifies with owner supplierId).
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
      const callerId = authData?.user?.id ?? null;
      if (authError || !callerId) {
        return json({ success: false, error: 'Unauthorized' }, 401);
      }
      if (!isAuthorizedSupplierSelfNotifyCaller(callerId, payload.supplierId)) {
        const adminForAuth = createClient(supabaseUrl, serviceRoleKey);
        const { data: teamRow, error: teamErr } = await adminForAuth
          .from('supplier_team_members')
          .select('user_id, role')
          .eq('supplier_id', String(payload.supplierId).trim())
          .eq('user_id', callerId)
          .maybeSingle();
        if (teamErr) {
          return json({ success: false, error: 'Could not verify authorization. Try again.' }, 500);
        }
        // Phase 1759: finance/viewer cannot fire verification_submitted / welcome.
        if (!teamRow?.user_id || !supplierTeamRoleIsEditor(teamRow.role)) {
          return json({ success: false, error: 'Unauthorized' }, 401);
        }
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
            .select('user_id, role')
            .eq('supplier_id', String(payload.supplierId).trim())
            .eq('user_id', callerId)
            .maybeSingle();
          // Phase 1317: team lookup failure ≠ invent “not a team member”.
          if (teamErr) {
            return json({ success: false, error: 'Could not verify authorization. Try again.' }, 500);
          }
          // Phase 1759: finance/viewer are not supplier-side for host events / fieldDiffs.
          callerIsTeamMember =
            Boolean(teamRow?.user_id) && supplierTeamRoleIsEditor(teamRow?.role);
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
          guest_email?: string | null;
          booking_date?: string | null;
          guests?: number | null;
          booking_number?: number | null;
          public_reference?: string | null;
          payment_status?: string | null;
          status?: string | null;
          refund_choice?: string | null;
          purchase_snapshot?: unknown;
        }
      | null = null;
    let reviewRow:
      | {
          id?: string | null;
          listing_id?: string | null;
          booking_id?: string | null;
          rating?: number | null;
          title?: string | null;
          guest_name?: string | null;
          comment?: string | null;
          is_anonymous?: boolean | null;
        }
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
              'id, listing_id, guest_name, guest_email, booking_date, check_out, nights, guests, booking_number, public_reference, payment_status, status, purchase_snapshot, refund_choice'
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
            .select('id, listing_id, booking_id, rating, title, guest_name, comment, is_anonymous')
            .eq('id', reviewId)
            .maybeSingle();
          reviewRow = data;
          // Authorized supplier party: booking customer name for anonymous public reviews.
          const reviewBookingId = String(data?.booking_id ?? payload.bookingId ?? '').trim();
          if (reviewBookingId) {
            const { data: bookingData } = await admin
              .from('bookings')
              .select(
                'id, listing_id, guest_name, booking_date, check_out, nights, guests, booking_number, public_reference, payment_status, purchase_snapshot'
              )
              .eq('id', reviewBookingId)
              .maybeSingle();
            bookingRow = bookingData;
          }
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
    // new_review notifications must not carry guest email even if a caller sent one.
    if (effectivePayload.eventType === 'new_review') {
      delete (effectivePayload as { guestEmail?: string }).guestEmail;
    }
    if (bookingRow && effectivePayload.eventType === 'new_booking') {
      const snap = bookingRow.purchase_snapshot && typeof bookingRow.purchase_snapshot === 'object'
        ? (bookingRow.purchase_snapshot as Record<string, unknown>)
        : null;
      const snapText = (key: string) => (typeof snap?.[key] === 'string' ? String(snap[key]).trim() : '');
      const hm = snapText('startTimeHm');
      const tz = snapText('departureTimezone');
      effectivePayload.optionLabel = snapText('optionLabel') || undefined;
      effectivePayload.startTimeLabel = hm ? travelerTimeLabel(hm, tz) : undefined;
      effectivePayload.publicReference =
        typeof bookingRow.public_reference === 'string' && bookingRow.public_reference.trim()
          ? bookingRow.public_reference.trim()
          : undefined;
      effectivePayload.guestEmail =
        typeof bookingRow.guest_email === 'string' && bookingRow.guest_email.trim()
          ? bookingRow.guest_email.trim()
          : undefined;
      const fulfillment = snapText('fulfillment');
      if (fulfillment === 'pickup' && snapText('travelerPickupAddress')) {
        effectivePayload.arrivalLabel = 'Pickup';
        effectivePayload.arrivalPlace = snapText('travelerPickupAddress');
      } else if (fulfillment === 'meeting_point' && snapText('meetingPoint')) {
        effectivePayload.arrivalLabel = 'Meeting point';
        effectivePayload.arrivalPlace = snapText('meetingPoint');
      }
    }
    // Phase 1129: cancel unpaid copy from booking payment_status, not caller flag.
    if (effectivePayload.eventType === 'booking_cancelled' && bookingRow) {
      effectivePayload.unpaidCheckout = notifyUnpaidCheckoutFromPaymentStatus(bookingRow.payment_status);
    }
    // Phase 1740: partial on cancelled Refund due — honest host copy from DB.
    if (effectivePayload.eventType === 'partial_refund_recorded' && bookingRow) {
      const st = String(bookingRow.status ?? '')
        .trim()
        .toLowerCase();
      const choice = String(bookingRow.refund_choice ?? '')
        .trim()
        .toLowerCase();
      effectivePayload.cancelledRefundDue = st === 'cancelled' && choice !== 'no_refund';
    }
    // Phase 1139/1724: guests may not forge cancel fieldDiffs; rebuild from unpaid + refund_choice.
    if (effectivePayload.eventType === 'booking_cancelled' && !allowCallerFieldDiffs) {
      const unpaid = effectivePayload.unpaidCheckout === true;
      const refundChoice = String(bookingRow?.refund_choice ?? '')
        .trim()
        .toLowerCase();
      const after = unpaid
        ? 'Unpaid checkout cancelled — no payment collected'
        : refundChoice === 'full_refund'
          ? 'Cancelled — full refund due until Stripe records it (not automatic)'
          : refundChoice === 'no_refund'
            ? 'Cancelled — no refund for this traveler-initiated cancellation'
            : 'Cancelled — refund status follows Trips / Stripe';
      effectivePayload.changeSummary = undefined;
      effectivePayload.fieldDiffs = [
        {
          label: 'Cancellation & refund',
          before: unpaid ? 'Unpaid checkout' : 'Active booking',
          after,
        },
      ];
      // Phase 1724: stash for eventHtml/eventBody paid cancel honesty.
      effectivePayload.refundChoice = refundChoice;
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
      // Phase 1727: content-hashed idempotency keys already dedupe identical
      // guest_message / booking_detail_changed mail. Entity-level 900s cooldown
      // was dropping distinct Inbox messages and Trips note updates after the first.
    });
    if (claim.action === 'skip') {
      return json({ success: true, skipped: true, reason: claim.reason, notified: 0, idempotencyKey });
    }

    if (logOnly) {
      await recordTransactionalSend(admin, {
        idempotencyKey,
        channel: 'supplier',
        templateKey: effectivePayload.eventType,
        recipientEmail: null,
        entityType: payload.bookingId ? 'booking' : 'supplier',
        entityId: payload.bookingId ?? payload.supplierId,
        status: 'skipped',
        errorMessage: 'transactional_email_log_only',
      });
      return json({
        success: true,
        skipped: true,
        reason: 'transactional_email_log_only',
        notified: 0,
        idempotencyKey,
      });
    }

    // In-app bell notification (persisted). Same trusted path as email; unique on
    // (supplier_id, review_id) for new_review so edits/retries never duplicate.
    if (effectivePayload.eventType === 'new_review' && String(effectivePayload.reviewId ?? '').trim()) {
      const stars =
        typeof effectivePayload.reviewRating === 'number' &&
        effectivePayload.reviewRating >= 1 &&
        effectivePayload.reviewRating <= 5
          ? Math.floor(effectivePayload.reviewRating)
          : null;
      const listingLabel = (effectivePayload.listingTitle ?? 'Your listing').trim() || 'Your listing';
      const guestLabel = (effectivePayload.guestName ?? '').trim() || 'Traveler';
      const comment = (effectivePayload.messagePreview ?? '').trim();
      const starLine = stars != null ? `${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}` : '';
      const bodyLines = [
        listingLabel,
        starLine,
        comment ? `"${comment}"` : stars != null ? `Customer left a ${stars}-star rating.` : '',
        guestLabel,
        effectivePayload.reviewPostedAnonymously ? 'Posted anonymously to the public' : '',
      ].filter(Boolean);
      const { error: activityErr } = await admin.from('supplier_activity_notifications').insert({
        supplier_id: payload.supplierId,
        event_type: 'new_review',
        title: stars != null ? `New ${stars}-star review received` : 'New review received',
        body: bodyLines.join('\n'),
        listing_id: String(payload.listingId ?? '').trim() || null,
        review_id: String(effectivePayload.reviewId).trim(),
        href_path: `/partner/reviews?highlight=${encodeURIComponent(String(effectivePayload.reviewId).trim())}`,
      });
      // Unique violation = already notified for this review — continue to email claim path.
      if (activityErr && !/duplicate|unique/i.test(activityErr.message ?? '')) {
        console.error('supplier_activity_notifications insert failed', activityErr.message);
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
};

const notifyListenPort = Number(Deno.env.get('NOTIFY_LISTEN_PORT') || '');
if (Number.isFinite(notifyListenPort) && notifyListenPort > 0) {
  serve(handler, { port: notifyListenPort });
} else {
  serve(handler);
}
