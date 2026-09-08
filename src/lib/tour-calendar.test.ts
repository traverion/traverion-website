import { describe, expect, it } from 'vitest';
import type { ListingBookingOption } from '../types/listingExtras';
import { tourDayState } from './tour-calendar';

function option(weekdays: boolean[], from = '', to = ''): ListingBookingOption {
  return {
    id: 'opt',
    name: 'Adult',
    priceUsd: 189,
    startTime: '09:00',
    duration: '3 hours',
    pickupPlace: '',
    minPersons: 1,
    maxPersons: 8,
    maxSpotsPerSlot: 8,
    optionInfo: '',
    weekdays,
    availabilityDateFrom: from,
    availabilityDateTo: to,
  };
}

const WEEKDAYS = [true, true, true, true, true, false, false];

describe('tour calendar states', () => {
  it('marks past days', () => {
    expect(
      tourDayState({
        iso: '2026-09-01',
        todayIso: '2026-09-08',
        selected: '',
        options: [option(WEEKDAYS)],
      })
    ).toBe('past');
  });

  it('marks weekday-closed days', () => {
    expect(
      tourDayState({
        iso: '2026-09-12',
        todayIso: '2026-09-08',
        selected: '',
        options: [option(WEEKDAYS)],
      })
    ).toBe('closed');
  });

  it('marks operating weekdays available', () => {
    expect(
      tourDayState({
        iso: '2026-09-14',
        todayIso: '2026-09-08',
        selected: '',
        options: [option(WEEKDAYS)],
      })
    ).toBe('available');
  });

  it('marks the selected day', () => {
    expect(
      tourDayState({
        iso: '2026-09-14',
        todayIso: '2026-09-08',
        selected: '2026-09-14',
        options: [option(WEEKDAYS)],
      })
    ).toBe('selected');
  });

  it('respects a season window', () => {
    expect(
      tourDayState({
        iso: '2026-09-14',
        todayIso: '2026-09-08',
        selected: '',
        options: [option(WEEKDAYS, '2026-10-01', '')],
      })
    ).toBe('closed');
  });

  it('treats missing options as available (do not hide the listing)', () => {
    expect(
      tourDayState({
        iso: '2026-09-14',
        todayIso: '2026-09-08',
        selected: '',
        options: [],
      })
    ).toBe('available');
  });

  it('marks a day fully booked from paid occupancy, not failed checkouts', () => {
    expect(
      tourDayState({
        iso: '2026-09-14',
        todayIso: '2026-09-08',
        selected: '',
        options: [option(WEEKDAYS)],
        soldOut: true,
      })
    ).toBe('full');
    expect(
      tourDayState({
        iso: '2026-09-14',
        todayIso: '2026-09-08',
        selected: '',
        options: [option(WEEKDAYS)],
        soldOut: false,
      })
    ).toBe('available');
  });
});
