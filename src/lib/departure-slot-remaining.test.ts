import { describe, expect, it } from 'vitest';
import {
  departureSlotSpotsLeft,
  maxSpotsLeftAcrossDepartures,
  partyMaxCappedByRemainingSpots,
} from './departure-slot-remaining';
import { tourPaidSlotKey } from '../data/supabase-availability';

describe('partyMaxCappedByRemainingSpots', () => {
  it('keeps option max when remaining is unknown', () => {
    expect(partyMaxCappedByRemainingSpots(12, null)).toBe(12);
    expect(partyMaxCappedByRemainingSpots(12, undefined)).toBe(12);
  });

  it('returns 0 when sold out — never restores full option max', () => {
    expect(partyMaxCappedByRemainingSpots(12, 0)).toBe(0);
    expect(partyMaxCappedByRemainingSpots(12, -1)).toBe(0);
  });

  it('caps guests to remaining seats', () => {
    expect(partyMaxCappedByRemainingSpots(12, 3)).toBe(3);
    expect(partyMaxCappedByRemainingSpots(2, 8)).toBe(2);
  });
});

describe('departureSlotSpotsLeft', () => {
  it('uses slot paid occupancy when no day cap override', () => {
    const day = '2026-10-01';
    const n = departureSlotSpotsLeft({
      dayIso: day,
      startTimeHm: '08:00',
      maxSpotsPerSlot: 8,
      maxPersonsFallback: 12,
      paidBySlot: { [tourPaidSlotKey(day, '08:00')]: 8 },
      paidByDay: { [day]: 8 },
      fallbackDayCap: 8,
    });
    expect(n).toBe(0);
  });

  it('keeps evening capacity independent of morning sell-out', () => {
    const day = '2026-10-01';
    const n = departureSlotSpotsLeft({
      dayIso: day,
      startTimeHm: '20:00',
      maxSpotsPerSlot: 6,
      maxPersonsFallback: 12,
      paidBySlot: {
        [tourPaidSlotKey(day, '08:00')]: 8,
        [tourPaidSlotKey(day, '20:00')]: 1,
      },
      paidByDay: { [day]: 9 },
      fallbackDayCap: 14,
    });
    expect(n).toBe(5);
  });

  it('day-cap override applies day budget with slot occupancy (Phase 1113)', () => {
    const day = '2026-10-01';
    const n = departureSlotSpotsLeft({
      dayIso: day,
      startTimeHm: '20:00',
      maxSpotsPerSlot: 6,
      maxPersonsFallback: 12,
      paidBySlot: { [tourPaidSlotKey(day, '20:00')]: 0 },
      paidByDay: { [day]: 3 },
      dayCapOverride: 4,
      fallbackDayCap: 14,
    });
    expect(n).toBe(1);
  });

  it('day override above slot max cannot oversell a full departure (Phase 1112/1113)', () => {
    const day = '2026-10-01';
    const n = departureSlotSpotsLeft({
      dayIso: day,
      startTimeHm: '08:00',
      maxSpotsPerSlot: 8,
      maxPersonsFallback: 12,
      paidBySlot: { [tourPaidSlotKey(day, '08:00')]: 8 },
      paidByDay: { [day]: 8 },
      dayCapOverride: 20,
      fallbackDayCap: 14,
    });
    expect(n).toBe(0);
  });

  it('Phase 1203: unknown maxSpotsPerSlot returns null (no invent from maxPersons)', () => {
    const day = '2026-10-01';
    expect(
      departureSlotSpotsLeft({
        dayIso: day,
        startTimeHm: '08:00',
        maxSpotsPerSlot: null,
        maxPersonsFallback: 12,
        paidBySlot: {},
        paidByDay: {},
        fallbackDayCap: 8,
      })
    ).toBeNull();
    expect(
      departureSlotSpotsLeft({
        dayIso: day,
        startTimeHm: '08:00',
        maxSpotsPerSlot: undefined,
        maxPersonsFallback: 12,
        paidBySlot: {},
        paidByDay: {},
        fallbackDayCap: null,
      })
    ).toBeNull();
  });
});

describe('maxSpotsLeftAcrossDepartures (Phase 1064 / 1123)', () => {
  it('does not treat a full morning as day sold-out when evening still has seats', () => {
    const day = '2026-10-01';
    expect(
      maxSpotsLeftAcrossDepartures({
        dayIso: day,
        departures: [
          { startTimeHm: '08:00', maxSpotsPerSlot: 8, maxPersonsFallback: 12 },
          { startTimeHm: '20:00', maxSpotsPerSlot: 8, maxPersonsFallback: 12 },
        ],
        paidBySlot: {
          [tourPaidSlotKey(day, '08:00')]: 8,
          [tourPaidSlotKey(day, '20:00')]: 2,
        },
        paidByDay: { [day]: 10 },
        fallbackDayCap: 16,
      })
    ).toBe(6);
  });

  it('uses each departure’s own maxSpots (Phase 1123)', () => {
    const day = '2026-10-01';
    // Morning cap 4 fully sold; evening cap 12 with 2 booked → 10 left (not 4-2).
    expect(
      maxSpotsLeftAcrossDepartures({
        dayIso: day,
        departures: [
          { startTimeHm: '08:00', maxSpotsPerSlot: 4, maxPersonsFallback: 12 },
          { startTimeHm: '20:00', maxSpotsPerSlot: 12, maxPersonsFallback: 12 },
        ],
        paidBySlot: {
          [tourPaidSlotKey(day, '08:00')]: 4,
          [tourPaidSlotKey(day, '20:00')]: 2,
        },
        paidByDay: { [day]: 6 },
        fallbackDayCap: 16,
      })
    ).toBe(10);
  });

  it('Phase 1203: skips departures with unknown slot cap (no invent-12)', () => {
    const day = '2026-10-01';
    expect(
      maxSpotsLeftAcrossDepartures({
        dayIso: day,
        departures: [
          { startTimeHm: '08:00', maxSpotsPerSlot: null, maxPersonsFallback: 12 },
          { startTimeHm: '20:00', maxSpotsPerSlot: 6, maxPersonsFallback: 12 },
        ],
        paidBySlot: { [tourPaidSlotKey(day, '20:00')]: 1 },
        paidByDay: { [day]: 1 },
        fallbackDayCap: null,
      })
    ).toBe(5);
    expect(
      maxSpotsLeftAcrossDepartures({
        dayIso: day,
        departures: [{ startTimeHm: '08:00', maxPersonsFallback: 12 }],
        paidBySlot: {},
        paidByDay: {},
        fallbackDayCap: 8,
      })
    ).toBeNull();
  });
});
