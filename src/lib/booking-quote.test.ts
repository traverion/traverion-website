import { describe, expect, it } from 'vitest';
import { clientAmountConflictsWithQuote, formatOptionWeekdays, quoteBooking, weekdayIndexMondayFirst } from './booking-quote';
import type { TourPackage } from '../types/tour';
import type { ListingBookingOption } from '../types/listingExtras';
import { getListingPublishBlockers } from './listingPublishGate';
import { parsePathname } from './appRouting';

function option(partial: Partial<ListingBookingOption> & Pick<ListingBookingOption, 'id' | 'name' | 'priceUsd'>): ListingBookingOption {
  return {
    startTime: '09:00',
    duration: '3 hours',
    pickupPlace: 'Main square meeting point',
    minPersons: 1,
    maxPersons: 8,
    maxSpotsPerSlot: 8,
    optionInfo: 'Small group',
    weekdays: [true, true, true, true, true, true, true],
    availabilityDateFrom: '',
    availabilityDateTo: '',
    ...partial,
  };
}

function tour(over: Partial<TourPackage> = {}): TourPackage {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Aurora hunt small group',
    destination: 'Rovaniemi',
    duration: '3 hours',
    style: 'Tour',
    startLocation: 'Rovaniemi',
    endLocation: 'Rovaniemi',
    price: { startingFrom: 120, currency: 'USD', perPerson: true, twinOccupancy: false, customQuote: false, singleSupplement: 0, validity: 'Year round' },
    category: '3*',
    tourType: 'cultural',
    validity: 'Year round',
    image: 'https://example.com/hero.jpg',
    description: 'A real aurora experience with a local guide in the arctic night.',
    highlights: [],
    itinerary: [],
    includes: ['Guide', 'Hot drink'],
    excludes: ['Hotel pickup'],
    hotels: [],
    difficulty: 'Easy',
    groupSize: '1-8 People',
    bestTime: 'Winter',
    rating: 0,
    reviews: 0,
    isPopular: false,
    status: 'published',
    city: 'Rovaniemi',
    country: 'Finland',
    listingExtras: {
      bookingOptions: [
        option({
          id: 'opt-small',
          name: 'Small group',
          priceUsd: 149,
        }),
      ],
    },
    ...over,
  };
}

describe('weekdayIndexMondayFirst', () => {
  it('maps a known Monday and Sunday', () => {
    expect(weekdayIndexMondayFirst('2026-09-07')).toBe(0);
    expect(weekdayIndexMondayFirst('2026-09-13')).toBe(6);
  });
});

describe('quoteBooking', () => {
  const today = '2026-09-04';

  it('prices option × guests after percent discount', () => {
    const q = quoteBooking({
      tour: tour(),
      discounts: [
        {
          type: 'percent',
          value: 10,
          valid_from: '2026-09-01',
          valid_until: '2026-09-30',
          booking_option_id: 'opt-small',
        },
      ],
      bookingDate: '2026-09-10',
      guests: 2,
      bookingOptionId: 'opt-small',
      todayIso: today,
    });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.unitPrice).toBe(134.1);
    expect(q.totalAmount).toBe(268.2);
    expect(clientAmountConflictsWithQuote(1, q.totalAmount)).toBe(true);
    expect(clientAmountConflictsWithQuote(q.totalAmount, q.totalAmount)).toBe(false);
  });

  it('rejects a manipulated cheaper total conceptually (client amount ignored)', () => {
    const honest = quoteBooking({
      tour: tour(),
      discounts: [],
      bookingDate: '2026-09-10',
      guests: 2,
      bookingOptionId: 'opt-small',
      todayIso: today,
    });
    expect(honest.ok).toBe(true);
    if (!honest.ok) return;
    expect(honest.totalAmount).toBe(298);
    expect(clientAmountConflictsWithQuote(1, honest.totalAmount)).toBe(true);
  });

  it('rejects unpublished listings', () => {
    const q = quoteBooking({
      tour: tour({ status: 'draft' }),
      discounts: [],
      bookingDate: '2026-09-10',
      guests: 2,
      bookingOptionId: 'opt-small',
      todayIso: today,
    });
    expect(q.ok).toBe(false);
    if (q.ok) return;
    expect(q.code).toBe('unpublished');
  });

  it('rejects closed weekdays', () => {
    const q = quoteBooking({
      tour: tour({
        listingExtras: {
          bookingOptions: [
            option({
              id: 'opt-small',
              name: 'Small group',
              priceUsd: 149,
              weekdays: [true, true, true, true, true, false, false],
            }),
          ],
        },
      }),
      discounts: [],
      bookingDate: '2026-09-12',
      guests: 2,
      bookingOptionId: 'opt-small',
      todayIso: today,
    });
    expect(q.ok).toBe(false);
    if (q.ok) return;
    expect(q.code).toBe('weekday');
  });

  it('rejects party size above option max', () => {
    const q = quoteBooking({
      tour: tour(),
      discounts: [],
      bookingDate: '2026-09-10',
      guests: 20,
      bookingOptionId: 'opt-small',
      todayIso: today,
    });
    expect(q.ok).toBe(false);
    if (q.ok) return;
    expect(q.code).toBe('party');
  });

  it('requires an option when several exist', () => {
    const q = quoteBooking({
      tour: tour({
        listingExtras: {
          bookingOptions: [
            option({ id: 'a', name: 'A', priceUsd: 100 }),
            option({ id: 'b', name: 'B', priceUsd: 200 }),
          ],
        },
      }),
      discounts: [],
      bookingDate: '2026-09-10',
      guests: 2,
      todayIso: today,
    });
    expect(q.ok).toBe(false);
    if (q.ok) return;
    expect(q.code).toBe('option');
  });
});

describe('getListingPublishBlockers', () => {
  it('blocks an empty draft and accepts a complete listing', () => {
    const empty = getListingPublishBlockers(
      tour({
        title: 'Hi',
        subtitle: '',
        description: 'short',
        image: '',
        city: '',
        country: '',
        listingExtras: { bookingOptions: [] },
        includes: [],
        excludes: [],
        price: { startingFrom: 0, currency: 'USD', perPerson: true, twinOccupancy: false, customQuote: false, singleSupplement: 0, validity: 'Year round' },
      })
    );
    expect(empty.length).toBeGreaterThan(0);

    const ready = getListingPublishBlockers(
      tour({
        subtitle: 'Northern lights by snowmobile with a local guide',
        description: 'A'.repeat(120),
        image: 'https://example.com/real.jpg',
        listingExtras: {
          bookingOptions: [
            option({ id: 'opt-small', name: 'Small group', priceUsd: 149 }),
          ],
          galleryImageUrls: [
            'https://example.com/2.jpg',
            'https://example.com/3.jpg',
            'https://example.com/4.jpg',
          ],
        },
      })
    );
    expect(ready).toEqual([]);
  });

  it('blocks an option whose season already ended', () => {
    const ended = getListingPublishBlockers(
      tour({
        subtitle: 'Northern lights by snowmobile with a local guide',
        description: 'A'.repeat(120),
        image: 'https://example.com/real.jpg',
        listingExtras: {
          bookingOptions: [
            option({
              id: 'opt-small',
              name: 'Small group',
              priceUsd: 149,
              availabilityDateFrom: '2025-01-01',
              availabilityDateTo: '2025-03-01',
            }),
          ],
          galleryImageUrls: [
            'https://example.com/2.jpg',
            'https://example.com/3.jpg',
            'https://example.com/4.jpg',
          ],
        },
      }),
      '2026-09-05'
    );
    expect(ended.some((m) => m.toLowerCase().includes('past'))).toBe(true);
  });
});

describe('parsePathname legacy brochure URLs', () => {
  it('sends old SEA package paths to the live catalog', () => {
    expect(parsePathname('/9-vietnam').page).toBe('packages');
    expect(parsePathname('/14-indochina').page).toBe('packages');
    expect(parsePathname('/packages').page).toBe('packages');
    expect(parsePathname('/tour/ec6e5d7e-b5d6-4428-94a4-e3ae0801a4b5').page).toBe('packages');
    expect(parsePathname('/').page).toBe('home');
    expect(parsePathname('/cart').page).toBe('cart');
    expect(parsePathname('/account').page).toBe('account');
    expect(parsePathname('/bookings').page).toBe('bookings');
  });
});

describe('formatOptionWeekdays', () => {
  it('summarizes weekday masks', () => {
    expect(formatOptionWeekdays([true, true, true, true, true, true, true])).toBe('Every day');
    expect(formatOptionWeekdays([true, true, true, true, true, false, false])).toBe('Mon–Fri');
    expect(formatOptionWeekdays([false, false, false, false, false, true, true])).toBe('Sat, Sun');
  });
});
