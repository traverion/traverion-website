import { describe, expect, it } from 'vitest';
import { capacityBelowSoldWarning, scheduleSpotsBelowSoldWarning } from './capacity-reduction-warn';

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
