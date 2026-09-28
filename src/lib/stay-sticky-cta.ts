/**
 * Mobile sticky CTA labels for stay listing — name the missing step, don't imply checkout is ready.
 */
import { TRAVELER_CONTINUE_TEST_CTA, TRAVELER_OPENING_CHECKOUT_CTA } from './booking-confirmation-copy';

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
}): string {
  if (params.selfBookCheckFailed) return 'Eligibility unavailable';
  if (params.selfBookBlocked) return 'Cannot book own listing';
  if (params.selectionOccupied) return 'Dates unavailable';
  if (params.occupancyUnavailable) return 'Availability unavailable';
  if (params.paying) return TRAVELER_OPENING_CHECKOUT_CTA;
  if (params.quoteOk && params.acceptTerms) return 'Accept terms';
  if (params.quoteOk && params.leadGuestReady === false) return 'Add guest name';
  if (params.quoteOk) return TRAVELER_CONTINUE_TEST_CTA;
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
