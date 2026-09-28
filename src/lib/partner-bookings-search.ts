/**
 * Client-side Partner Bookings search helpers (desk guest/search box).
 */

/** Exact booking # match — supports `42` or `#42` (admin search parity, Phase 1484). */
export function partnerBookingNumberMatchesFilterQuery(
  query: string,
  bookingNumber: number | null | undefined
): boolean {
  const trimmed = query.trim();
  if (!trimmed || typeof bookingNumber !== 'number' || bookingNumber <= 0) return false;
  const token = trimmed.startsWith('#') ? trimmed.slice(1).trim() : trimmed;
  if (!/^\d+$/.test(token)) return false;
  const n = Number.parseInt(token, 10);
  return Number.isFinite(n) && n > 0 && bookingNumber === n;
}
