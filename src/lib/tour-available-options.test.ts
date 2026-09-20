import { describe, expect, it } from 'vitest';
import type { ListingBookingOption } from '../types/listingExtras';
import type { TourBookingVariant } from './booking-flow';
import {
  formatTourAvailabilityHeading,
  optionMetaParts,
  optionsOnDate,
  variantRunsOnDate,
} from './tour-available-options';

function option(partial: Partial<ListingBookingOption> & Pick<ListingBookingOption, 'id' | 'name'>): ListingBookingOption {
  return {
    priceUsd: 100,
    startTime: '09:00',
    duration: '3 hours',
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

function variant(
  id: string,
  listingOption: ListingBookingOption | null,
  label = id
): TourBookingVariant {
  return { id, label, subtitle: '', pricePerPerson: 100, listingOption };
}

describe('optionsOnDate', () => {
  it('treats a listing without options as available any valid date', () => {
    const row = variant('__default__', null, 'Standard tour');
    const result = optionsOnDate([row], '2026-09-26');
    expect(result.kind).toBe('one');
    expect(result.available).toEqual([row]);
    expect(variantRunsOnDate(row, '2026-09-26')).toBe(true);
  });

  it('splits weekday-limited options and reports none / one / many', () => {
    const weekday = option({
      id: 'wd',
      name: 'Weekday',
      weekdays: [true, true, true, true, true, false, false],
    });
    const weekend = option({
      id: 'we',
      name: 'Weekend',
      weekdays: [false, false, false, false, false, true, true],
    });
    const a = variant('wd', weekday, 'Weekday');
    const b = variant('we', weekend, 'Weekend');
    const saturday = optionsOnDate([a, b], '2026-09-26');
    expect(saturday.kind).toBe('one');
    expect(saturday.available.map((v) => v.id)).toEqual(['we']);
    const monday = optionsOnDate([a, b], '2026-09-21');
    expect(monday.kind).toBe('one');
    expect(monday.available.map((v) => v.id)).toEqual(['wd']);
    const both = optionsOnDate(
      [
        variant('a', option({ id: 'a', name: 'A' })),
        variant('b', option({ id: 'b', name: 'B' })),
      ],
      '2026-09-21'
    );
    expect(both.kind).toBe('many');
    expect(optionsOnDate([a, b], '').kind).toBe('none');
  });

  it('formats a dedicated availability heading from ISO dates', () => {
    expect(formatTourAvailabilityHeading('2026-09-26')).toMatch(/Saturday/);
    expect(formatTourAvailabilityHeading('2026-09-26')).toMatch(/26/);
    expect(formatTourAvailabilityHeading('2026-09-26')).toMatch(/September/);
  });

  it('lists only real option facts in the meta line', () => {
    const v = variant(
      'p',
      option({
        id: 'p',
        name: 'Private transfer',
        startTime: '10:30',
        duration: '45 min',
        pickupPlace: 'Hotel',
        isPrivate: true,
        minPersons: 1,
        maxPersons: 4,
      }),
      'Private transfer'
    );
    expect(optionMetaParts(v)).toEqual([
      'Starts 10:30',
      '45 min',
      'Private · your group only',
      '1–4 guests',
      'Hotel',
    ]);
  });
});
