import { describe, expect, it } from 'vitest';
import { tourDepartureRemainingSeats } from './tour-departure-remaining';

describe('tourDepartureRemainingSeats (Phase 1113)', () => {
  it('uses slot remaining when no day override', () => {
    expect(
      tourDepartureRemainingSeats({ slotMaxSpots: 8, paidGuestsSlot: 3 })
    ).toBe(5);
  });

  it('takes the tighter of slot and day remaining', () => {
    expect(
      tourDepartureRemainingSeats({
        slotMaxSpots: 8,
        paidGuestsSlot: 0,
        dayCapacityOverride: 10,
        paidGuestsDay: 9,
      })
    ).toBe(1);
    expect(
      tourDepartureRemainingSeats({
        slotMaxSpots: 8,
        paidGuestsSlot: 7,
        dayCapacityOverride: 20,
        paidGuestsDay: 7,
      })
    ).toBe(1);
  });

  it('day cap above slot max still cannot oversell the slot', () => {
    expect(
      tourDepartureRemainingSeats({
        slotMaxSpots: 8,
        paidGuestsSlot: 8,
        dayCapacityOverride: 20,
        paidGuestsDay: 8,
      })
    ).toBe(0);
  });
});
