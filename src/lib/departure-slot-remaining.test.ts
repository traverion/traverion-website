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

  it('uses day-cap override for all departures when partner set a day limit', () => {
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
});

describe('maxSpotsLeftAcrossDepartures (Phase 1064)', () => {
  it('does not treat a full morning as day sold-out when evening still has seats', () => {
    const day = '2026-10-01';
    expect(
      maxSpotsLeftAcrossDepartures({
        dayIso: day,
        departureTimes: ['08:00', '20:00'],
        maxSpotsPerSlot: 8,
        maxPersonsFallback: 12,
        paidBySlot: {
          [tourPaidSlotKey(day, '08:00')]: 8,
          [tourPaidSlotKey(day, '20:00')]: 2,
        },
        paidByDay: { [day]: 10 },
        fallbackDayCap: 16,
      })
    ).toBe(6);
  });
});
