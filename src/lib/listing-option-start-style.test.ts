import { describe, expect, it } from 'vitest';
import type { ListingBookingOption } from '../types/listingExtras';
import {
  deriveExperienceStartStyleFromOptions,
  optionsWithFulfillment,
} from './listing-option-start-style';

function opt(partial: Partial<ListingBookingOption> = {}): ListingBookingOption {
  return {
    id: 'opt-1',
    name: 'Tour',
    priceUsd: 100,
    startTime: '20:00',
    duration: '3 hours',
    pickupPlace: 'City center',
    minPersons: 1,
    maxPersons: 8,
    maxSpotsPerSlot: 8,
    optionInfo: 'Note',
    weekdays: [true, true, true, true, true, true, true],
    availabilityDateFrom: '',
    availabilityDateTo: '',
    ...partial,
  };
}

describe('deriveExperienceStartStyleFromOptions', () => {
  it('derives operator_pickup, fixed_meeting_place, either_available, or unspecified', () => {
    expect(deriveExperienceStartStyleFromOptions([opt({ fulfillment: 'pickup' })])).toBe(
      'operator_pickup'
    );
    expect(deriveExperienceStartStyleFromOptions([opt({ fulfillment: 'meeting_point' })])).toBe(
      'fixed_meeting_place'
    );
    expect(
      deriveExperienceStartStyleFromOptions([
        opt({ fulfillment: 'pickup' }),
        opt({ id: 'opt-2', fulfillment: 'meeting_point' }),
      ])
    ).toBe('either_available');
    expect(deriveExperienceStartStyleFromOptions([opt()])).toBe('unspecified');
  });
});

describe('optionsWithFulfillment', () => {
  it('keeps only options with an explicit fulfillment mode', () => {
    expect(
      optionsWithFulfillment([
        opt({ fulfillment: 'pickup' }),
        opt({ id: 'opt-2' }),
        opt({ id: 'opt-3', fulfillment: 'meeting_point' }),
      ]).map((o) => o.id)
    ).toEqual(['opt-1', 'opt-3']);
  });
});
