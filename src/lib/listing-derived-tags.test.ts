import { describe, expect, it } from 'vitest';
import { deriveListingTags } from './listing-derived-tags';
import type { ListingBookingOption } from '../types/listingExtras';

function option(partial: Partial<ListingBookingOption> = {}): ListingBookingOption {
  return {
    id: 'o1',
    name: 'Tour',
    duration: '3 hours',
    priceUsd: 100,
    maxPersons: 8,
    maxSpotsPerSlot: 8,
    minPersons: 1,
    startTime: '10:00',
    weekdays: [true, true, true, true, true, true, true],
    pickupPlace: '',
    optionInfo: '',
    travelerStartInstructions: '',
    chargeModel: 'per_person',
    fulfillment: 'meeting_point',
    ...partial,
  };
}

describe('deriveListingTags', () => {
  it('adds pickup when fulfillment is pickup', () => {
    expect(
      deriveListingTags({
        bookingOptions: [option({ fulfillment: 'pickup', pickupPlace: 'Hotel zone' })],
      })
    ).toContain('pickup-available');
  });

  it('adds small-group when all capacities are modest', () => {
    expect(deriveListingTags({ bookingOptions: [option({ maxPersons: 8, maxSpotsPerSlot: 8 })] })).toContain(
      'small-group'
    );
  });

  it('skips small-group when any capacity is large', () => {
    expect(
      deriveListingTags({ bookingOptions: [option({ maxPersons: 40, maxSpotsPerSlot: 40 })] })
    ).not.toContain('small-group');
  });

  it('adds free-cancellation from structured preset', () => {
    expect(deriveListingTags({ bookingOptions: [option()], cancellationPreset: 'free_24h' })).toContain(
      'free-cancellation'
    );
  });

  it('does not invent free-cancellation for non-refundable', () => {
    expect(
      deriveListingTags({ bookingOptions: [option()], cancellationPreset: 'non_refundable' })
    ).not.toContain('free-cancellation');
  });
});
