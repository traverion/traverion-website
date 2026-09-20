import { describe, expect, it } from 'vitest';
import { catalogHeadlineAmount, getDisplayPriceForTour } from './discount-display';
import type { TourPackage } from '../types/tour';
import type { ListingBookingOption } from '../types/listingExtras';

function option(partial: Partial<ListingBookingOption> & Pick<ListingBookingOption, 'id' | 'name' | 'priceUsd'>): ListingBookingOption {
  return {
    startTime: '18:00',
    duration: '4 hours',
    pickupPlace: 'City centre meeting point',
    minPersons: 1,
    maxPersons: 12,
    maxSpotsPerSlot: 12,
    optionInfo: 'Shared tour',
    weekdays: [true, true, true, true, true, true, true],
    availabilityDateFrom: '',
    availabilityDateTo: '',
    ...partial,
  };
}

function tour(over: Partial<TourPackage> = {}): TourPackage {
  return {
    id: 'c2d25217-84f0-46d4-8eaa-83949143fa06',
    title: 'Northern lights tour',
    destination: 'Rovaniemi',
    duration: '4 hours',
    style: 'Tour',
    startLocation: 'Rovaniemi',
    endLocation: 'Rovaniemi',
    price: {
      startingFrom: 149,
      currency: 'EUR',
      perPerson: true,
      twinOccupancy: false,
      customQuote: false,
      singleSupplement: 0,
      validity: 'Year round',
    },
    category: '3*',
    tourType: 'cultural',
    validity: 'Year round',
    image: 'https://example.com/hero.jpg',
    description: 'A'.repeat(80),
    highlights: [],
    itinerary: [],
    includes: [],
    excludes: [],
    hotels: [],
    difficulty: 'Easy',
    groupSize: '1-12 People',
    bestTime: 'Winter',
    rating: 0,
    reviews: 0,
    isPopular: false,
    status: 'published',
    city: 'Rovaniemi',
    country: 'Finland',
    listingExtras: {
      bookingOptions: [
        option({ id: 'adult', name: 'Adult', priceUsd: 189 }),
        option({ id: 'child', name: 'Child', priceUsd: 149 }),
      ],
    },
    ...over,
  };
}

describe('catalog headline vs stored startingFrom', () => {
  it('does not advertise the child fare as From on an Adult/Child menu', () => {
    const t = tour();
    expect(t.price.startingFrom).toBe(149);
    expect(catalogHeadlineAmount(t)).toBe(189);
    const display = getDisplayPriceForTour(t, new Map());
    expect(display.price).toBe(189);
    expect(display.qualifier).toBe('adult');
    expect(display.summary).toMatch(/Adult/);
    expect(display.summary).toMatch(/Child/);
  });
});

describe('stay money truth vs leftover listing discounts', () => {
  it('does not advertise a stay discount that checkout would not charge', () => {
    const stay = tour({
      listingExtras: {
        inventoryFamily: 'stay',
        stay: { nightlyPriceUsd: 200, maxGuests: 4, minNights: 1, cleaningFeeUsd: 0 },
        bookingOptions: [],
      },
      price: {
        startingFrom: 200,
        currency: 'EUR',
        perPerson: false,
        twinOccupancy: false,
        customQuote: false,
        singleSupplement: 0,
        validity: 'Year round',
      },
    });
    const discounts = new Map([
      [
        stay.id,
        [
          {
            id: 'disc-stay',
            listing_id: stay.id,
            type: 'percent' as const,
            value: 50,
            code: null,
            valid_from: '2026-01-01',
            valid_until: '2026-12-31',
            booking_option_id: null,
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      ],
    ]);
    const shown = getDisplayPriceForTour(stay, discounts);
    expect(shown.price).toBe(200);
    expect(shown.originalPrice).toBe(200);
    expect(shown.label).toBeUndefined();
  });
});
