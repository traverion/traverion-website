import { describe, expect, it } from 'vitest';
import {
  bookedCapacityLabel,
  clearSlotOverridesForDates,
  findSlotOverride,
  parseSlotOverrides,
  removeSlotOverrideFields,
  resolveSlotCapacity,
  resolveSlotCutoffHours,
  upsertSlotOverride,
} from './listing-slot-overrides';

describe('listing-slot-overrides', () => {
  it('parses and upserts capacity/cutoff overrides', () => {
    const next = upsertSlotOverride([], {
      date: '2026-10-18',
      startTimeHm: '18:30',
      capacity: 25,
      cutoffHours: 12,
    });
    expect(next).toHaveLength(1);
    expect(findSlotOverride(next, '2026-10-18', '18:30')?.capacity).toBe(25);
    expect(resolveSlotCapacity({ scheduleCapacity: 16, override: next[0] })).toBe(25);
    expect(resolveSlotCutoffHours({ baselineCutoffHours: 2, override: next[0] })).toBe(12);
  });

  it('removes fields and clears dates', () => {
    let list = upsertSlotOverride([], {
      date: '2026-10-18',
      startTimeHm: '18:30',
      capacity: 25,
      cutoffHours: 12,
    });
    list = removeSlotOverrideFields(list, '2026-10-18', '18:30', { capacity: true });
    expect(findSlotOverride(list, '2026-10-18', '18:30')?.cutoffHours).toBe(12);
    expect(findSlotOverride(list, '2026-10-18', '18:30')?.capacity).toBeUndefined();
    list = clearSlotOverridesForDates(list, ['2026-10-18'], { all: true });
    expect(list).toHaveLength(0);
  });

  it('formats booked/capacity', () => {
    expect(bookedCapacityLabel(0, 16)).toBe('0/16');
    expect(bookedCapacityLabel(2, 16)).toBe('2/16');
    expect(bookedCapacityLabel(16, 16)).toBe('16/16');
  });

  it('rejects invalid parse rows', () => {
    expect(parseSlotOverrides([{ date: 'bad', startTimeHm: '18:30', capacity: 10 }])).toHaveLength(0);
    expect(parseSlotOverrides([{ date: '2026-10-18', startTimeHm: '18:30', capacity: 200 }])).toHaveLength(0);
  });
});
