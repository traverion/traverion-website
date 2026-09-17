import { describe, expect, it } from 'vitest';
import { quoteBooking } from './booking-quote';
import { normalizeListingBookingOption } from '../types/listingExtras';
import { defaultAgeDependentCategories } from './price-categories';

describe('quoteBooking age-dependent mix', () => {
  const option = normalizeListingBookingOption(
    {
      id: 'nl-pickup',
      name: 'Hotel pickup · 20:00',
      pricingMode: 'age_dependent',
      priceCategories: defaultAgeDependentCategories(189, 149),
      priceUsd: 189,
      startTime: '20:00',
      duration: '5 hours',
      pickupPlace: 'Rovaniemi hotel zone',
      minPersons: 1,
      maxPersons: 8,
      maxSpotsPerSlot: 8,
      optionInfo: 'Includes hotel pickup',
      weekdays: [true, true, true, true, true, true, true],
    },
    'nl-pickup'
  );

  const tour = {
    status: 'published' as const,
    price: { startingFrom: 189, currency: 'EUR' },
    listingExtras: { bookingOptions: [option], inventoryFamily: 'tour' as const },
  };

  it('totals 2 adults + 1 child correctly', () => {
    const adultId = option.priceCategories![0].id;
    const childId = option.priceCategories![1].id;
    const q = quoteBooking({
      tour,
      discounts: [],
      bookingDate: '2099-01-15',
      guests: 1,
      bookingOptionId: option.id,
      participantMix: { [adultId]: 2, [childId]: 1 },
      todayIso: '2099-01-01',
    });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.guests).toBe(3);
    expect(q.totalAmount).toBe(189 * 2 + 149);
    expect(q.guestBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Adult', quantity: 2, unitPrice: 189 }),
        expect.objectContaining({ label: 'Child', quantity: 1, unitPrice: 149 }),
      ])
    );
  });

  it('rejects child without adult when requiresAdult', () => {
    const childId = option.priceCategories![1].id;
    const q = quoteBooking({
      tour,
      discounts: [],
      bookingDate: '2099-01-15',
      guests: 1,
      bookingOptionId: option.id,
      participantMix: { [childId]: 1 },
      todayIso: '2099-01-01',
    });
    expect(q.ok).toBe(false);
    if (q.ok) return;
    expect(q.error).toMatch(/adult/i);
  });
});
