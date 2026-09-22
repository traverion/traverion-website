import { describe, expect, it } from 'vitest';
import { partnerDepartureRemainingLine, partnerTourMonthCellCapacityLabel } from './availability-ops';

describe('partnerDepartureRemainingLine', () => {
  it('shows per-departure remaining so morning fill does not mark evening full', () => {
    const morning = partnerDepartureRemainingLine({
      scheduleName: 'Morning',
      optionName: 'Standard',
      startTime: '08:00',
      maxSpotsPerSlot: 8,
      occupyingGuests: 8,
    });
    const evening = partnerDepartureRemainingLine({
      scheduleName: 'Evening',
      optionName: 'Standard',
      startTime: '20:00',
      maxSpotsPerSlot: 6,
      occupyingGuests: 2,
    });
    expect(morning.full).toBe(true);
    expect(morning.label).toContain('Full');
    expect(evening.full).toBe(false);
    expect(evening.remaining).toBe(4);
    expect(evening.label).toContain('20:00');
    expect(evening.label).toContain('4 of 6 left');
  });
});

describe('partnerTourMonthCellCapacityLabel', () => {
  it('does not mark multi-departure day Full when only morning is full', () => {
    const label = partnerTourMonthCellCapacityLabel({
      offered: true,
      dayCapacityOverride: null,
      defaultCapacity: 8,
      occupyingGuestsDay: 8,
      departures: [
        { startTimeHm: '08:00', maxSpots: 8, occupyingGuests: 8 },
        { startTimeHm: '20:00', maxSpots: 6, occupyingGuests: 0 },
      ],
    });
    expect(label.short).toBe('Partial');
    expect(label.tone).toBe('partial');
  });

  it('marks Full when every departure is full', () => {
    const label = partnerTourMonthCellCapacityLabel({
      offered: true,
      dayCapacityOverride: null,
      defaultCapacity: 8,
      occupyingGuestsDay: 14,
      departures: [
        { startTimeHm: '08:00', maxSpots: 8, occupyingGuests: 8 },
        { startTimeHm: '20:00', maxSpots: 6, occupyingGuests: 6 },
      ],
    });
    expect(label.short).toBe('Full');
  });
});
