import { describe, expect, it } from 'vitest';
import type { TourPackage } from '../types/tour';
import type { ListingBookingOption } from '../types/listingExtras';
import { createPriceCategory, defaultAgeDependentCategories } from './price-categories';
import { optionCardPriceForSelection } from './tour-option-card-price';
import type { TourBookingVariant } from './booking-flow';
import type { ListingDiscount } from '../data/supabase-discounts';

function ageOption(id: string, name: string, adult: number, child: number): ListingBookingOption {
  return {
    id,
    name,
    priceUsd: adult,
    pricingMode: 'age_dependent',
    priceCategories: defaultAgeDependentCategories(adult, child),
    duration: '5 hours',
    minPersons: 1,
    maxPersons: 8,
    maxSpotsPerSlot: 8,
    fulfillment: 'pickup',
    weekdays: [true, true, true, true, true, true, true],
    startTime: '20:00',
    availabilityDateFrom: '2020-01-01',
    availabilityDateTo: '',
  } as ListingBookingOption;
}

function tourWithOptions(options: ListingBookingOption[]): TourPackage {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Northern Lights',
    status: 'published',
    destination: 'Rovaniemi',
    city: 'Rovaniemi',
    country: 'Finland',
    price: {
      startingFrom: 89,
      currency: 'EUR',
      perPerson: true,
      twinOccupancy: false,
      customQuote: false,
      singleSupplement: 0,
      validity: 'Year round',
    },
    listingExtras: { bookingOptions: options, departureTimezone: 'Europe/Helsinki' },
  } as TourPackage;
}

function variant(opt: ListingBookingOption): TourBookingVariant {
  return {
    id: opt.id,
    label: opt.name,
    subtitle: '',
    pricePerPerson: opt.priceUsd,
    listingOption: opt,
  };
}

function pctOff(optionId: string, value: number): ListingDiscount {
  return {
    id: `d-${optionId}`,
    listing_id: '11111111-1111-4111-8111-111111111111',
    type: 'percent',
    value,
    booking_option_id: optionId,
    valid_from: null,
    valid_until: null,
    paused: false,
    deleted_at: null,
  } as ListingDiscount;
}

describe('optionCardPriceForSelection', () => {
  const small = ageOption('opt-small', 'Small group', 89, 49);
  const bus = ageOption('opt-bus', 'Bus', 79, 39);
  const tour = tourWithOptions([small, bus]);
  const adultId = createPriceCategory({ kind: 'adult', label: 'Adult', priceUsd: 89 }).id;

  it('shows live selection total for 1 adult — not cheapest child “from”', () => {
    // Rebuild categories with stable ids from the option itself
    const adultCat = small.priceCategories!.find((c) => c.kind === 'adult')!;
    const childCat = small.priceCategories!.find((c) => c.kind === 'child')!;
    const mix = { [adultCat.id]: 1, [childCat.id]: 0 };
    const display = optionCardPriceForSelection({
      tour,
      variant: variant(small),
      bookingDate: '2026-11-15',
      discounts: [pctOff(small.id, 16)],
      guests: 1,
      participantMix: mix,
      todayIso: '2026-10-22',
      selectedId: null,
      selectedDepartureTime: '',
    });
    expect(display.mode).toBe('selection');
    expect(display.total).toBeCloseTo(89 * 0.84, 2);
    expect(display.total).not.toBeCloseTo(49 * 0.84, 2);
    expect(display.caption.toLowerCase()).toMatch(/adult|person|selection|per/);
  });

  it('keeps small-group and bus selection totals distinct', () => {
    const smallAdult = small.priceCategories!.find((c) => c.kind === 'adult')!;
    const busAdult = bus.priceCategories!.find((c) => c.kind === 'adult')!;
    const smallMix = { [smallAdult.id]: 1 };
    const busMix = { [busAdult.id]: 1 };
    const smallPrice = optionCardPriceForSelection({
      tour,
      variant: variant(small),
      bookingDate: '2026-11-15',
      discounts: [pctOff(small.id, 16), pctOff(bus.id, 16)],
      guests: 1,
      participantMix: smallMix,
      todayIso: '2026-10-22',
      selectedId: null,
      selectedDepartureTime: '',
    });
    const busPrice = optionCardPriceForSelection({
      tour,
      variant: variant(bus),
      bookingDate: '2026-11-15',
      discounts: [pctOff(small.id, 16), pctOff(bus.id, 16)],
      guests: 1,
      participantMix: busMix,
      todayIso: '2026-10-22',
      selectedId: null,
      selectedDepartureTime: '',
    });
    expect(smallPrice.total).toBeCloseTo(89 * 0.84, 2);
    expect(busPrice.total).toBeCloseTo(79 * 0.84, 2);
    expect(smallPrice.total).not.toEqual(busPrice.total);
  });

  it('remaps adult quantity across options with different category ids', () => {
    const smallAdult = small.priceCategories!.find((c) => c.kind === 'adult')!;
    const mix = { [smallAdult.id]: 1 };
    const busPrice = optionCardPriceForSelection({
      tour,
      variant: variant(bus),
      bookingDate: '2026-11-15',
      discounts: [pctOff(bus.id, 16)],
      guests: 1,
      participantMix: mix,
      mixSourceOption: small,
      todayIso: '2026-10-22',
      selectedId: small.id,
      selectedDepartureTime: '20:00',
    });
    expect(busPrice.mode).toBe('selection');
    expect(busPrice.total).toBeCloseTo(79 * 0.84, 2);
  });

  it('hides price when hidePrice is set', () => {
    const display = optionCardPriceForSelection({
      tour,
      variant: variant(small),
      bookingDate: '2026-11-15',
      discounts: [],
      guests: 1,
      participantMix: null,
      todayIso: '2026-10-22',
      selectedId: small.id,
      selectedDepartureTime: '20:00',
      hidePrice: true,
    });
    expect(display.mode).toBe('unavailable');
    expect(display.total).toBeNull();
  });

  // silence unused when categories regenerate ids
  void adultId;
});
