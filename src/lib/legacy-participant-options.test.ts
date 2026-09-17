import { describe, expect, it } from 'vitest';
import { normalizeListingBookingOption } from '../types/listingExtras';
import {
  coalesceLegacyParticipantTicketOptions,
  isLegacyParticipantTicketMenu,
} from './legacy-participant-options';
import { getTourBookingVariants } from './booking-flow';
import { quoteBooking } from './booking-quote';
import type { TourPackage } from '../types/tour';

function adultChildOpts() {
  return [
    normalizeListingBookingOption(
      {
        id: 'opt-adult',
        name: 'Adult',
        priceUsd: 189,
        startTime: '20:00',
        duration: '5 hours',
        pickupPlace: 'Hotel pickup in the Rovaniemi city area',
        minPersons: 1,
        maxPersons: 8,
        maxSpotsPerSlot: 8,
        weekdays: [true, true, true, true, true, false, true],
      },
      'opt-adult'
    ),
    normalizeListingBookingOption(
      {
        id: 'opt-child',
        name: 'Child',
        priceUsd: 149,
        startTime: '20:00',
        duration: '5 hours',
        pickupPlace: 'Hotel pickup in the Rovaniemi city area',
        minPersons: 1,
        maxPersons: 12,
        maxSpotsPerSlot: 12,
        weekdays: [true, true, true, true, true, false, true],
      },
      'opt-child'
    ),
  ];
}

describe('legacy Adult/Child options → age-dependent option', () => {
  it('detects and coalesces Adult + Child ticket menus', () => {
    const opts = adultChildOpts();
    expect(isLegacyParticipantTicketMenu(opts)).toBe(true);
    const coalesced = coalesceLegacyParticipantTicketOptions(opts);
    expect(coalesced).toHaveLength(1);
    expect(coalesced[0].name).toBe('Hotel pickup');
    expect(coalesced[0].pricingMode).toBe('age_dependent');
    expect(coalesced[0].id).toBe('opt-adult');
    expect(coalesced[0].priceCategories?.map((c) => c.label)).toEqual(['Adult', 'Child']);
    expect(coalesced[0].priceCategories?.[0].priceUsd).toBe(189);
    expect(coalesced[0].priceCategories?.[1].priceUsd).toBe(149);
  });

  it('does not coalesce real product variants', () => {
    const opts = [
      normalizeListingBookingOption({ id: 'a', name: 'Hotel pickup', priceUsd: 189 }, 'a'),
      normalizeListingBookingOption({ id: 'b', name: 'Meeting point', priceUsd: 169 }, 'b'),
    ];
    expect(isLegacyParticipantTicketMenu(opts)).toBe(false);
    expect(coalesceLegacyParticipantTicketOptions(opts)).toHaveLength(2);
  });

  it('traveler variants expose one Hotel pickup option with age mix quote', () => {
    const tour = {
      id: 'tour-1',
      title: 'Guaranteed Northern Lights Tour',
      status: 'published',
      price: { startingFrom: 189, currency: 'EUR', perPerson: true },
      listingExtras: { bookingOptions: adultChildOpts() },
    } as TourPackage;

    const variants = getTourBookingVariants(tour);
    expect(variants).toHaveLength(1);
    expect(variants[0].label).toBe('Hotel pickup');
    expect(variants[0].listingOption?.pricingMode).toBe('age_dependent');

    const adultId = variants[0].listingOption!.priceCategories!.find((c) => c.kind === 'adult')!.id;
    const childId = variants[0].listingOption!.priceCategories!.find((c) => c.kind === 'child')!.id;
    const q = quoteBooking({
      tour,
      discounts: [],
      bookingDate: '2026-09-18',
      guests: 1,
      bookingOptionId: variants[0].id,
      participantMix: { [adultId]: 2, [childId]: 1 },
      todayIso: '2026-09-18',
    });
    expect(q.ok).toBe(true);
    if (q.ok) {
      expect(q.totalAmount).toBe(527);
      expect(q.optionLabel).toBe('Hotel pickup');
      expect(q.guestBreakdown).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Adult', quantity: 2, unitPrice: 189 }),
          expect.objectContaining({ label: 'Child', quantity: 1, unitPrice: 149 }),
        ])
      );
    }
  });
});
