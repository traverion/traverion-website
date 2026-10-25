/**
 * Partner Bookings vs Reservations vs Rental bookings deep-link paths.
 * Tours/activities → /partner/bookings[/:id]
 * Stays → /partner/reservations[/:id]
 * Rentals → /partner/rental-bookings[/:id]
 * Legacy `?booking=` query links redirect to the path form.
 */

import {
  PARTNER_APP_BASE,
  PARTNER_RENTAL_BOOKINGS_PATH,
  PARTNER_RESERVATIONS_PATH,
} from './partnerPortalPaths';

export type PartnerBookingDeskFamily = 'tour' | 'stay' | 'rental';

function deskBase(family: PartnerBookingDeskFamily): string {
  if (family === 'stay') return PARTNER_RESERVATIONS_PATH;
  if (family === 'rental') return PARTNER_RENTAL_BOOKINGS_PATH;
  return `${PARTNER_APP_BASE}/bookings`;
}

function normalizeExtraSearch(
  extraSearch?: string | URLSearchParams | Record<string, string> | null
): URLSearchParams {
  if (extraSearch instanceof URLSearchParams) return new URLSearchParams(extraSearch);
  if (typeof extraSearch === 'string' && extraSearch) {
    return new URLSearchParams(extraSearch.startsWith('?') ? extraSearch.slice(1) : extraSearch);
  }
  if (extraSearch && typeof extraSearch === 'object') return new URLSearchParams(extraSearch);
  return new URLSearchParams();
}

export function partnerBookingDeskPath(params: {
  bookingId?: string | null;
  /** @deprecated Prefer `family`. Kept for stay/tour call sites. */
  isStay?: boolean;
  family?: PartnerBookingDeskFamily;
  /** Extra query params (ops, listing, …) without leading ?. */
  extraSearch?: string | URLSearchParams | Record<string, string> | null;
}): string {
  const family: PartnerBookingDeskFamily =
    params.family ?? (params.isStay ? 'stay' : 'tour');
  const base = deskBase(family);
  const q = normalizeExtraSearch(params.extraSearch);
  q.delete('booking');
  const id = String(params.bookingId ?? '').trim();
  const path = id ? `${base}/${encodeURIComponent(id)}` : base;
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Preserve current desk query while switching Bookings ↔ Reservations ↔ Rentals. */
export function partnerBookingDeskPathPreservingSearch(params: {
  isStay?: boolean;
  family?: PartnerBookingDeskFamily;
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
    family: params.family,
    bookingId: params.bookingId,
    extraSearch: q,
  });
}

/** Booking id from partner desk detail paths. */
export function parsePartnerBookingIdFromPath(pathname: string): string | null {
  const p = pathname.replace(/\/$/, '') || '/';
  const match = p.match(
    new RegExp(`^${PARTNER_APP_BASE}/(?:bookings|reservations|rental-bookings)/([^/]+)$`)
  );
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim() || null;
  } catch {
    return match[1].trim() || null;
  }
}

/** Read booking id from path first, then legacy `?booking=`. */
export function readPartnerBookingIdFromLocation(pathname: string, search: string): string | null {
  const fromPath = parsePartnerBookingIdFromPath(pathname);
  if (fromPath) return fromPath;
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const fromQuery = (q.get('booking') ?? '').trim();
  return fromQuery || null;
}
