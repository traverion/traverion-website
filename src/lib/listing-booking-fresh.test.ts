import { describe, expect, it } from 'vitest';
import {
  listingHasActiveCheckoutFlag,
  stripListingBookingSelectionParams,
} from './listing-booking-fresh';

describe('listing-booking-fresh', () => {
  it('detects active book=1 checkout', () => {
    expect(listingHasActiveCheckoutFlag('book=1&checkIn=2026-11-01&checkOut=2026-11-03')).toBe(true);
    expect(listingHasActiveCheckoutFlag('stay=abc&checkIn=2026-11-01')).toBe(false);
  });

  it('strips booking selection while keeping listing identity', () => {
    const cleaned = stripListingBookingSelectionParams(
      'tour=a1b2c3d4-e5f6-4789-a012-3456789abcde&date=2026-10-29&option=opt-1&guests=2&mix=adult:2&book=1&payment=cancelled'
    );
    expect(cleaned.get('tour')).toBe('a1b2c3d4-e5f6-4789-a012-3456789abcde');
    expect(cleaned.get('date')).toBeNull();
    expect(cleaned.get('option')).toBeNull();
    expect(cleaned.get('guests')).toBeNull();
    expect(cleaned.get('mix')).toBeNull();
    expect(cleaned.get('book')).toBeNull();
    expect(cleaned.get('payment')).toBeNull();
  });

  it('strips stay and rental selection keys', () => {
    const stay = stripListingBookingSelectionParams(
      'stay=a1b2c3d4-e5f6-4789-a012-3456789abcde&checkIn=2026-10-29&checkOut=2026-10-31&adults=2&children=1'
    );
    expect(stay.get('stay')).toBe('a1b2c3d4-e5f6-4789-a012-3456789abcde');
    expect(stay.get('checkIn')).toBeNull();
    expect(stay.get('adults')).toBeNull();

    const rental = stripListingBookingSelectionParams(
      'variant=opt-1&start=2026-10-29&end=2026-10-30&pickup=09:00&return=18:00&qty=1&unit=day'
    );
    expect(rental.get('variant')).toBeNull();
    expect(rental.get('start')).toBeNull();
    expect(rental.get('pickup')).toBeNull();
  });
});
