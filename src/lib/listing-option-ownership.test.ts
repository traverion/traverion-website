import { describe, expect, it } from 'vitest';
import { headlineDurationFromBookingOptions, listingDurationForPersist } from './listing-option-ownership';
import type { ListingBookingOption } from '../types/listingExtras';

function opt(duration: string): ListingBookingOption {
  return {
    id: 'x',
    name: 'Standard',
    priceUsd: 10,
    startTime: '',
    duration,
    pickupPlace: 'Meeting at the harbour office desk',
    minPersons: 1,
    maxPersons: 8,
    maxSpotsPerSlot: 8,
    optionInfo: 'Shared',
    weekdays: [true, true, true, true, true, true, true],
    availabilityDateFrom: '',
    availabilityDateTo: '',
  };
}

describe('listing vs option duration ownership', () => {
  it('uses option duration as the listing headline when options exist', () => {
    expect(headlineDurationFromBookingOptions([opt('6 hours')], '3 hours')).toBe('6 hours');
    expect(headlineDurationFromBookingOptions([opt('6 hours'), opt('6 Hours')], '')).toBe('6 hours');
  });

  it('keeps an existing listing duration when no option durations exist yet', () => {
    expect(headlineDurationFromBookingOptions([], '3 hours')).toBe('3 hours');
    expect(listingDurationForPersist({
      inventoryFamily: 'tour',
      listingDuration: '3 hours',
      bookingOptions: [],
    })).toBe('3 hours');
  });

  it('does not invent a stay duration from tour options', () => {
    expect(
      listingDurationForPersist({
        inventoryFamily: 'stay',
        listingDuration: 'Per night',
        bookingOptions: [opt('6 hours')],
      })
    ).toBe('Per night');
  });
});
