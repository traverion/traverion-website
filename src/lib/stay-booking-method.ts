/** Stay listing booking method — Instant vs Request to Book. */

export const STAY_BOOKING_METHODS = [
  {
    id: 'instant',
    label: 'Instant booking',
    body: 'Guests book available dates immediately and pay at checkout.',
  },
  {
    id: 'request',
    label: 'Request to Book',
    body: 'Guests request a stay. You have 24 hours to accept. Payment is authorized first and captured only after you accept.',
  },
] as const;

export type StayBookingMethod = (typeof STAY_BOOKING_METHODS)[number]['id'];

export function normalizeStayBookingMethod(raw: unknown): StayBookingMethod {
  return raw === 'request' ? 'request' : 'instant';
}

export function stayBookingMethodLabel(method: StayBookingMethod): string {
  return STAY_BOOKING_METHODS.find((row) => row.id === method)?.label ?? 'Instant booking';
}

/** Hours the host has to accept a Request to Book after authorization. */
export const STAY_REQUEST_APPROVAL_HOURS = 24;

export function stayRequestApprovalExpiresAtIso(fromMs: number = Date.now()): string {
  return new Date(fromMs + STAY_REQUEST_APPROVAL_HOURS * 60 * 60 * 1000).toISOString();
}
