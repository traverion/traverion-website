import { describe, expect, it } from 'vitest';
import {
  applyRentalCheckoutSearch,
  buildRentalCheckoutHref,
  buildRentalListingHref,
  clearRentalCheckoutSearch,
  parseRentalCheckoutSearch,
} from './rentalCheckoutUrl';

const LISTING_ID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';

const baseState = {
  variantId: 'opt-1',
  quantity: 2,
  durationUnit: 'day' as const,
  startDate: '2026-10-29',
  endDate: '2026-10-30',
  pickupHm: '09:00',
  returnHm: '18:00',
  paymentCancelled: false,
};

describe('rentalCheckoutUrl', () => {
  it('requires book=1, variant, and a valid date range', () => {
    expect(parseRentalCheckoutSearch('')).toBeNull();
    expect(parseRentalCheckoutSearch('book=1&start=2026-10-29&end=2026-10-30')).toBeNull();
    expect(
      parseRentalCheckoutSearch(
        'book=1&variant=opt-1&start=2026-10-30&end=2026-10-29&pickup=09:00&return=18:00'
      )
    ).toBeNull();
    expect(
      parseRentalCheckoutSearch(
        'book=1&variant=opt-1&unit=day&start=2026-10-29&end=2026-10-30&qty=2&pickup=09:00&return=18:00'
      )
    ).toEqual(baseState);
  });

  it('rejects hourly selections that span multiple calendar days', () => {
    expect(
      parseRentalCheckoutSearch(
        'book=1&variant=opt-1&unit=hour&start=2026-10-29&end=2026-10-30&pickup=09:00&return=18:00'
      )
    ).toBeNull();
  });

  it('builds checkout and listing hrefs with selection preserved', () => {
    const checkout = buildRentalCheckoutHref(LISTING_ID, baseState);
    expect(checkout).toContain('/rentals/');
    expect(checkout).toContain('book=1');
    expect(checkout).toContain('variant=opt-1');
    expect(checkout).toContain('start=2026-10-29');
    expect(checkout).toContain('end=2026-10-30');

    const listing = buildRentalListingHref(LISTING_ID, baseState);
    expect(listing).toContain('variant=opt-1');
    expect(listing).not.toContain('book=1');
  });

  it('clears book and payment flags without dropping listing params', () => {
    const params = applyRentalCheckoutSearch(new URLSearchParams('stay=x'), {
      ...baseState,
      paymentCancelled: true,
    });
    expect(params.get('book')).toBe('1');
    expect(params.get('payment')).toBe('cancelled');
    const cleared = clearRentalCheckoutSearch(params);
    expect(cleared.get('book')).toBeNull();
    expect(cleared.get('payment')).toBeNull();
  });
});
