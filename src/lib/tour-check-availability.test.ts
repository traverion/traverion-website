import { describe, expect, it } from 'vitest';
import { tourPublicAvailabilityRemaining } from './tour-check-availability';

describe('tourPublicAvailabilityRemaining', () => {
  it('tightens day override with slot max and keeps slot occupancy (Phase 1112)', () => {
    const r = tourPublicAvailabilityRemaining({
      date: '2026-10-01',
      guests: 2,
      dayCapacityOverride: 12,
      paidGuestsDay: 11,
      fallbackDayCapacity: 8,
      startTimeHm: '20:00',
      slotMaxSpots: 6,
      paidGuestsSlot: 0,
    });
    expect(r.scope).toBe('departure');
    expect(r.available).toBe(true);
    expect(r.remaining).toBe(6);
  });

  it('day override above slot max cannot oversell the departure (Phase 1112)', () => {
    const r = tourPublicAvailabilityRemaining({
      date: '2026-10-01',
      guests: 1,
      dayCapacityOverride: 20,
      paidGuestsDay: 0,
      fallbackDayCapacity: 8,
      startTimeHm: '08:00',
      slotMaxSpots: 8,
      paidGuestsSlot: 8,
    });
    expect(r.scope).toBe('departure');
    expect(r.available).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it('uses slot paid when no day override and departure is selected', () => {
    const r = tourPublicAvailabilityRemaining({
      date: '2026-10-01',
      guests: 2,
      dayCapacityOverride: null,
      paidGuestsDay: 8,
      fallbackDayCapacity: 8,
      startTimeHm: '20:00',
      slotMaxSpots: 6,
      paidGuestsSlot: 1,
    });
    expect(r.scope).toBe('departure');
    expect(r.available).toBe(true);
    expect(r.remaining).toBe(5);
  });

  it('does not treat aggregated day paid as full evening when morning filled', () => {
    const r = tourPublicAvailabilityRemaining({
      date: '2026-10-01',
      guests: 1,
      dayCapacityOverride: null,
      paidGuestsDay: 8,
      fallbackDayCapacity: 8,
      startTimeHm: '20:00',
      slotMaxSpots: 6,
      paidGuestsSlot: 0,
    });
    expect(r.available).toBe(true);
  });
});
