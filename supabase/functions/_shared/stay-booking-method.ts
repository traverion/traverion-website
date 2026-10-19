/** Stay listing booking method — Instant vs Request to Book (Deno mirror). */

export type StayBookingMethod = 'instant' | 'request';

export const STAY_REQUEST_APPROVAL_HOURS = 24;

export function normalizeStayBookingMethod(raw: unknown): StayBookingMethod {
  return raw === 'request' ? 'request' : 'instant';
}

/** Read bookingMethod from listing_extras.stay (default instant). */
export function stayBookingMethodFromListingExtras(extras: unknown): StayBookingMethod {
  if (!extras || typeof extras !== 'object') return 'instant';
  const stay = (extras as { stay?: unknown }).stay;
  if (!stay || typeof stay !== 'object') return 'instant';
  return normalizeStayBookingMethod((stay as { bookingMethod?: unknown }).bookingMethod);
}

export function stayRequestApprovalExpiresAtIso(fromMs: number = Date.now()): string {
  return new Date(fromMs + STAY_REQUEST_APPROVAL_HOURS * 60 * 60 * 1000).toISOString();
}

/** Stripe Checkout expires_at max is 24h from creation. */
export function stayRequestCheckoutExpiresAtUnix(fromMs: number = Date.now()): number {
  return Math.floor(fromMs / 1000) + STAY_REQUEST_APPROVAL_HOURS * 60 * 60;
}
