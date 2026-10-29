import { describe, expect, it } from 'vitest';
import type { ListingBookingOption } from '../types/listingExtras';
import { tourBookableSellingDeparturesOnDate } from './booking-quote';
import { maxSpotsLeftAcrossDepartures } from './departure-slot-remaining';
import { confirmedDepartureKey } from './last-minute-booking';
import { wallTimeInZoneToUtcMs } from './tour-departure-cutoff';
import { tourSoldOutDates } from './tour-calendar';

const ZONE = 'Europe/Helsinki';
const DAY = '2026-10-29';
/** ~21:21 Europe/Helsinki on 2026-10-29 (EEST, UTC+3). */
const NOW_MS = wallTimeInZoneToUtcMs(DAY, '21:21', ZONE)!;

function opt(over: Partial<ListingBookingOption> & Pick<ListingBookingOption, 'id' | 'startTime'>): ListingBookingOption {
  return {
    name: 'Adult',
    priceUsd: 99,
    duration: '2 hours',
    pickupPlace: '',
    minPersons: 1,
    maxPersons: 50,
    maxSpotsPerSlot: 50,
    optionInfo: '',
    weekdays: [true, true, true, true, true, true, true],
    availabilityDateFrom: '2020-01-01',
    availabilityDateTo: '',
    bookingCutoffHoursBeforeStart: 0,
    ...over,
  };
}

describe('tour day capacity at frozen 2026-10-29 21:21 Europe/Helsinki', () => {
  it('marks the day sold out when every departure is past start', () => {
    const options = [opt({ id: 'a', startTime: '09:00', maxSpotsPerSlot: 50 })];
    const bookable = tourBookableSellingDeparturesOnDate(options, DAY, {
      timeZone: ZONE,
      nowMs: NOW_MS,
      confirmedDepartureKeys: new Set(),
    });
    expect(bookable).toEqual([]);

    const sold = tourSoldOutDates({
      paidByDay: {},
      paidBySlot: {},
      capByDay: new Map([[DAY, 50]]),
      fallbackCapacity: 50,
      slotKey: (day, hm) => `${day}|${hm}`,
      extraDays: [DAY],
      departuresForDay: () =>
        bookable.map((d) => ({ startTimeHm: d.startTime, maxSpots: d.maxSpotsPerSlot })),
    });
    expect(sold.has(DAY)).toBe(true);
  });

  it('keeps the day open when a later departure is still eligible', () => {
    const options = [
      opt({ id: 'a', startTime: '09:00', maxSpotsPerSlot: 50 }),
      opt({ id: 'b', startTime: '22:00', maxSpotsPerSlot: 12 }),
    ];
    const bookable = tourBookableSellingDeparturesOnDate(options, DAY, {
      timeZone: ZONE,
      nowMs: NOW_MS,
      confirmedDepartureKeys: new Set(),
    });
    expect(bookable.map((d) => d.startTime)).toEqual(['22:00']);

    const sold = tourSoldOutDates({
      paidByDay: {},
      paidBySlot: {},
      capByDay: new Map([[DAY, 50]]),
      fallbackCapacity: 50,
      slotKey: (day, hm) => `${day}|${hm}`,
      extraDays: [DAY],
      departuresForDay: () =>
        bookable.map((d) => ({ startTimeHm: d.startTime, maxSpots: d.maxSpotsPerSlot })),
    });
    expect(sold.has(DAY)).toBe(false);

    const spots = maxSpotsLeftAcrossDepartures({
      dayIso: DAY,
      departures: bookable.map((d) => ({
        startTimeHm: d.startTime,
        maxSpotsPerSlot: d.maxSpotsPerSlot,
        maxPersonsFallback: 0,
      })),
      paidBySlot: {},
      paidByDay: {},
      dayCapOverride: 50,
      fallbackDayCap: 50,
    });
    // Eligible evening only — never raw morning 50.
    expect(spots).toBe(12);
  });

  it('late bookings enabled with confirmed booking keeps that departure only', () => {
    // 22:00 cutoff was 19:00 — past cutoff, still before start at 21:21.
    // Sibling 23:00 also past its 20:00 cutoff; only the confirmed slot reopens.
    const options = [
      opt({
        id: 'a',
        startTime: '22:00',
        bookingCutoffHoursBeforeStart: 3,
        lastMinuteBookings: true,
        lastMinuteUntil: 'departure',
        maxSpotsPerSlot: 20,
      }),
      opt({
        id: 'b',
        startTime: '23:00',
        bookingCutoffHoursBeforeStart: 3,
        maxSpotsPerSlot: 8,
      }),
    ];
    const confirmed = new Set([confirmedDepartureKey(DAY, '22:00', 'a')]);
    const bookable = tourBookableSellingDeparturesOnDate(options, DAY, {
      timeZone: ZONE,
      nowMs: NOW_MS,
      confirmedDepartureKeys: confirmed,
    });
    expect(bookable.map((d) => d.startTime)).toEqual(['22:00']);
  });

  it('late bookings disabled does not reopen a past-cutoff departure', () => {
    const options = [
      opt({
        id: 'a',
        startTime: '22:00',
        bookingCutoffHoursBeforeStart: 3,
        lastMinuteBookings: false,
        maxSpotsPerSlot: 20,
      }),
    ];
    const confirmed = new Set([confirmedDepartureKey(DAY, '22:00', 'a')]);
    const bookable = tourBookableSellingDeparturesOnDate(options, DAY, {
      timeZone: ZONE,
      nowMs: NOW_MS,
      confirmedDepartureKeys: confirmed,
    });
    expect(bookable).toEqual([]);
  });

  it('zero qualifying bookings yields zero remaining for empty bookable set', () => {
    const spots = maxSpotsLeftAcrossDepartures({
      dayIso: DAY,
      departures: [],
      paidBySlot: {},
      paidByDay: {},
      dayCapOverride: 50,
      fallbackDayCap: 50,
    });
    expect(spots).toBeNull();
  });

  it('aggregates capacity across multiple still-bookable departures', () => {
    const options = [
      opt({ id: 'a', startTime: '21:45', maxSpotsPerSlot: 5 }),
      opt({ id: 'b', startTime: '22:15', maxSpotsPerSlot: 9 }),
    ];
    const bookable = tourBookableSellingDeparturesOnDate(options, DAY, {
      timeZone: ZONE,
      nowMs: NOW_MS,
      confirmedDepartureKeys: new Set(),
    });
    expect(bookable).toHaveLength(2);
    const spots = maxSpotsLeftAcrossDepartures({
      dayIso: DAY,
      departures: bookable.map((d) => ({
        startTimeHm: d.startTime,
        maxSpotsPerSlot: d.maxSpotsPerSlot,
        maxPersonsFallback: 0,
      })),
      paidBySlot: {
        [`${DAY}|21:45`]: 2,
        [`${DAY}|22:15`]: 1,
      },
      paidByDay: { [DAY]: 3 },
      dayCapOverride: 50,
      fallbackDayCap: 50,
    });
    expect(spots).toBe(8); // max(5-2, 9-1)
  });

  it('never falls through to raw day capacity when bookable departures are empty', () => {
    const sold = tourSoldOutDates({
      paidByDay: {},
      paidBySlot: {},
      capByDay: new Map([[DAY, 50]]),
      fallbackCapacity: 50,
      slotKey: (day, hm) => `${day}|${hm}`,
      extraDays: [DAY],
      departuresForDay: () => [],
    });
    expect(sold.has(DAY)).toBe(true);
  });
});
