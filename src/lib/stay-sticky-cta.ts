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
}): string {
  if (params.selectionOccupied) return 'Dates unavailable';
  if (params.paying) return TRAVELER_OPENING_CHECKOUT_CTA;
  if (params.quoteOk && params.leadGuestReady === false) return 'Add guest name';
  if (params.quoteOk) return TRAVELER_CONTINUE_TEST_CTA;  if (params.checkIn && params.checkOut && params.quoteError) {
    if (/Minimum stay/i.test(params.quoteError)) return `Need ${params.minNights}+ nights`;
    return 'Fix dates';
  }
  if (params.checkIn && !params.checkOut) return 'Pick check-out';
  return 'Select dates';
}
