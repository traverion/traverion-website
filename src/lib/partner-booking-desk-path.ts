/**
 * Partner Bookings vs Reservations deep-link paths.
 * Tours/activities → /partner/bookings; stays → /partner/reservations.
 */

import { PARTNER_APP_BASE, PARTNER_RESERVATIONS_PATH } from './partnerPortalPaths';

export function partnerBookingDeskPath(params: {
  bookingId?: string | null;
  isStay: boolean;
  /** Extra query params (ops, listing, …) without leading ?. */
  extraSearch?: string | URLSearchParams | Record<string, string> | null;
}): string {
  const base = params.isStay ? PARTNER_RESERVATIONS_PATH : `${PARTNER_APP_BASE}/bookings`;
  const q =
    params.extraSearch instanceof URLSearchParams
      ? new URLSearchParams(params.extraSearch)
      : typeof params.extraSearch === 'string' && params.extraSearch
        ? new URLSearchParams(
            params.extraSearch.startsWith('?') ? params.extraSearch.slice(1) : params.extraSearch
          )
        : params.extraSearch && typeof params.extraSearch === 'object'
          ? new URLSearchParams(params.extraSearch)
          : new URLSearchParams();
  const id = String(params.bookingId ?? '').trim();
  if (id) q.set('booking', id);
  const qs = q.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Preserve current desk query while switching Bookings ↔ Reservations. */
export function partnerBookingDeskPathPreservingSearch(params: {
  isStay: boolean;
  bookingId?: string | null;
  currentSearch?: string;
}): string {
  const q = new URLSearchParams(
    (params.currentSearch ?? '').startsWith('?')
      ? (params.currentSearch ?? '').slice(1)
      : params.currentSearch ?? ''
  );
  return partnerBookingDeskPath({
    isStay: params.isStay,
    bookingId: params.bookingId,
    extraSearch: q,
  });
}
