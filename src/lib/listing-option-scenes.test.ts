import { describe, expect, it } from 'vitest';
import type { ListingBookingOption } from '../types/listingExtras';
import {
  TOUR_OPTION_SCENES,
  duplicateBookingOption,
  readyBookingOptions,
  tourOptionContextNavItems,
  tourOptionReadiness,
  upsertBookingOption,
} from './listing-option-scenes';

function option(partial: Partial<ListingBookingOption> = {}): ListingBookingOption {
  return {
    id: 'opt-1',
    name: '',
    priceUsd: 0,
    startTime: '',
    duration: '',
    pickupPlace: '',
    minPersons: 1,
    maxPersons: 8,
    maxSpotsPerSlot: 8,
    optionInfo: '',
    weekdays: [true, true, true, true, true, true, true],
    availabilityDateFrom: '',
    availabilityDateTo: '',
    ...partial,
  };
}

describe('tour option scenes', () => {
  it('uses the real option groups plus a review checkpoint', () => {
    expect(TOUR_OPTION_SCENES.map((s) => s.id)).toEqual([
      'setup',
      'meeting',
      'pricing',
      'schedule',
      'review',
    ]);
  });

  it('marks passed context-rail scenes complete without inventing data status', () => {
    expect(tourOptionContextNavItems(2).map((item) => item.state)).toEqual([
      'complete',
      'complete',
      'current',
      'upcoming',
      'upcoming',
    ]);
  });
});

describe('option readiness', () => {
  it('treats an empty option as a draft that is not bookable', () => {
    expect(tourOptionReadiness(option(), ['Add an option name'])).toBe('draft');
    expect(
      readyBookingOptions([option({ name: '' })], () => ['Add an option name']).length
    ).toBe(0);
  });

  it('marks a filled but invalid option incomplete', () => {
    expect(
      tourOptionReadiness(option({ name: 'Hotel pickup', pickupPlace: 'Rovaniemi hotels' }), [
        'Set a price',
      ])
    ).toBe('incomplete');
  });

  it('marks a valid option ready', () => {
    expect(
      tourOptionReadiness(
        option({
          name: 'Hotel pickup',
          duration: '6 hours',
          pickupPlace: 'Rovaniemi city hotels',
          optionInfo: 'Pickup included',
          priceUsd: 149,
        }),
        []
      )
    ).toBe('ready');
  });

  it('does not count draft or incomplete options as bookable', () => {
    const draft = option({ id: 'draft' });
    const incomplete = option({
      id: 'incomplete',
      name: 'Hotel pickup',
      pickupPlace: 'Rovaniemi hotels',
    });
    const ready = option({
      id: 'ready',
      name: 'Private group',
      duration: '6 hours',
      pickupPlace: 'Rovaniemi city hotels',
      optionInfo: 'Private vehicle',
      priceUsd: 790,
    });
    expect(
      readyBookingOptions([draft, incomplete, ready], (item) =>
        item.id === ready.id ? [] : ['Needs work']
      ).map((item) => item.id)
    ).toEqual([ready.id]);
  });
});

describe('option identity', () => {
  it('retries upsert the same option instead of inserting another', () => {
    const first = option({ id: 'opt-canonical', name: 'Hotel pickup' });
    const retry = option({ id: 'opt-canonical', name: 'Hotel pickup · 20:00' });
    const afterRetry = upsertBookingOption(upsertBookingOption([], first), retry);
    expect(afterRetry).toHaveLength(1);
    expect(afterRetry[0]?.name).toBe('Hotel pickup · 20:00');
  });

  it('duplicates with a new id so the original option stays intact', () => {
    const original = option({ id: 'opt-1', name: 'Hotel pickup' });
    const copy = duplicateBookingOption(original, 'opt-2');
    expect(copy.id).toBe('opt-2');
    expect(copy.name).toBe('Hotel pickup (copy)');
    expect(original.id).toBe('opt-1');
    expect(original.name).toBe('Hotel pickup');
  });
});
