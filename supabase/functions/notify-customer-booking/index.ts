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
import { buildReceiptPdfBytes, uint8ToBase64 } from '../_shared/receipt-pdf.ts';
import { clientErrorForEmailProvider } from '../_shared/email-provider-error.ts';
import {
  adminClientFromEnv,
  claimTransactionalSend,
  recordTransactionalSend,
  sendResendEmail,
} from '../_shared/transactional-email.ts';
import {
  isAuthorizedTravelerWelcomeRecipient,
  isBookingTiedEmailKind,
  resolveBookingTiedRecipient,
} from '../_shared/notify-customer-recipient.ts';
import { resolveBookingTiedContent } from '../_shared/notify-customer-content.ts';
import {
  bookingPartyAllowsCustomerNotify,
  customerEmailKindRequiresServiceRole,
  guestMayInvokeCustomerEmailKind,
  isServiceRoleBearer,
  supplierTeamRoleIsEditor,
} from '../_shared/notify-customer-booking-auth.ts';
import { authUserVerifiedEmail } from '../_shared/auth-verified-email.ts';
import { notifyUnpaidCheckoutFromPaymentStatus } from '../_shared/notify-unpaid-checkout.ts';
import { travelerOwnsCheckoutBooking } from '../_shared/booking-traveler-ownership.ts';
import { resolveCustomerEmailIdempotencyKey } from '../_shared/transactional-idempotency-key.ts';
import {
  customerEmailKindRequiresDeclinedCancellation,
  customerEmailKindRequiresOpenCancellationRequest,
  customerLifecycleNotifyAllowed,
} from '../_shared/notify-lifecycle-gate.ts';

type EmailKind =
  | 'booking_request'
  | 'booking_confirmed_paid'
  | 'your_details_updated'
  | 'host_updated_schedule'
  | 'pickup_confirmed'
  | 'pickup_changed'
  | 'booking_cancelled'
  | 'cancellation_requested_by_supplier'
  | 'cancellation_accepted'
  | 'cancellation_declined'
  | 'new_booking_message'
  | 'pickup_action_required'
  | 'traveler_welcome'
  | 'refund_completed'
  | 'partial_refund_recorded'
  | 'experience_reminder'
  | 'review_request'
  | 'checkout_payment_reversed';

type Payload = {
  customerEmail: string;
  customerName?: string;
  listingTitle?: string;
  bookingId?: string;
  /** Global sequential order number (50 = 50th booking ever); shown as #50. */
  bookingNumber?: number;
  bookingDate?: string;
  guests?: number;
  totalAmount?: number;
  currency?: string;
  /** Stripe PaymentIntent id (printed on PDF receipt). */
  paymentIntentId?: string;
  /** ISO timestamp when payment completed (PDF). */
  paidAtIso?: string;
  /** Defaults to booking_request when omitted (backwards compatible). */
  emailKind?: EmailKind;
  /** For update emails: show previous vs new (e.g. place of stay, pickup time). */
  fieldDiffs?: FieldDiff[];
  /** Public traveler site base, no trailing slash (e.g. https://www.traverion.com). */
  publicSiteUrl?: string;
  /** booking_cancelled: true when no Stripe money was collected (unpaid checkout). */
  unpaidCheckout?: boolean;
  /** Explicit idempotency key; defaults to kind:bookingId or kind:email. */
  idempotencyKey?: string;
  /** Meeting / pickup place label when known (reminder / pickup emails). */
  meetingPoint?: string;
  /** Stay: purchased check-in address. */
  checkInAddress?: string;
  /** Tour: experience provider booking contact E.164. */
  bookingContactPhoneE164?: string;
  /** Stay: purchased house check-in HH:MM. */
  checkInTime?: string;
  /** Stay: purchased house check-out HH:MM. */
  checkOutTime?: string;
  /** Stay: purchased house rules. */
  houseRules?: string;
  /** Tour: purchased included items. */
  includes?: string[];
  /** Tour: purchased excluded items. */
  excludes?: string[];
  /** Supplier / operator display name when known. */
  supplierName?: string;
  /** booking_cancelled / refund: truthful refund line for body. */
  refundStatusNote?: string;
  /** Stay check-out (YYYY-MM-DD) when listingKind is stay. */
  checkOutDate?: string;
  /** Reminder/review/confirmation copy: tour vs stay. */
  listingKind?: 'tour' | 'stay' | string;
  /** Customer-facing TV- reference. Not the sequential booking number. */
  publicReference?: string;
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

// Phase 562: `raw` (body.publicSiteUrl) used to be trusted verbatim, so any
// caller (this endpoint has no auth check of its own) could send a
// legitimate-looking Traverion email to any address with every link/logo
// pointing at an attacker's domain. The site's own base URL is never
// something a caller should be choosing, so it is now always derived from
// this function's own environment, matching the PUBLIC_SITE_URL convention
// already used the same way by create-booking-checkout-session, stripe-webhook,
// send-booking-reminders, and _shared/promote-paid-from-checkout.ts.
function siteBase(_raw?: string): string {
  return (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://www.traverion.com').replace(/\/$/, '');
}

function wrapCustomerDocument(params: {
  headline: string;
  intro: string;
  detailRowsHtml: string;
  extraHtml: string;
  publicSiteUrl: string;
  footerNote?: string;
  ctaUrl?: string;
  ctaLabel?: string;
}): string {
  const base = siteBase(params.publicSiteUrl);
  const ctaUrl = params.ctaUrl ?? `${base}/trips`;
  const ctaLabel = params.ctaLabel ?? 'View your booking';
  return transactionalEmailDocument({
    headline: params.headline,
    introHtml: params.intro,
    bodyHtml: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e6e8ec;">${params.detailRowsHtml}</table>${params.extraHtml}`,
    ctaUrl,
    ctaLabel,
    preheader: params.headline,
    footerNote: params.footerNote,
    siteUrl: base,
  });
}

function detailRow(label: string, value: string): string {
  if (!value) return '';
  return `<tr><td style="padding:6px 0;font-size:13px;color:#6b7280;width:130px;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(value)}</td></tr>`;
}

function confirmedPaidMailFacts(row: {
  public_reference?: string | null;
  guest_breakdown?: unknown;
  purchase_snapshot?: unknown;
}): { html: string; lines: string[] } {
  const snap = row.purchase_snapshot && typeof row.purchase_snapshot === 'object'
    ? (row.purchase_snapshot as Record<string, unknown>)
    : null;
  const text = (key: string) => (typeof snap?.[key] === 'string' ? String(snap[key]).trim() : '');
  const rows: string[] = [];
  const lines: string[] = [];
  const push = (label: string, value: string) => {
    if (!value) return;
    rows.push(detailRow(label, value));
    lines.push(`${label}: ${value}`);
  };
  push('Option', text('optionLabel'));
  const hm = text('startTimeHm');
  const tz = text('departureTimezone');
  push('Start time', hm ? travelerTimeLabel(hm, tz) : '');
  const breakdown = Array.isArray(row.guest_breakdown)
    ? row.guest_breakdown
        .map((item) => {
          if (!item || typeof item !== 'object') return '';
          const label = typeof (item as { label?: unknown }).label === 'string'
            ? String((item as { label: string }).label).trim()
            : '';
          const qty = (item as { quantity?: unknown }).quantity;
          return label && typeof qty === 'number' && qty > 0 ? `${qty} ${label}` : '';
        })
        .filter(Boolean)
        .join(' · ')
    : '';
  push('Participants', breakdown);
  const fulfillment = text('fulfillment');
  if (fulfillment === 'pickup') push('Pickup', text('travelerPickupAddress'));
  else if (fulfillment === 'meeting_point') push('Meeting point', text('meetingPoint'));
  push('Cancellation', text('cancellationPolicy'));
  return { html: rows.join(''), lines };
}

function htmlBulletList(items: string[] | undefined, title: string): string {
  if (!items?.length) return '';
  const lis = items
    .map((i) => `<li style="margin:0 0 4px;">${escapeHtml(i)}</li>`)
    .join('');
  return `<p style="margin:12px 0 0;font-size:14px;color:#111827;"><strong>${escapeHtml(title)}</strong></p><ul style="margin:6px 0 0;padding-left:18px;font-size:14px;color:#111827;">${lis}</ul>`;
}

function purchasedLogisticsExtraHtml(params: {
  isStay: boolean;
  checkInAddress?: string;
  bookingContactPhoneE164?: string;
  checkInTime?: string;
  checkOutTime?: string;
  houseRules?: string;
  meetingPoint?: string;
  includes?: string[];
  excludes?: string[];
}): string {
  if (params.isStay) {
    const stayLines: string[] = [];
    if (params.checkInAddress?.trim()) {
      stayLines.push(
        `<p style="margin:0 0 8px;font-size:14px;color:#111827;"><strong>Check-in address:</strong> ${escapeHtml(params.checkInAddress.trim())}</p>`
      );
    }
    const houseBits = [
      params.checkInTime?.trim() ? `Check-in from ${params.checkInTime.trim().slice(0, 5)}` : null,
      params.checkOutTime?.trim() ? `Check-out by ${params.checkOutTime.trim().slice(0, 5)}` : null,
    ].filter(Boolean);
    if (houseBits.length) {
      stayLines.push(
        `<p style="margin:0 0 8px;font-size:14px;color:#111827;"><strong>House times:</strong> ${escapeHtml(houseBits.join(' · '))}</p>`
      );
    }
    if (params.houseRules?.trim()) {
      stayLines.push(
        `<p style="margin:0;font-size:14px;color:#111827;white-space:pre-wrap;"><strong>House rules:</strong> ${escapeHtml(params.houseRules.trim())}</p>`
      );
    }
    return stayLines.join('');
  }
  const parts: string[] = [];
  if (params.meetingPoint?.trim()) {
    parts.push(
      `<p style="margin:0;font-size:14px;color:#111827;"><strong>Meeting / pickup:</strong> ${escapeHtml(params.meetingPoint.trim())}</p>`
    );
  }
  if (params.bookingContactPhoneE164?.trim()) {
    const tel = params.bookingContactPhoneE164.trim();
    parts.push(
      `<p style="margin:0 0 8px;font-size:14px;color:#111827;"><strong>Experience provider contact:</strong> <a href="tel:${escapeHtml(tel)}" style="color:#0f766e;text-decoration:none;">${escapeHtml(tel)}</a></p>`
    );
  }
  parts.push(htmlBulletList(params.includes, 'Included (when you booked)'));
  parts.push(htmlBulletList(params.excludes, 'Not included (when you booked)'));
  return parts.filter(Boolean).join('');
}

function orderTag(n: number | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : '';
}

function listingKindIsStay(kind: string | undefined): boolean {
  return String(kind ?? '').trim().toLowerCase() === 'stay';
}

function confirmationListingLabel(kind: string | undefined): string {
  return listingKindIsStay(kind) ? 'Stay' : 'Tour';
}

function paidReceiptLine(_kind: string | undefined): string {
  return 'Paid';
}

function buildDetailRows(p: Payload): string {
  const title = String(p.listingTitle ?? 'Your booking').trim() || 'Your booking';
  const rows: string[] = [];
  rows.push(detailRow(confirmationListingLabel(p.listingKind), title));
  const publicRef = String(p.publicReference ?? '').trim();
  if (publicRef) rows.push(detailRow('Booking reference', publicRef));
  const checkOut = String(p.checkOutDate ?? '').trim();
  if (listingKindIsStay(p.listingKind) && p.bookingDate && /^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    rows.push(detailRow('Check-in', p.bookingDate));
    rows.push(detailRow('Check-out', checkOut));
  } else if (p.bookingDate) {
    rows.push(detailRow('Date', p.bookingDate));
  }
  if (typeof p.guests === 'number' && p.guests > 0) rows.push(detailRow('Guests', String(p.guests)));
  if (listingKindIsStay(p.listingKind)) {
    const addr = String(p.checkInAddress ?? '').trim();
    if (addr) rows.push(detailRow('Check-in address', addr));
    const inT = String(p.checkInTime ?? '').trim().slice(0, 5);
    if (inT) rows.push(detailRow('Check-in from', inT));
    const outT = String(p.checkOutTime ?? '').trim().slice(0, 5);
    if (outT) rows.push(detailRow('Check-out by', outT));
  }
  return rows.join('');
}

function subjectForKind(
  kind: EmailKind,
  title: string,
  publicReference?: string,
  listingKind?: string
): string {
  const t = title.trim() || 'Your booking';
  const ref = (publicReference ?? '').trim();
  const withRef = (label: string) => (ref ? `${label} · ${ref}` : `${label} — ${t}`);
  const isStay = String(listingKind ?? '').toLowerCase() === 'stay';
  switch (kind) {
    case 'booking_confirmed_paid':
      return `Your Traverion booking is confirmed — ${t}`;
    case 'your_details_updated':
      return withRef('Your booking details were saved');
    case 'host_updated_schedule':
      return withRef('Your schedule was updated');
    case 'pickup_confirmed':
      return withRef('Pickup time confirmed');
    case 'pickup_changed':
      return withRef('Pickup details changed');
    case 'booking_cancelled':
      return ref ? `Your booking has been cancelled · ${ref}` : `Your booking has been cancelled — ${t}`;
    case 'cancellation_requested_by_supplier':
      return withRef('Action needed on your booking');
    case 'cancellation_accepted':
      return withRef('Cancellation confirmed');
    case 'cancellation_declined':
      return withRef('Your booking stays confirmed');
    case 'new_booking_message':
      return withRef('New message about your booking');
    case 'pickup_action_required':
      return withRef('Pickup details still needed');
    case 'traveler_welcome':
      return 'Welcome to Traverion';
    case 'refund_completed':
      return withRef('Your refund is complete');
    case 'partial_refund_recorded':
      return withRef('A partial refund was recorded');
    case 'experience_reminder':
      return withRef(isStay ? 'Your stay is coming up' : 'Your experience is coming up');
    case 'review_request':
      return withRef(isStay ? 'How was your stay?' : 'How was your experience?');
    case 'checkout_payment_reversed':
      return withRef('A payment was reversed');
    default:
      return withRef('We received your booking request');
  }
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
    const apiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('CUSTOMER_BOOKING_EMAIL_FROM') ?? 'Traverion <no-reply@traverion.com>';
    if (!apiKey) return json({ success: false, error: 'RESEND_API_KEY not configured' }, 500);

    const body = (await req.json()) as Payload;
    let to = String(body.customerEmail ?? '').trim().toLowerCase();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return json({ success: false, error: 'Invalid customer email' }, 400);
    }

    const kind: EmailKind = body.emailKind ?? 'booking_request';
    // Phase 578: every emailKind here is about a specific booking except
    // traveler_welcome (fired on signup, before any booking exists). Requiring
    // bookingId for every other kind matches what every real caller already
    // sends (checked against the actual call sites: promote-paid-from-checkout,
    // stripe-webhook, send-booking-reminders, and every notifyXxx helper in
    // src/data/supabase-bookings.ts / supabase-booking-ops.ts) and is what lets
    // the recipient re-derivation below apply uniformly instead of only to the
    // two kinds Phase 562 covered. See ../_shared/notify-customer-recipient.ts.
    if (isBookingTiedEmailKind(kind) && !String(body.bookingId ?? '').trim()) {
      return json({ success: false, error: 'bookingId required for this emailKind' }, 400);
    }
    // Mutable content fields — Phase 1052 overwrites from booking/listing/snapshot.
    // Phase 580: traveler_welcome has no booking to check against -- Phase 578
    // deliberately left it out of the recipient guard above and tracked it as
    // a separate, lower-severity gap: with no caller-identity check at all,
    // anyone could trigger a "Welcome to Traverion" email to any address of
    // their choosing (no sensitive content, but still unauthenticated
    // arbitrary-recipient sending -- a spam/relay-abuse vector using
    // Traverion's own sending reputation). The one legitimate caller
    // (maybeSendTravelerWelcome in src/data/supabase-consumer-profile.ts)
    // already calls supabase.functions.invoke(), which forwards the signed-in
    // user's own session access token as the Authorization header by
    // default -- so verifying that header identifies a real user whose email
    // matches the requested recipient needs no caller-side change, same
    // pattern create-booking-checkout-session already uses to authenticate
    // its own caller.
    if (kind === 'traveler_welcome') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
      const authHeader = req.headers.get('Authorization') ?? '';
      if (!supabaseUrl || !anonKey) {
        return json({ success: false, error: 'Supabase env missing' }, 500);
      }
      if (!authHeader) {
        return json({ success: false, error: 'Missing Authorization header' }, 401);
      }
      const authedClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: authData, error: authError } = await authedClient.auth.getUser();
      // Phase 1120: welcome self-send requires confirmed email (parity with jwt_verified_email).
      if (
        authError ||
        !isAuthorizedTravelerWelcomeRecipient(authUserVerifiedEmail(authData?.user), to)
      ) {
        return json({ success: false, error: 'Unauthorized' }, 401);
      }
    }

    const admin = adminClientFromEnv();
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
    // Phase 1126: fieldDiffs are caller-authored copy — supplier/service-role always;
    // Phase 1706: guest JWT may supply diffs only for guestMayInvokeCustomerEmailKind kinds
    // (your_details_updated / booking_cancelled / cancel responses) so Trips note updates
    // and cancel self-receipts are not hollow “what changed” emails.
    let allowCallerFieldDiffs = false;
    // Phase 1092: booking-tied kinds reject anonymous forgery. Service-role
    // (webhook/cron/promote) or JWT guest/supplier party only. Recipient +
    // static fields remain re-derived; this closes the open send gate.
    if (isBookingTiedEmailKind(kind)) {
      if (!admin) {
        return json({ success: false, error: 'Unauthorized' }, 401);
      }
      const authHeader = req.headers.get('Authorization');
      if (isServiceRoleBearer(authHeader, serviceRoleKey)) {
        allowCallerFieldDiffs = true;
      } else {
        if (customerEmailKindRequiresServiceRole(kind)) {
          return json({ success: false, error: 'Unauthorized' }, 401);
        }
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
        if (!supabaseUrl || !anonKey || !authHeader) {
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
        const bookingId = String(body.bookingId ?? '').trim();
        const { data: partyBooking } = await admin
          .from('bookings')
          .select('guest_user_id, guest_email, listing_id')
          .eq('id', bookingId)
          .maybeSingle();
        if (!partyBooking) {
          return json({ success: false, error: 'Unauthorized' }, 401);
        }
        let callerIsListingSupplier = false;
        let callerIsSupplierTeamMember = false;
        const listingId = String(partyBooking.listing_id ?? '').trim();
        let listingSupplierId = '';
        if (listingId) {
          const { data: listingOwn, error: listingOwnErr } = await admin
            .from('listings')
            .select('supplier_id')
            .eq('id', listingId)
            .maybeSingle();
          // Phase 1317: listing ownership lookup failure ≠ invent “not supplier”.
          if (listingOwnErr) {
            return json({ success: false, error: 'Could not verify authorization. Try again.' }, 500);
          }
          listingSupplierId = String(listingOwn?.supplier_id ?? '').trim();
          callerIsListingSupplier = listingSupplierId.length > 0 && listingSupplierId === callerId;
        }
        if (!callerIsListingSupplier && listingSupplierId) {
          const { data: teamRow, error: teamErr } = await admin
            .from('supplier_team_members')
            .select('user_id, role')
            .eq('supplier_id', listingSupplierId)
            .eq('user_id', callerId)
            .maybeSingle();
          if (teamErr) {
            return json({ success: false, error: 'Could not verify authorization. Try again.' }, 500);
          }
          // Phase 1759: finance/viewer may not act as host for customer notify.
          callerIsSupplierTeamMember =
            Boolean(teamRow?.user_id) && supplierTeamRoleIsEditor(teamRow?.role);
        }
        if (
          !bookingPartyAllowsCustomerNotify({
            callerUserId: callerId,
            callerEmail,
            guestUserId: partyBooking.guest_user_id,
            guestEmail: partyBooking.guest_email,
            callerIsListingSupplier,
            callerIsSupplierTeamMember,
          })
        ) {
          return json({ success: false, error: 'Unauthorized' }, 401);
        }
        const callerIsGuest = travelerOwnsCheckoutBooking({
          authUserId: callerId,
          verifiedEmail: callerEmail,
          guestUserId: partyBooking.guest_user_id,
          guestEmail: partyBooking.guest_email,
        });
        const callerIsSupplierSide = callerIsListingSupplier || callerIsSupplierTeamMember;
        // Phase 1128: guests must not fire host/ops/cron customer email kinds.
        if (callerIsGuest && !callerIsSupplierSide && !guestMayInvokeCustomerEmailKind(kind)) {
          return json({ success: false, error: 'Unauthorized' }, 401);
        }
        // Phase 1126/1130: supplier-side may set fieldDiffs.
        // Phase 1706: guest JWT may set diffs only for guest-originated kinds (already gated above).
        allowCallerFieldDiffs =
          callerIsSupplierSide ||
          (callerIsGuest && !callerIsSupplierSide && guestMayInvokeCustomerEmailKind(kind));
      }
    }

    let title = String(body.listingTitle ?? 'Your booking').trim() || 'Your booking';
    let name = String(body.customerName ?? '').trim();
    const publicSiteUrl = siteBase(body.publicSiteUrl);
    let currency = String(body.currency ?? 'EUR').trim().toUpperCase() || 'EUR';
    let bookingNumber = body.bookingNumber;
    let bookingDate = body.bookingDate;
    let checkOutDate = body.checkOutDate;
    let guests = body.guests;
    let listingKind = body.listingKind;
    let meetingPoint = body.meetingPoint;
    let checkInAddress = body.checkInAddress;
    let bookingContactPhoneE164 = body.bookingContactPhoneE164;
    let checkInTime = body.checkInTime;
    let checkOutTime = body.checkOutTime;
    let houseRules = body.houseRules;
    let includes = body.includes;
    let excludes = body.excludes;
    let amount =
      typeof body.totalAmount === 'number' && Number.isFinite(body.totalAmount) && body.totalAmount >= 0
        ? body.totalAmount
        : undefined;
    // Phase 1129: prefer DB payment_status over caller unpaidCheckout flag.
    let unpaidCheckoutFromDb: boolean | null = null;
    // Phase 1726: paid cancel fieldDiffs / footer follow DB refund_choice, not guest forge.
    let refundChoiceFromDb: string | null = null;
    // Phase 1740: partial refund on cancelled Refund due must not claim trip still Paid.
    let cancelledRefundDuePartial = false;
    // Phase 1132: receipt PDF metadata from bookings row, not caller body.
    let paidAtIsoFromDb: string | undefined;
    let paymentIntentIdFromDb: string | undefined;
    let confirmedPaidExtra: { html: string; lines: string[] } | null = null;
    let publicReference = '';

    // Phase 562/578/1052: recipient + static content re-derived from booking.
    // Phase 1092: anonymous callers never reach this path for booking-tied kinds.
    if (isBookingTiedEmailKind(kind) && admin) {
      const bookingId = String(body.bookingId ?? '').trim();
      const { data: bookingRowRaw } = await admin
        .from('bookings')
        .select(
          'status, payment_status, guest_email, guest_user_id, amount_paid, total_amount, currency, guest_name, booking_date, check_out, nights, guests, guest_breakdown, booking_number, public_reference, purchase_snapshot, listing_id, paid_at, payment_intent_id, refund_choice, special_requests'
        )
        .eq('id', bookingId)
        .maybeSingle();

      // Phase 1788: empty guest_email still reaches account holders via auth (parity with 1786 reminders).
      let bookingRow = bookingRowRaw;
      if (bookingRow) {
        const existingEmail = String(bookingRow.guest_email ?? '')
          .trim()
          .toLowerCase();
        const guestUid = String(bookingRow.guest_user_id ?? '').trim();
        if (!existingEmail && guestUid) {
          try {
            const { data: authUser } = await admin.auth.admin.getUserById(guestUid);
            const fromAuth = (authUser?.user?.email ?? '').trim().toLowerCase();
            if (fromAuth) {
              await admin.from('bookings').update({ guest_email: fromAuth }).eq('id', bookingId);
              bookingRow = { ...bookingRow, guest_email: fromAuth };
            }
          } catch {
            /* ignore auth lookup failures */
          }
        }
      }

      if (bookingRow) {
        unpaidCheckoutFromDb = notifyUnpaidCheckoutFromPaymentStatus(bookingRow.payment_status);
        refundChoiceFromDb = String(bookingRow.refund_choice ?? '')
          .trim()
          .toLowerCase();
        cancelledRefundDuePartial =
          String(bookingRow.status ?? '')
            .trim()
            .toLowerCase() === 'cancelled' && refundChoiceFromDb !== 'no_refund';
        if (typeof bookingRow.paid_at === 'string' && bookingRow.paid_at.trim()) {
          paidAtIsoFromDb = bookingRow.paid_at.trim();
        }
        if (typeof bookingRow.payment_intent_id === 'string' && bookingRow.payment_intent_id.trim()) {
          paymentIntentIdFromDb = bookingRow.payment_intent_id.trim();
        }
        if (typeof bookingRow.public_reference === 'string' && bookingRow.public_reference.trim()) {
          publicReference = bookingRow.public_reference.trim();
        }
      }

      // Phase 1511: lifecycle templates must match booking / cancellation_request truth.
      let openCancellationRequest: boolean | null = null;
      let declinedCancellationRequest: boolean | null = null;
      if (
        bookingId &&
        (customerEmailKindRequiresOpenCancellationRequest(kind) ||
          customerEmailKindRequiresDeclinedCancellation(kind))
      ) {
        const { data: cancelRows } = await admin
          .from('cancellation_requests')
          .select('status')
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: false })
          .limit(5);
        const statuses = (cancelRows ?? []).map((r: { status?: string }) =>
          String(r.status ?? '').trim().toLowerCase()
        );
        openCancellationRequest = statuses.includes('requested');
        declinedCancellationRequest = statuses.includes('declined');
      }
      const lifecycleGate = customerLifecycleNotifyAllowed({
        kind,
        bookingStatus: bookingRow?.status ?? null,
        openCancellationRequest,
        declinedCancellationRequest,
      });
      if (!lifecycleGate.ok) {
        return json({ success: false, error: lifecycleGate.error }, lifecycleGate.status);
      }
      const resolved = resolveBookingTiedRecipient({
        kind,
        bookingId,
        bookingRow,
        callerEmail: to,
        callerAmount: amount,
        callerCurrency: currency,
      });
      if (!resolved.ok) {
        return json({ success: false, error: resolved.error }, resolved.status);
      }
      to = resolved.to;
      amount = resolved.amount;
      currency = resolved.currency;

      let listingRow: {
        id?: string | null;
        title?: string | null;
        listing_extras?: unknown;
        experience_kind?: string | null;
      } | null = null;
      const listingId = String(bookingRow?.listing_id ?? '').trim();
      if (listingId) {
        const { data: listing } = await admin
          .from('listings')
          .select('id, title, listing_extras, experience_kind')
          .eq('id', listingId)
          .maybeSingle();
        listingRow = listing;
      }

      const content = resolveBookingTiedContent({
        kind,
        bookingId,
        bookingRow,
        listingRow,
      });
      if (!content.ok) {
        return json({ success: false, error: content.error }, content.status);
      }
      if (content.overrides.listingTitle) title = content.overrides.listingTitle;
      if (content.overrides.customerName) name = content.overrides.customerName;
      if (content.overrides.bookingDate) bookingDate = content.overrides.bookingDate;
      if (typeof content.overrides.guests === 'number') guests = content.overrides.guests;
      if (typeof content.overrides.bookingNumber === 'number') {
        bookingNumber = content.overrides.bookingNumber;
      }
      if (content.overrides.listingKind) listingKind = content.overrides.listingKind;
      if (content.overrides.checkOutDate) checkOutDate = content.overrides.checkOutDate;
      // Phase 1060: never keep caller-supplied meeting/pickup after re-derivation
      // (empty snap must not resurrect live listing copy from the reminder job).
      meetingPoint = content.overrides.meetingPoint;
      // Phase 1066: stay arrival logistics from purchase_snapshot only.
      checkInAddress = content.overrides.checkInAddress;
      bookingContactPhoneE164 = content.overrides.bookingContactPhoneE164;
      checkInTime = content.overrides.checkInTime;
      checkOutTime = content.overrides.checkOutTime;
      // Phase 1070: purchased house rules / includes / excludes.
      houseRules = content.overrides.houseRules;
      includes = content.overrides.includes;
      excludes = content.overrides.excludes;
      if (kind === 'booking_confirmed_paid' && bookingRow) {
        confirmedPaidExtra = confirmedPaidMailFacts(bookingRow);
      }
    }

    const firstName = name.split(/\s+/).filter(Boolean)[0] ?? '';
    const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
    const refDigits = orderTag(bookingNumber);
    // Phase 1510: client idempotencyKey may only extend customer:${kind}:… —
    // never overwrite a different template's slot (paid/refund poison).
    const idempotencyKey = resolveCustomerEmailIdempotencyKey({
      kind,
      bookingId: body.bookingId,
      email: to,
      clientKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null,
    });

    if (admin) {
      const claim = await claimTransactionalSend(admin, {
        idempotencyKey,
        channel: 'customer',
        templateKey: kind,
        entityType: body.bookingId ? 'booking' : kind === 'traveler_welcome' ? 'consumer' : undefined,
        entityId: body.bookingId ?? (kind === 'traveler_welcome' ? to : undefined),
        // Phase 1727: content-hashed keys dedupe identical new_booking_message /
        // your_details_updated mail. Entity-level 900s cooldown dropped every later
        // distinct Inbox message / Trips note change within 15 minutes.
      });
      if (claim.action === 'skip') {
        return json({ success: true, skipped: true, reason: claim.reason, idempotencyKey });
      }
    }

    let diffs = allowCallerFieldDiffs
      ? Array.isArray(body.fieldDiffs)
        ? body.fieldDiffs.filter(
            (d) =>
              d &&
              typeof d.label === 'string' &&
              typeof d.before === 'string' &&
              typeof d.after === 'string',
          )
        : []
      : [];

    // Phase 1726: booking_cancelled refund copy must follow DB unpaid + refund_choice
    // (parity with notify-supplier-event Phase 1724) — guests cannot forge Refund due.
    if (kind === 'booking_cancelled') {
      const unpaid =
        unpaidCheckoutFromDb !== null ? unpaidCheckoutFromDb : body.unpaidCheckout === true;
      const refundChoice = refundChoiceFromDb ?? '';
      // Keep after strings in sync with TRAVELER_*_EMAIL_DIFF constants in booking-confirmation-copy.ts
      const after = unpaid
        ? 'Unpaid checkout cancelled — no payment was collected.'
        : refundChoice === 'full_refund'
          ? 'Cancelled — full refund due until Stripe records it (not automatic)'
          : refundChoice === 'no_refund'
            ? 'Cancelled — no refund for this traveler-initiated cancellation'
            : 'Cancelled — refund status follows Trips / Stripe';
      diffs = [
        {
          label: 'Cancellation & refund',
          before: unpaid ? 'Unpaid checkout' : 'Active booking',
          after,
        },
      ];
    }

    let headline = 'Booking update';
    let intro = '';
    let extraHtml = '';
    let footerNote: string | undefined;

    if (kind === 'booking_confirmed_paid') {
      headline = 'Your adventure is confirmed.';
      intro = `<p style="margin:0;">${escapeHtml(greeting)} your booking is confirmed. Here are the details for your experience.</p>`;
      if (refDigits) {
        intro += `<p style="margin:8px 0 0;font-size:13px;color:#5c6570;">A receipt is attached as a PDF.</p>`;
      }
      if (typeof amount === 'number') {
        extraHtml = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:12px 0 0;border-top:1px solid #e6e8ec;">
<tr><td style="padding-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b7280;">Amount paid</td></tr>
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;color:#0b1f44;padding-top:2px;">${escapeHtml(currency)} ${amount.toFixed(2)}</td></tr>
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#0f766e;padding-top:4px;">${escapeHtml(paidReceiptLine(listingKind))}</td></tr>
</table>`;
      }
      const logistics = purchasedLogisticsExtraHtml({
        isStay: listingKindIsStay(listingKind),
        checkInAddress,
        bookingContactPhoneE164,
        checkInTime,
        checkOutTime,
        houseRules,
      });
      if (logistics) extraHtml += logistics;
      footerNote = 'Open your booking for pickup details, messages, and changes.';
    } else if (kind === 'your_details_updated') {
      headline = 'Your booking details were saved';
      intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">We updated the notes on your booking. Here is what changed (previous value → new value):</p>`;
      extraHtml = fieldDiffTableHtml(diffs);
      footerNote =
        // Keep in sync with TRAVELER_DETAILS_UPDATED_EMAIL_NOTE in booking-confirmation-copy.ts
        'If you did not make this change, contact your operator or Traverion support.';
    } else if (kind === 'host_updated_schedule') {
      headline = 'Your host updated meeting times';
      intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">The tour operator updated the schedule for your booking. Compare the previous and new times below.</p>`;
      extraHtml = fieldDiffTableHtml(diffs);
      footerNote =
        // Keep in sync with TRAVELER_HOST_SCHEDULE_UPDATED_EMAIL_NOTE in booking-confirmation-copy.ts
        'The new times are in your booking. Message your operator if you need help.';
    } else if (kind === 'booking_cancelled') {
      // Phase 1129: unpaid copy follows payment_status, not body.unpaidCheckout.
      const unpaid =
        unpaidCheckoutFromDb !== null ? unpaidCheckoutFromDb : body.unpaidCheckout === true;
      // Phase 1726: paid footer follows DB refund_choice (no false Refund due on no_refund).
      const refundChoice = refundChoiceFromDb ?? '';
      headline = unpaid ? 'Checkout cancelled' : 'Your booking was cancelled';
      intro = unpaid
        ? `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">You cancelled an unpaid checkout. No payment was collected. Summary below.</p>`
        : `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">Your reservation has been cancelled as requested. Summary below.</p>`;
      if (diffs.length) extraHtml = fieldDiffTableHtml(diffs);
      footerNote = unpaid
        ? // Keep in sync with TRAVELER_CANCEL_UNPAID_CHECKOUT_EMAIL_FOOTER
          'This was an unpaid checkout. No payment was collected. Trips keeps the cancelled record if you need it.'
        : refundChoice === 'no_refund'
          ? 'No refund applies for this cancellation. Trips keeps the cancelled record if you need it.'
          : 'When a refund applies, Trips shows Refund due until Stripe records Refunded. Traverion does not send Stripe refunds automatically. Timing then depends on your bank.';
    } else if (kind === 'cancellation_requested_by_supplier') {
      headline = 'Action needed on your booking';
      intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">The supplier can no longer operate this booking as planned. Your reservation is <strong>not cancelled yet</strong>. Open Trips to accept the cancellation (refund due when payment was collected) or keep the booking if you decline.</p>`;
      if (diffs.length) extraHtml = fieldDiffTableHtml(diffs);
      footerNote =
        'If you accept, a full refund is due when you paid online. Status becomes Refunded only after Stripe records it. Traverion does not send refunds automatically.';
    } else if (kind === 'cancellation_accepted') {
      headline = 'Cancellation confirmed';
      intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">You accepted the host’s cancellation request. This booking is cancelled. A refund is due; it is recorded when Stripe processes it — Traverion does not refund automatically.</p>`;
      footerNote = 'Watch Trips for Refund due, then Refunded. Traverion does not refund automatically. Timing depends on your bank.';
    } else if (kind === 'cancellation_declined') {
      headline = 'Your booking stays confirmed';
      intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">You declined the host’s cancellation request. The booking remains active.</p>`;
      footerNote =
        // Keep in sync with TRAVELER_CANCELLATION_DECLINED_EMAIL_NOTE in booking-confirmation-copy.ts
        'Your booking stays active.';
    } else if (kind === 'new_booking_message') {
      headline = 'New message about your booking';
      intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">You have a new message about this booking. Open Trips to read and reply.</p>`;
      if (diffs.length) extraHtml = fieldDiffTableHtml(diffs);
      footerNote =
        // Keep in sync with TRAVELER_NEW_BOOKING_MESSAGE_EMAIL_NOTE in booking-confirmation-copy.ts
        'Open the message to read and reply.';
    } else if (kind === 'pickup_action_required') {
      headline = 'Pickup details still needed';
      intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">Your booking is confirmed. The host still needs to confirm pickup or meeting details — they will appear in Trips when ready.</p>`;
      footerNote =
        // Keep in sync with TRAVELER_PICKUP_ACTION_EMAIL_NOTE in booking-confirmation-copy.ts
        'Pickup details will appear on your booking when your operator confirms them.';
    } else if (kind === 'pickup_confirmed') {
      headline = 'Pickup time confirmed';
      intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">Your host confirmed the pickup time for this booking. Details below — also visible in Trips.</p>`;
      if (diffs.length) extraHtml = fieldDiffTableHtml(diffs);
      if (meetingPoint?.trim()) {
        extraHtml += `<p style="margin:12px 0 0;font-size:14px;color:#111827;"><strong>Meeting / pickup place:</strong> ${escapeHtml(meetingPoint.trim())}</p>`;
      }
      footerNote = 'The confirmed time is also on your booking.';
    } else if (kind === 'pickup_changed') {
      headline = 'Pickup details changed';
      intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">Your host updated pickup or meeting details. Compare previous → new below.</p>`;
      extraHtml = fieldDiffTableHtml(diffs);
      footerNote = 'Updated times appear in Trips. Contact the host in Trips if you need help.';
    } else if (kind === 'traveler_welcome') {
      headline = 'Welcome to Traverion';
      intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">Your traveler account is ready. Browse experiences, book securely, and manage trips in one place.</p>`;
      footerNote = 'You can update your profile anytime from Account.';
    } else if (kind === 'refund_completed') {
      headline = 'Your refund is complete';
      intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">Stripe has recorded a full refund for this booking. Timing to your bank depends on your card issuer.</p>`;
      if (typeof amount === 'number') {
        extraHtml = `<p style="margin:0;font-size:14px;color:#374151;"><strong>Refunded:</strong> ${escapeHtml(currency)} ${amount.toFixed(2)}</p>`;
      }
      footerNote =
        body.refundStatusNote?.trim() ||
        'Your booking shows this refund as complete. Your bank may take a few days to post it.';
    } else if (kind === 'partial_refund_recorded') {
      // Phase 1735: active paid booking stays Paid; inventory held.
      // Phase 1740: cancelled Refund due — do not claim reservation still active.
      headline = 'A partial refund was recorded';
      if (cancelledRefundDuePartial) {
        intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">Stripe recorded a partial refund toward the amount due on this cancelled booking. Trips still shows Refund due for any remaining charge until Stripe records a full refund.</p>`;
        footerNote =
          'Your bank may take a few days to post this refund. Any remaining amount still shows as due on your booking.';
      } else {
        intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">Stripe recorded a partial refund for this booking. Your reservation stays active and Trips still shows Paid for the remaining amount.</p>`;
        footerNote =
          'Your bank may take a few days to post this refund. The remaining amount stays paid on your booking.';
      }
      if (typeof amount === 'number') {
        extraHtml = `<p style="margin:0;font-size:14px;color:#374151;"><strong>Refunded this time:</strong> ${escapeHtml(currency)} ${amount.toFixed(2)}</p>`;
      }
    } else if (kind === 'experience_reminder') {
      const isStay = String(listingKind ?? '').toLowerCase() === 'stay';
      headline = isStay ? 'Your stay is coming up soon' : 'Your tour is coming up soon';
      intro = isStay
        ? `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">Your stay at <strong>${escapeHtml(title)}</strong> is coming up soon. Details we have on file are below — check Trips for the latest.</p>`
        : `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">Your tour <strong>${escapeHtml(title)}</strong> is coming up soon. Details we have on file are below — check Trips for the latest.</p>`;
      extraHtml = purchasedLogisticsExtraHtml({
        isStay,
        checkInAddress,
        checkInTime,
        checkOutTime,
        houseRules,
        meetingPoint,
        includes,
        excludes,
      });
      if (diffs.length) extraHtml += fieldDiffTableHtml(diffs);
      footerNote = isStay
        ? 'Open Trips for check-in address, house times, or host updates.'
        : 'Open Trips for pickup, meeting, or host updates.';
    } else if (kind === 'review_request') {
      const isStay = String(listingKind ?? '').toLowerCase() === 'stay';
      headline = isStay ? 'How was your stay?' : 'How was your tour?';
      intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">Thanks for booking with Traverion. If you enjoyed <strong>${escapeHtml(title)}</strong>, a short review helps other travelers.</p>`;
      footerNote = 'You can leave a review from Trips or the listing page.';
    } else if (kind === 'checkout_payment_reversed') {
      // Phase 1719: orphan / duplicate capture reverse while booking stays paid/active.
      headline = 'A checkout payment was reversed';
      intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">Stripe reversed an extra or invalid checkout payment for <strong>${escapeHtml(title)}</strong>. Your booking status on Trips is unchanged unless noted below.</p>`;
      if (diffs.length) extraHtml = fieldDiffTableHtml(diffs);
      if (typeof amount === 'number') {
        extraHtml += `<p style="margin:12px 0 0;font-size:14px;color:#374151;"><strong>Amount reversed:</strong> ${escapeHtml(currency)} ${amount.toFixed(2)}</p>`;
      }
      footerNote =
        'Open your booking if you want to confirm the status.';
    } else {
      headline = 'Booking request sent';
      intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">Your host has up to 24 hours to respond for <strong>${escapeHtml(title)}</strong>. Your payment method has been authorized, but payment has not yet been captured. The authorization may appear as a pending transaction on your bank statement.</p>`;
      if (typeof amount === 'number') {
        extraHtml = `<p style="margin:0;font-size:14px;color:#374151;"><strong>Authorized total:</strong> ${escapeHtml(currency)} ${amount.toFixed(2)}</p>`;
      }
      if (diffs.length) extraHtml += fieldDiffTableHtml(diffs);
      footerNote =
        // Keep in sync with BOOKING_REQUEST_EMAIL_FOLLOWUP_NOTE in booking-confirmation-copy.ts
        'You will get another email when the host accepts and payment is captured, or if the request is declined or expires.';
    }

    const bookingCta =
      kind === 'traveler_welcome'
        ? `${publicSiteUrl}/`
        : kind === 'review_request' && body.bookingId
          ? `${publicSiteUrl}/trips?booking=${encodeURIComponent(body.bookingId)}`
          : body.bookingId
            ? `${publicSiteUrl}/trips?booking=${encodeURIComponent(body.bookingId)}`
            : `${publicSiteUrl}/trips`;
    const ctaLabel =
      kind === 'cancellation_requested_by_supplier'
        ? 'Choose in Trips'
        : kind === 'new_booking_message'
          ? 'View message'
          : kind === 'pickup_action_required' || kind === 'pickup_confirmed' || kind === 'pickup_changed'
            ? 'View your booking'
          : kind === 'traveler_welcome'
            ? 'Explore Traverion'
          : kind === 'review_request'
            ? 'Leave a review'
            : kind === 'booking_confirmed_paid'
              ? 'View your booking'
              : 'View your booking';
    const detailPayload: Payload = {
      ...body,
      listingTitle: title,
      customerName: name,
      bookingNumber,
      bookingDate,
      checkOutDate,
      guests,
      listingKind,
      meetingPoint,
      checkInAddress,
      checkInTime,
      checkOutTime,
      publicReference,
    };
    const detailRows = `${buildDetailRows(detailPayload)}${confirmedPaidExtra?.html ?? ''}`;
    const html = wrapCustomerDocument({
      headline,
      intro,
      detailRowsHtml: detailRows,
      extraHtml,
      publicSiteUrl,
      footerNote,
      ctaUrl: bookingCta,
      ctaLabel,
    });

    const textParts: string[] = [
      greeting,
      '',
      subjectForKind(kind, title, publicReference || undefined, listingKind),
      '',
    ];
    if (publicReference) textParts.push(`Booking reference: ${publicReference}`);
    // Phase 1576: stay text mirrors HTML Check-in / Check-out (not Date alone).
    {
      const checkOut = String(checkOutDate ?? '').trim();
      if (
        listingKindIsStay(listingKind) &&
        bookingDate &&
        /^\d{4}-\d{2}-\d{2}$/.test(checkOut)
      ) {
        textParts.push(`Check-in: ${bookingDate}`);
        textParts.push(`Check-out: ${checkOut}`);
      } else if (bookingDate) {
        textParts.push(`Date: ${bookingDate}`);
      }
    }
    if (typeof guests === 'number') textParts.push(`Guests: ${guests}`);
    if (confirmedPaidExtra?.lines.length) textParts.push(...confirmedPaidExtra.lines);
    if (!publicReference && refDigits) textParts.push(`Booking reference: ${refDigits}`);
    if (typeof amount === 'number' && kind === 'booking_confirmed_paid') {
      textParts.push('', `Payment receipt: ${currency} ${amount.toFixed(2)}`);
    }
    if (kind === 'booking_confirmed_paid' && refDigits) {
      textParts.push('', 'A PDF receipt is attached to this email.');
    }
    if (diffs.length) {
      textParts.push('', fieldDiffPlainText(diffs));
    }
    textParts.push('', `${ctaLabel}: ${bookingCta}`, '', '— Traverion');
    const text = textParts.filter(Boolean).join('\n');

    const attachments: { filename: string; content: string }[] = [];
    if (kind === 'booking_confirmed_paid' && refDigits && typeof amount === 'number') {
      try {
        const pdfBytes = await buildReceiptPdfBytes({
          bookingNumber: Number(refDigits),
          guestName: name || undefined,
          listingTitle: title,
          bookingDate,
          checkOutDate,
          listingKind,
          guests: typeof guests === 'number' ? guests : undefined,
          amountPaid: amount,
          currency,
          paidAtIso: paidAtIsoFromDb,
          paymentIntentId: paymentIntentIdFromDb,
        });
        attachments.push({
          filename: `Traverion-receipt-${refDigits}.pdf`,
          content: uint8ToBase64(pdfBytes),
        });
      } catch {
        /* still send confirmation email without attachment */
      }
    }

    const sent = await sendResendEmail({
      apiKey,
      from: fromEmail,
      to: [to],
      subject: subjectForKind(kind, title, publicReference || undefined, listingKind),
      text,
      html,
      attachments: attachments.length ? attachments : undefined,
    });

    if (!sent.ok) {
      console.error('notify-customer-booking: email provider rejected request', {
        status: sent.status,
        kind,
        idempotencyKey,
      });
      if (admin) {
        await recordTransactionalSend(admin, {
          idempotencyKey,
          channel: 'customer',
          templateKey: kind,
          recipientEmail: to,
          entityType: body.bookingId ? 'booking' : undefined,
          entityId: body.bookingId,
          status: 'failed',
          errorMessage: sent.error,
        });
      }
      return json(
        { success: false, error: clientErrorForEmailProvider(sent.status, sent.error) },
        500,
      );
    }

    if (admin) {
      await recordTransactionalSend(admin, {
        idempotencyKey,
        channel: 'customer',
        templateKey: kind,
        recipientEmail: to,
        entityType: body.bookingId ? 'booking' : kind === 'traveler_welcome' ? 'consumer' : undefined,
        entityId: body.bookingId ?? undefined,
        providerMessageId: sent.id,
        status: 'sent',
      });
    }

    return json({ success: true, providerMessageId: sent.id ?? null, idempotencyKey });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
