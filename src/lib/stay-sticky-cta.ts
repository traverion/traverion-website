/**
 * Mobile sticky CTA labels for stay listing — name the missing step, don't imply checkout is ready.
 */
import { TRAVELER_OPENING_CHECKOUT_CTA } from './booking-confirmation-copy';

export const STAY_REVIEW_BOOKING_CTA = 'Review booking';
export const STAY_CONFIRM_PAYMENT_CTA = 'Confirm & continue to secure payment';
export const STAY_REVIEW_REQUEST_CTA = 'Review request';
export const STAY_CONFIRM_REQUEST_CTA = 'Confirm & send request';

export function stayStickyBookCtaLabel(params: {
  selectionOccupied: boolean;
  paying?: boolean;
  quoteOk: boolean;
  leadGuestReady?: boolean;
  checkIn: string;
  checkOut: string;
  quoteError?: string | null;
  minNights: number;
  /** Occupancy RPC failed — do not imply Continue is ready (tour capacityUnknown parity). */
  occupancyUnavailable?: boolean;
  selfBookBlocked?: boolean;
  selfBookCheckFailed?: boolean;
  /** Terms not accepted yet — keep CTA tappable (Phase 1353). */
  acceptTerms?: boolean;
  /** Listing uses Request to Book (authorize now, host accepts within 24h). */
  requestToBook?: boolean;
  /** details = dates/guests card; review = final confirm before Stripe. */
  step?: 'details' | 'review';
}): string {
  if (params.selfBookCheckFailed) return 'Eligibility unavailable';
  if (params.selfBookBlocked) return 'Cannot book own listing';
  if (params.selectionOccupied) return 'Dates unavailable';
  if (params.occupancyUnavailable) return 'Availability unavailable';
  if (params.paying) return params.requestToBook ? 'Sending request…' : TRAVELER_OPENING_CHECKOUT_CTA;
  if (params.quoteOk && params.acceptTerms) return 'Accept terms';
  if (params.quoteOk && params.leadGuestReady === false) return 'Add guest name';
  if (params.quoteOk) {
    if (params.step === 'review') {
      return params.requestToBook ? STAY_CONFIRM_REQUEST_CTA : STAY_CONFIRM_PAYMENT_CTA;
    }
    return params.requestToBook ? STAY_REVIEW_REQUEST_CTA : STAY_REVIEW_BOOKING_CTA;
  }
  // Phase 1313: keep quote-error branch readable (was one-line jammed after Continue).
  // Phase 1520: do not call every quote failure “Fix dates” (Tour capacity parity).
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
