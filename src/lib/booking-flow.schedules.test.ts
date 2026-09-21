import { describe, expect, it } from 'vitest';
import type { TourPackage } from '../types/tour';
import type { ListingBookingOption } from '../types/listingExtras';
import { getPartySizeBounds, getPartySizeBoundsForVariant, getTourBookingVariants } from './booking-flow';
import { defaultAgeDependentCategories } from './price-categories';

const daily = [true, true, true, true, true, true, true];

function tourWithOption(option: ListingBookingOption): TourPackage {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Northern Lights',
    destination: 'Rovaniemi',
    duration: '6 hours',
    style: 'Tour',
    startLocation: 'Rovaniemi',
    endLocation: 'Rovaniemi',
    price: {
      startingFrom: 0,
      currency: 'EUR',
      perPerson: true,
      twinOccupancy: false,
      customQuote: false,
      singleSupplement: 0,
      validity: 'Seasonal',
    },
    category: '3*',
    tourType: 'cultural',
    validity: 'Seasonal',
    image: 'https://example.com/hero.jpg',
    description: 'Aurora hunt',
    highlights: [],
    itinerary: [],
    includes: [],
    excludes: [],
    hotels: [],
    difficulty: 'Easy',
    groupSize: '1-8 People',
    bestTime: 'Autumn',
    rating: 0,
    reviews: 0,
    isPopular: false,
    status: 'published',
    listingExtras: { bookingOptions: [option] },
  } as TourPackage;
}

describe('getTourBookingVariants with schedules', () => {
  it('uses the cheapest ready schedule headline price when option price is empty', () => {
    const option = {
      id: 'opt-1',
      name: 'Small group',
      priceUsd: 0,
      startTime: '',
      duration: '6 hours',
      pickupPlace: 'Hotel pickup',
      minPersons: 1,
      maxPersons: 1,
      maxSpotsPerSlot: 1,
      optionInfo: '',
      weekdays: daily,
      availabilityDateFrom: '',
      availabilityDateTo: '',
      pricingMode: 'uniform',
      schedules: [
        {
          id: 'sch-sep',
          name: 'September',
          availabilityDateFrom: '2026-09-01',
          availabilityDateTo: '2026-09-30',
          weekdays: daily,
          startTime: '20:00',
          pricingMode: 'age_dependent',
          priceUsd: 119,
          priceCategories: defaultAgeDependentCategories(119, 89),
          minPersons: 2,
          maxPersons: 8,
          maxSpotsPerSlot: 8,
          status: 'ready',
        },
        {
          id: 'sch-oct',
          name: 'October',
          availabilityDateFrom: '2026-10-01',
          availabilityDateTo: '2026-10-31',
          weekdays: daily,
          startTime: '19:00',
          pricingMode: 'age_dependent',
          priceUsd: 149,
          priceCategories: defaultAgeDependentCategories(149, 109),
          minPersons: 2,
          maxPersons: 6,
          maxSpotsPerSlot: 6,
          status: 'ready',
        },
      ],
    } as ListingBookingOption;

    const variants = getTourBookingVariants(tourWithOption(option));
    expect(variants).toHaveLength(1);
    expect(variants[0].pricePerPerson).toBe(119);
    expect(variants[0].subtitle).toMatch(/From 19:00|Starts/);
    expect(getPartySizeBounds(tourWithOption(option))).toEqual({ min: 2, max: 8 });
  });

  it('resolves party bounds from the schedule that applies on the chosen date', () => {
    const option = {
      id: 'opt-1',
      name: 'Small group',
      priceUsd: 0,
      startTime: '',
      duration: '6 hours',
      pickupPlace: 'Hotel pickup',
      minPersons: 1,
      maxPersons: 1,
      maxSpotsPerSlot: 1,
      optionInfo: '',
      weekdays: daily,
      availabilityDateFrom: '',
      availabilityDateTo: '',
      pricingMode: 'uniform',
      schedules: [
        {
          id: 'sch-sep',
          name: 'September',
          availabilityDateFrom: '2026-09-01',
          availabilityDateTo: '2026-09-30',
          weekdays: daily,
          startTime: '20:00',
          pricingMode: 'uniform',
          priceUsd: 119,
          minPersons: 2,
          maxPersons: 8,
          maxSpotsPerSlot: 8,
          status: 'ready',
        },
        {
          id: 'sch-oct',
          name: 'October',
          availabilityDateFrom: '2026-10-01',
          availabilityDateTo: '2026-10-31',
          weekdays: daily,
          startTime: '19:00',
          pricingMode: 'uniform',
          priceUsd: 149,
          minPersons: 4,
          maxPersons: 6,
          maxSpotsPerSlot: 6,
          status: 'ready',
        },
      ],
    } as ListingBookingOption;

    const tour = tourWithOption(option);
    const variant = getTourBookingVariants(tour)[0];
    expect(getPartySizeBoundsForVariant(tour, variant, '2026-09-15', '20:00')).toEqual({ min: 2, max: 8 });
    expect(getPartySizeBoundsForVariant(tour, variant, '2026-10-15', '19:00')).toEqual({ min: 4, max: 6 });
  });
});
