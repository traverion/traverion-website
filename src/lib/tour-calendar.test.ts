import { describe, expect, it } from 'vitest';
import type { ListingBookingOption } from '../types/listingExtras';
import { tourDayState, publicTourPaidGuestsByDeparture, bookingCountsTowardPublicTourSoldOut, tourSoldOutDates } from './tour-calendar';

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

  it('does not sell out a departure with refunded, failed, or cancelled guests', () => {
    const paidByDay = publicTourPaidGuestsByDeparture([
      { status: 'confirmed', payment_status: 'paid', booking_date: '2026-09-11', guests: 1 },
      { status: 'confirmed', payment_status: 'refunded', booking_date: '2026-10-15', guests: 8 },
      { status: 'pending', payment_status: 'failed', booking_date: '2026-10-15', guests: 8 },
      { status: 'cancelled', payment_status: 'paid', booking_date: '2026-11-04', guests: 1 },
    ]);
    expect(paidByDay).toEqual({ '2026-09-11': 1 });
    expect(bookingCountsTowardPublicTourSoldOut({ status: 'confirmed', payment_status: 'refunded' })).toBe(
      false
    );
    const sold = tourSoldOutDates({
      paidByDay,
      capByDay: new Map([['2026-10-15', 8]]),
      fallbackCapacity: 8,
    });
    expect(sold.has('2026-10-15')).toBe(false);
    expect(sold.has('2026-09-11')).toBe(false);
    expect(
      tourSoldOutDates({
        paidByDay: { '2026-10-15': 8 },
        capByDay: new Map([['2026-10-15', 8]]),
        fallbackCapacity: 8,
      }).has('2026-10-15')
    ).toBe(true);
  });
});
