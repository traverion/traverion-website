/**
 * Partner portal URL helpers (pathname + query; layout uses pathname for section).
 */

import { partnerBookingDeskPath } from './partner-booking-desk-path';
import { PARTNER_APP_BASE } from './partnerPortalPaths';
import {
  clearPartnerInboxReturn,
  markPartnerPageTransition,
} from './partner-page-transition';

/** Map listing quality check id → SupplierListingForm section id (see supplier-listing-field-*). */
export function qualityCheckIdToFormFocus(checkId: string): string {
  switch (checkId) {
    case 'includes':
      return 'includes';
    case 'excludes':
      return 'excludes';
    case 'cancellation':
      return 'includes';
    case 'highlights':
      return 'highlights';
    case 'meeting':
      return 'meeting';
    case 'schedule':
      return 'schedule';
    case 'capacity':
      return 'group';
    default:
      return checkId;
  }
}

/** Push URL and notify SupplierLayout + pages that listen to popstate. */
export function navigateSupplierUrl(pathnameAndSearch: string): void {
  window.history.pushState({}, '', pathnameAndSearch);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Open listings section with edit form and optional quality deep-link focus. */
export function openSupplierListingEditor(
  listingId: string,
  qualityCheckId?: string,
  optionId?: string
): void {
  const path = `${PARTNER_APP_BASE}/listings`;
  const q = new URLSearchParams();
  q.set('edit', listingId);
  if (qualityCheckId) {
    q.set('focus', qualityCheckIdToFormFocus(qualityCheckId));
  }
  if (optionId) {
    q.set('option', optionId);
  }
  navigateSupplierUrl(`${path}?${q.toString()}`);
}

/** Open Bookings or Reservations and optionally focus a specific booking row. */
export function openSupplierBooking(
  bookingId?: string,
  opts?: { isStay?: boolean }
): void {
  navigateSupplierUrl(
    partnerBookingDeskPath({
      bookingId,
      isStay: opts?.isStay === true,
    })
  );
}

/** Open partner inbox and optionally expand a booking thread. */
export function openSupplierInbox(
  bookingId?: string,
  opts?: { unreadOnly?: boolean; fromBookingDetail?: boolean }
): void {
  if (opts?.fromBookingDetail) {
    markPartnerPageTransition('back');
    clearPartnerInboxReturn();
  }
  const path = `${PARTNER_APP_BASE}/inbox`;
  const q = new URLSearchParams();
  if (bookingId) q.set('booking', bookingId);
  if (opts?.unreadOnly) q.set('unread', '1');
  const qs = q.toString();
  navigateSupplierUrl(qs ? `${path}?${qs}` : path);
}

/** Open pickup planner and optionally open a booking detail. */
export function openSupplierPickup(
  bookingId?: string,
  opts?: {
    from?: string;
    to?: string;
    needsOnly?: boolean;
    listingId?: string;
    /** Experience-local day preset (Phase 1085) — preferred over absolute from/to for Today. */
    day?: 'today' | 'tomorrow';
  }
): void {
  const path = `${PARTNER_APP_BASE}/pickup`;
  const q = new URLSearchParams();
  if (bookingId) q.set('booking', bookingId);
  if (opts?.day === 'today' || opts?.day === 'tomorrow') {
    q.set('day', opts.day);
  } else {
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
  }
  if (opts?.listingId) q.set('listing', opts.listingId);
  if (opts?.needsOnly) q.set('needs', '1');
  const qs = q.toString();
  navigateSupplierUrl(qs ? `${path}?${qs}` : path);
}

/** Open Tours & Activities → Departures & Availability (optionally focus a tour listing). */
export function openSupplierCalendar(
  listingId?: string,
  opts?: { from?: string; to?: string; view?: string }
): void {
  const q = new URLSearchParams();
  if (listingId) q.set('listing', listingId);
  if (opts?.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from)) q.set('from', opts.from);
  if (opts?.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to)) q.set('to', opts.to);
  if (opts?.view && opts.view !== 'agenda') q.set('view', opts.view);
  const qs = q.toString();
  navigateSupplierUrl(qs ? `${PARTNER_APP_BASE}/availability?${qs}` : `${PARTNER_APP_BASE}/availability`);
}

/** Open Stays → Stay Calendar (optionally focus a property and date range). */
export function openSupplierStayCalendar(
  listingId?: string,
  opts?: { from?: string; to?: string; view?: string }
): void {
  const q = new URLSearchParams();
  if (listingId) q.set('listing', listingId);
  if (opts?.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from)) q.set('from', opts.from);
  if (opts?.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to)) q.set('to', opts.to);
  if (opts?.view && opts.view !== 'agenda') q.set('view', opts.view);
  const qs = q.toString();
  navigateSupplierUrl(qs ? `${PARTNER_APP_BASE}/stay-calendar?${qs}` : `${PARTNER_APP_BASE}/stay-calendar`);
}

/** Open Reviews with optional reply filter and highlighted review card. */
export function openSupplierReviews(opts?: {
  reviewId?: string;
  reply?: 'unreplied' | 'replied' | 'all';
  listingId?: string;
  family?: 'tour' | 'stay' | 'all';
  rating?: 1 | 2 | 3 | 4 | 5;
}): void {
  const path = `${PARTNER_APP_BASE}/reviews`;
  const q = new URLSearchParams();
  if (opts?.reply && opts.reply !== 'all') q.set('reply', opts.reply);
  if (opts?.reviewId) q.set('highlight', opts.reviewId);
  if (opts?.listingId) q.set('listing', opts.listingId);
  if (opts?.family && opts.family !== 'all') q.set('family', opts.family);
  if (opts?.rating) q.set('rating', String(opts.rating));
  const qs = q.toString();
  navigateSupplierUrl(qs ? `${path}?${qs}` : path);
}
