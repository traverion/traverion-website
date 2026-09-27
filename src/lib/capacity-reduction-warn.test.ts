import { describe, expect, it } from 'vitest';
import {
  capacityBelowSoldWarning,
  scheduleDepartureTimeMoveWarning,
  scheduleSpotsBelowSoldWarning,
} from './capacity-reduction-warn';

describe('capacityBelowSoldWarning', () => {
  it('warns when new cap is below occupying guests', () => {
    const msg = capacityBelowSoldWarning({ newCapacity: 4, occupyingGuests: 6, scopeLabel: 'this date' });
    expect(msg).toMatch(/6 guests/);
    expect(msg).toMatch(/will not cancel/);
    expect(capacityBelowSoldWarning({ newCapacity: 6, occupyingGuests: 6 })).toBeNull();
    expect(capacityBelowSoldWarning({ newCapacity: 8, occupyingGuests: 2 })).toBeNull();
  });
});

describe('scheduleSpotsBelowSoldWarning', () => {
  it('names the departure time in the warning', () => {
    const msg = scheduleSpotsBelowSoldWarning({
      newMaxSpots: 2,
      occupyingGuests: 5,
      startTimeHm: '08:00',
    });
    expect(msg).toMatch(/08:00/);
    expect(msg).toMatch(/5 guests/);
  });
});

describe('scheduleDepartureTimeMoveWarning', () => {
  it('warns when sold guests remain on the previous departure (Phase 1077)', () => {
    const msg = scheduleDepartureTimeMoveWarning({
      previousStartTimeHm: '08:00',
      nextStartTimeHm: '09:30',
      occupyingGuestsOnPrevious: 4,
    });
    expect(msg).toMatch(/08:00/);
    expect(msg).toMatch(/09:30/);
    expect(msg).toMatch(/4 guests/);
    expect(msg).toMatch(/will not move/);
  });

  it('is silent when time unchanged or no occupancy', () => {
    expect(
      scheduleDepartureTimeMoveWarning({
        previousStartTimeHm: '08:00',
        nextStartTimeHm: '08:00',
        occupyingGuestsOnPrevious: 4,
      })
    ).toBeNull();
    expect(
      scheduleDepartureTimeMoveWarning({
        previousStartTimeHm: '08:00',
        nextStartTimeHm: '09:00',
        occupyingGuestsOnPrevious: 0,
      })
    ).toBeNull();
  });
});
