/**
 * Mobile sticky CTA labels for stay listing — name the missing step, don't imply checkout is ready.
 */
import { TRAVELER_OPENING_CHECKOUT_CTA } from './booking-confirmation-copy';

export const STAY_RESERVE_CTA = 'Reserve';
export const STAY_CONTINUE_BOOKING_CTA = 'Continue to booking';
export const STAY_CONFIRM_PAYMENT_CTA = 'Continue to secure payment';
export const STAY_REQUEST_CTA = 'Request to book';
export const STAY_CONFIRM_REQUEST_CTA = 'Confirm & send request';

export function stayStickyBookCtaLabel(params: {
  selectionOccupied: boolean;
  paying?: boolean;
  quoteOk: boolean;
  checkIn: string;
  checkOut: string;
  quoteError?: string | null;
  minNights: number;
  /** Occupancy RPC failed — do not imply Continue is ready (tour capacityUnknown parity). */
  occupancyUnavailable?: boolean;
  selfBookBlocked?: boolean;
  selfBookCheckFailed?: boolean;
  /** Listing uses Request to Book (authorize now, host accepts within 24h). */
  requestToBook?: boolean;
  /** confirmation = dedicated booking page CTA (not the listing sticky card). */
  surface?: 'listing' | 'confirmation';
}): string {
  if (params.selfBookCheckFailed) return 'Eligibility unavailable';
  if (params.selfBookBlocked) return 'Cannot book own listing';
  if (params.selectionOccupied) return 'Dates unavailable';
  if (params.occupancyUnavailable) return 'Availability unavailable';
  if (params.paying) {
    return params.requestToBook ? 'Sending request…' : TRAVELER_OPENING_CHECKOUT_CTA;
  }
  if (params.quoteOk) {
    if (params.surface === 'confirmation') {
      return params.requestToBook ? STAY_CONFIRM_REQUEST_CTA : STAY_CONFIRM_PAYMENT_CTA;
    }
    return params.requestToBook ? STAY_REQUEST_CTA : STAY_RESERVE_CTA;
  }
  if (params.checkIn && params.checkOut && params.quoteError) {
    if (/Minimum stay/i.test(params.quoteError)) return `Need ${params.minNights}+ nights`;
    if (/Guest capacity is unavailable|capacity is unavailable/i.test(params.quoteError)) {
      return 'Capacity unavailable';
    }
    if (/allows up to|how many guests|guest count|guests/i.test(params.quoteError)) {
      return 'Fix guests';
    }
    if (/nightly price|does not have a nightly price|price/i.test(params.quoteError)) {
      return 'Price unavailable';
    }
    return 'Fix dates';
  }
  if (params.checkIn && !params.checkOut) return 'Pick check-out';
  return 'Select dates';
}
