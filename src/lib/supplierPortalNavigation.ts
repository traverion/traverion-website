/**
 * Partner portal URL helpers (pathname + query; layout uses pathname for section).
 */

import { PARTNER_APP_BASE } from './partnerPortalPaths';

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

/** Open supplier bookings and optionally focus a specific booking row. */
export function openSupplierBooking(bookingId?: string): void {
  const path = `${PARTNER_APP_BASE}/bookings`;
  if (!bookingId) {
    navigateSupplierUrl(path);
    return;
  }
  const q = new URLSearchParams();
  q.set('booking', bookingId);
  navigateSupplierUrl(`${path}?${q.toString()}`);
}

/** Open partner inbox and optionally expand a booking thread. */
export function openSupplierInbox(bookingId?: string, opts?: { unreadOnly?: boolean }): void {
  const path = `${PARTNER_APP_BASE}/inbox`;
  const q = new URLSearchParams();
  if (bookingId) q.set('booking', bookingId);
  if (opts?.unreadOnly) q.set('unread', '1');
  const qs = q.toString();
  navigateSupplierUrl(qs ? `${path}?${qs}` : path);
}

/** Open pickup planner and optionally open a booking detail. */
export function openSupplierPickup(bookingId?: string): void {
  const path = `${PARTNER_APP_BASE}/pickup`;
  if (!bookingId) {
    navigateSupplierUrl(path);
    return;
  }
  const q = new URLSearchParams();
  q.set('booking', bookingId);
  navigateSupplierUrl(`${path}?${q.toString()}`);
}

/** Open Calendar and optionally focus a listing for edit. */
export function openSupplierCalendar(listingId?: string): void {
  const path = `${PARTNER_APP_BASE}/calendar`;
  if (!listingId) {
    navigateSupplierUrl(path);
    return;
  }
  const q = new URLSearchParams();
  q.set('listing', listingId);
  navigateSupplierUrl(`${path}?${q.toString()}`);
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
