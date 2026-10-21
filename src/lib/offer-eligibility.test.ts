import { describe, expect, it } from 'vitest';
import { splitGrossByCommissionBps } from './commercial-money';
import {
  bestCustomerDiscount,
  civilDayInRange,
  discountedCustomerMinor,
  estimatedSupplierEarningsMinor,
  offerApplies,
  offerLifecycle,
  supplierOffersOverlap,
  validateOfferDateWindow,
  type OfferPriceRow,
} from './offer-eligibility';
import { quoteListingBooking, discountRowApplies } from '../../supabase/functions/_shared/booking-quote.ts';
import type { DiscountRow, ListingQuoteRow } from '../../supabase/functions/_shared/booking-quote.ts';

const percent = (value: number, extra: Partial<OfferPriceRow> = {}): OfferPriceRow => ({
  type: 'percent',
  value,
  ...extra,
});

describe('offer pricing', () => {
  it('prices €119 at 15% off as €101.15 and supplier earnings of €85.98 at 15% commission', () => {
    const customerMinor = discountedCustomerMinor(119, 15);
    expect(customerMinor).toBe(10115);
    const split = splitGrossByCommissionBps(customerMinor, 1500);
    expect(split.commissionMinor).toBe(1517);
    expect(split.supplierMinor).toBe(8598);
    expect(estimatedSupplierEarningsMinor(119, 15, 1500)).toBe(8598);
    expect(bestCustomerDiscount(119, [percent(15, { id: 'a' })]).price).toBe(101.15);
  });

  it('does not stack overlapping percent offers and breaks ties by offer id', () => {
    const best = bestCustomerDiscount(119, [
      percent(15, { id: 'b' }),
      percent(10, { id: 'a' }),
      percent(15, { id: 'a' }),
    ]);
    expect(best.price).toBe(101.15);
    expect(best.id).toBe('a');
  });

  it('rejects a zero base and an inverted date window', () => {
    expect(bestCustomerDiscount(0, [percent(15)]).price).toBe(0);
    expect(validateOfferDateWindow('2026-06-10', '2026-06-01', 'booking period')).toMatch(/on or after/i);
    expect(validateOfferDateWindow('2026-01-01', '2028-12-31', 'booking period')).toMatch(/730/);
  });
});

describe('offer eligibility', () => {
  const row: OfferPriceRow = {
    id: 'offer-1',
    type: 'percent',
    value: 15,
    book_from: '2026-03-01',
    book_until: '2026-03-14',
    valid_from: '2026-03-01',
    valid_until: '2026-03-14',
    booking_option_id: 'opt-1',
  };

  it('accepts an inclusive booking day and a later departure when activity dates are off', () => {
    expect(offerApplies(row, { optionId: 'opt-1', bookingDay: '2026-03-01', activityDay: '2026-03-20' })).toBe(true);
    expect(offerApplies(row, { optionId: 'opt-1', bookingDay: '2026-03-14', activityDay: '2026-04-02' })).toBe(true);
    expect(offerApplies(row, { optionId: 'opt-1', bookingDay: '2026-02-28', activityDay: '2026-03-20' })).toBe(false);
    expect(offerApplies(row, { optionId: 'opt-1', bookingDay: '2026-03-15', activityDay: '2026-03-20' })).toBe(false);
  });

  it('requires the departure inside the activity window when that limit is on', () => {
    const limited = { ...row, activity_from: '2026-03-10', activity_until: '2026-03-31' };
    expect(offerApplies(limited, { optionId: 'opt-1', bookingDay: '2026-03-05', activityDay: '2026-03-10' })).toBe(true);
    expect(offerApplies(limited, { optionId: 'opt-1', bookingDay: '2026-03-05', activityDay: '2026-03-09' })).toBe(false);
    expect(offerApplies(limited, { optionId: 'other', bookingDay: '2026-03-05', activityDay: '2026-03-20' })).toBe(false);
  });

  it('keeps legacy rows on the departure window', () => {
    const legacy: OfferPriceRow = {
      type: 'percent',
      value: 15,
      valid_from: '2026-06-01',
      valid_until: '2026-06-30',
      booking_option_id: null,
    };
    expect(offerApplies(legacy, { optionId: 'opt-1', bookingDay: '2026-05-01', activityDay: '2026-06-10' })).toBe(true);
    expect(offerApplies(legacy, { optionId: 'opt-1', bookingDay: '2026-06-10', activityDay: '2026-07-01' })).toBe(false);
  });

  it('skips paused, deleted, and limit-reached offers', () => {
    const ctx = { optionId: 'opt-1', bookingDay: '2026-03-05', activityDay: '2026-03-20' };
    expect(offerApplies({ ...row, paused: true }, ctx)).toBe(false);
    expect(offerApplies({ ...row, deleted_at: '2026-03-02T00:00:00Z' }, ctx)).toBe(false);
    expect(offerApplies({ ...row, booking_limit: 2, redeemed_count: 2 }, ctx)).toBe(false);
    expect(offerApplies({ ...row, booking_limit: 2, redeemed_count: 1 }, ctx)).toBe(true);
  });

  it('compares calendar days without shifting them', () => {
    expect(civilDayInRange('2026-03-01', '2026-03-01', '2026-03-01')).toBe(true);
    expect(civilDayInRange('2026-03-02', '2026-03-01', '2026-03-01')).toBe(false);
  });

  it('matches the checkout quote helper', () => {
    const denoRow: DiscountRow = {
      id: 'offer-1',
      type: 'percent',
      value: 15,
      valid_from: '2026-03-01',
      valid_until: '2026-03-14',
      booking_option_id: 'opt-1',
      book_from: '2026-03-01',
      book_until: '2026-03-14',
      activity_from: '2026-03-10',
      activity_until: '2026-03-31',
    };
    const ctx = { optionId: 'opt-1', bookingDay: '2026-03-05', activityDay: '2026-03-20' };
    expect(discountRowApplies(denoRow, ctx.optionId, ctx.activityDay, ctx.bookingDay)).toBe(
      offerApplies(denoRow, ctx)
    );
    expect(discountRowApplies(denoRow, 'opt-1', '2026-03-09', '2026-03-05')).toBe(false);
  });

  it('detects overlapping discount windows on the same option', () => {
    expect(
      supplierOffersOverlap(
        { type: 'percent', value: 15, book_from: '2026-03-01', book_until: '2026-03-20', optionIds: ['opt-1'] },
        { type: 'percent', value: 10, book_from: '2026-03-10', book_until: '2026-03-30', booking_option_id: 'opt-1' },
        '2026-03-01'
      )
    ).toBe(true);
    expect(
      supplierOffersOverlap(
        { type: 'percent', value: 15, book_from: '2026-04-01', book_until: '2026-04-10', optionIds: ['opt-1'] },
        { type: 'percent', value: 10, book_from: '2026-03-01', book_until: '2026-03-20', booking_option_id: 'opt-1' },
        '2026-03-01'
      )
    ).toBe(false);
  });

  it('allows a second option on the same listing when windows overlap', () => {
    expect(
      supplierOffersOverlap(
        { type: 'percent', value: 15, book_from: '2026-03-01', book_until: '2026-03-20', optionIds: ['opt-2'] },
        { type: 'percent', value: 10, book_from: '2026-03-01', book_until: '2026-03-20', booking_option_id: 'opt-1' },
        '2026-03-01'
      )
    ).toBe(false);
  });

  it('keeps paused offers in conflict, but ignores ended offers', () => {
    expect(
      supplierOffersOverlap(
        { type: 'percent', value: 15, book_from: '2026-03-01', book_until: '2026-03-20', optionIds: ['opt-1'] },
        {
          type: 'percent',
          value: 10,
          book_from: '2026-03-01',
          book_until: '2026-03-20',
          booking_option_id: 'opt-1',
          paused: true,
        },
        '2026-03-05'
      )
    ).toBe(true);
    expect(
      supplierOffersOverlap(
        { type: 'percent', value: 15, book_from: '2026-03-01', book_until: '2026-03-20', optionIds: ['opt-1'] },
        {
          type: 'percent',
          value: 10,
          book_from: '2026-01-01',
          book_until: '2026-01-31',
          booking_option_id: 'opt-1',
        },
        '2026-03-05'
      )
    ).toBe(false);
  });

  it('treats unrestricted service dates as overlapping any restricted range', () => {
    expect(
      supplierOffersOverlap(
        {
          type: 'percent',
          value: 15,
          book_from: '2026-03-01',
          book_until: '2026-03-20',
          optionIds: ['opt-1'],
        },
        {
          type: 'percent',
          value: 10,
          book_from: '2026-03-01',
          book_until: '2026-03-20',
          booking_option_id: 'opt-1',
          activity_from: '2026-03-10',
          activity_until: '2026-03-15',
        },
        '2026-03-01'
      )
    ).toBe(true);
  });

  it('orders lifecycle from the booking window and confirmed count', () => {
    expect(offerLifecycle(row, '2026-03-05', 0)).toBe('active');
    expect(offerLifecycle(row, '2026-02-01', 0)).toBe('upcoming');
    expect(offerLifecycle(row, '2026-04-01', 0)).toBe('ended');
    expect(offerLifecycle({ ...row, paused: true }, '2026-03-05', 0)).toBe('paused');
    expect(offerLifecycle({ ...row, booking_limit: 1 }, '2026-03-05', 1)).toBe('limit_reached');
  });
});

describe('checkout quote uses the offer', () => {
  const listing: ListingQuoteRow = {
    status: 'published',
    price_starting_from: 119,
    price_currency: 'EUR',
    listing_extras: {},
    group_size: '1-8',
  };

  it('charges €101.15 for one guest when a 15% offer matches the departure', () => {
    const res = quoteListingBooking({
      listing,
      discounts: [
        { id: 'offer-119', type: 'percent', value: 15, valid_from: '2026-06-01', valid_until: '2026-06-30', booking_option_id: null },
      ],
      bookingDate: '2026-06-10',
      guests: 1,
      todayIso: '2026-06-10',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.totalAmount).toBe(101.15);
      expect(res.appliedDiscountId).toBe('offer-119');
    }
  });

  it('keeps a later departure discounted when only the booking window is limited', () => {
    const res = quoteListingBooking({
      listing,
      discounts: [
        {
          id: 'book-window',
          type: 'percent',
          value: 15,
          valid_from: '2026-06-01',
          valid_until: '2026-06-07',
          book_from: '2026-06-01',
          book_until: '2026-06-07',
          booking_option_id: null,
        },
      ],
      bookingDate: '2026-07-01',
      guests: 1,
      todayIso: '2026-06-05',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.totalAmount).toBe(101.15);
  });

  it('does not apply a paused offer or a limit that is already full', () => {
    const paused = quoteListingBooking({
      listing,
      discounts: [
        {
          id: 'paused',
          type: 'percent',
          value: 15,
          valid_from: null,
          valid_until: null,
          booking_option_id: null,
          paused: true,
        },
      ],
      bookingDate: '2026-06-10',
      guests: 1,
      todayIso: '2026-06-10',
    });
    expect(paused.ok).toBe(true);
    if (paused.ok) expect(paused.totalAmount).toBe(119);

    const full = quoteListingBooking({
      listing,
      discounts: [
        {
          id: 'capped',
          type: 'percent',
          value: 15,
          valid_from: null,
          valid_until: null,
          booking_option_id: null,
          booking_limit: 1,
          redeemed_count: 1,
        },
      ],
      bookingDate: '2026-06-10',
      guests: 2,
      todayIso: '2026-06-10',
    });
    expect(full.ok).toBe(true);
    if (full.ok) expect(full.totalAmount).toBe(238);
  });

  it('uses one age-category offer without stacking', () => {
    const res = quoteListingBooking({
      listing: {
        status: 'published',
        price_starting_from: 0,
        price_currency: 'EUR',
        group_size: null,
        listing_extras: {
          bookingOptions: [
            {
              id: 'opt-age',
              name: 'Family',
              priceUsd: 119,
              minPersons: 1,
              maxPersons: 10,
              weekdays: [true, true, true, true, true, true, true],
              availabilityDateFrom: '2026-01-01',
              availabilityDateTo: '',
              pricingMode: 'age_dependent',
              priceCategories: [
                { id: 'adult', label: 'Adult', kind: 'adult', priceUsd: 119, notPermitted: false, requiresAdult: false, countsTowardCapacity: true },
                { id: 'child', label: 'Child', kind: 'child', priceUsd: 60, notPermitted: false, requiresAdult: true, countsTowardCapacity: true },
              ],
            },
          ],
        },
      },
      discounts: [
        { id: 'z', type: 'percent', value: 10, valid_from: null, valid_until: null, booking_option_id: 'opt-age' },
        { id: 'a', type: 'percent', value: 15, valid_from: null, valid_until: null, booking_option_id: 'opt-age' },
      ],
      bookingDate: '2026-06-10',
      guests: 1,
      bookingOptionId: 'opt-age',
      participantMix: { adult: 1, child: 1 },
      todayIso: '2026-06-10',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.totalAmount).toBe(152.15);
      expect(res.appliedDiscountId).toBe('a');
    }
  });
});
