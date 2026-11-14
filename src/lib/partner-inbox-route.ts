/**
 * Partner Inbox deep-link routing: /partner/inbox/:bookingId
 * Legacy ?booking= query links remain readable for refresh and old bookmarks.
 */

import { PARTNER_APP_BASE } from './partnerPortalPaths';

const BOOKING_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPartnerInboxBookingId(value: string | null | undefined): boolean {
  return Boolean(value && BOOKING_UUID_RE.test(value.trim()));
}

/** Resolve the focused booking from path (/inbox/:id) or legacy ?booking=. */
export function readPartnerInboxBookingId(
  pathname: string = typeof window !== 'undefined' ? window.location.pathname : '',
  search: string = typeof window !== 'undefined' ? window.location.search : ''
): string | null {
  const base = PARTNER_APP_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pathMatch = pathname.match(new RegExp(`^${base}/inbox/([^/?#]+)`, 'i'));
  if (pathMatch?.[1]) {
    const id = decodeURIComponent(pathMatch[1]).trim();
    if (isPartnerInboxBookingId(id)) return id;
  }
  const q = new URLSearchParams(search).get('booking')?.trim() ?? '';
  return isPartnerInboxBookingId(q) ? q : null;
}

export function partnerInboxHref(opts?: {
  bookingId?: string | null;
  unreadOnly?: boolean;
}): string {
  const bookingId = (opts?.bookingId ?? '').trim();
  const path =
    bookingId && isPartnerInboxBookingId(bookingId)
      ? `${PARTNER_APP_BASE}/inbox/${bookingId}`
      : `${PARTNER_APP_BASE}/inbox`;
  const q = new URLSearchParams();
  if (opts?.unreadOnly) q.set('unread', '1');
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}
