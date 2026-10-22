import { describe, expect, it } from 'vitest';
import {
  classifyDepartureStatus,
  filterDeparturesByStatus,
  formatWeekRangeLabel,
  groupDeparturesByDate,
  nextDaysRange,
  parseAvailabilityView,
  shiftWeekRange,
  weekRangeContaining,
} from './availabilityWorkspaceModel';

describe('availabilityWorkspaceModel', () => {
  it('defaults view to agenda', () => {
    expect(parseAvailabilityView(null)).toBe('agenda');
    expect(parseAvailabilityView('week')).toBe('week');
  });

  it('builds week and next-days ranges', () => {
    // 2026-10-15 is Thursday
    expect(weekRangeContaining('2026-10-15')).toEqual({
      from: '2026-10-12',
      to: '2026-10-18',
    });
    expect(nextDaysRange('2026-10-15', 7)).toEqual({
      from: '2026-10-15',
      to: '2026-10-21',
    });
    expect(shiftWeekRange('2026-10-12', 1)).toEqual({
      from: '2026-10-19',
      to: '2026-10-25',
    });
    expect(shiftWeekRange('2026-10-12', -1)).toEqual({
      from: '2026-10-05',
      to: '2026-10-11',
    });
    expect(formatWeekRangeLabel('2026-10-12', '2026-10-18')).toMatch(/12/);
    expect(formatWeekRangeLabel('2026-10-12', '2026-10-18')).toMatch(/18/);
  });

  it('classifies departure statuses without conflating limited and sold out', () => {
    expect(
      classifyDepartureStatus({
        dayCapacityOverride: 0,
        remaining: 10,
        capacity: 10,
        cutoffStillBookable: true,
      })
    ).toBe('closed');
    expect(
      classifyDepartureStatus({
        dayCapacityOverride: null,
        remaining: 0,
        capacity: 16,
        cutoffStillBookable: true,
      })
    ).toBe('sold_out');
    expect(
      classifyDepartureStatus({
        dayCapacityOverride: null,
        remaining: 3,
        capacity: 16,
        cutoffStillBookable: true,
      })
    ).toBe('limited');
    // Light occupancy must stay Available (not Limited).
    expect(
      classifyDepartureStatus({
        dayCapacityOverride: null,
        remaining: 15,
        capacity: 16,
        cutoffStillBookable: true,
      })
    ).toBe('available');
    expect(
      classifyDepartureStatus({
        dayCapacityOverride: null,
        remaining: 12,
        capacity: 16,
        cutoffStillBookable: true,
      })
    ).toBe('available');
    expect(
      classifyDepartureStatus({
        dayCapacityOverride: null,
        remaining: 16,
        capacity: 16,
        cutoffStillBookable: false,
      })
    ).toBe('cutoff');
  });

  it('groups and filters departure rows', () => {
    const base = {
      listingId: 'l1',
      listingTitle: 'Tour',
      optionId: 'o1',
      optionName: 'Opt',
      scheduleId: 's1',
      scheduleName: 'Sch',
      startTimeHm: '18:30',
      capacity: 10,
      remaining: 10,
      booked: 0,
      cutoffHours: 2,
      cutoffLabel: '2h',
      dayCapacityOverride: null as number | null,
    };
    const rows = [
      { ...base, key: 'a', iso: '2026-10-15', status: 'available' as const },
      { ...base, key: 'b', iso: '2026-10-15', status: 'sold_out' as const, remaining: 0 },
      { ...base, key: 'c', iso: '2026-10-16', status: 'available' as const },
    ];
    expect(groupDeparturesByDate(rows)).toHaveLength(2);
    expect(filterDeparturesByStatus(rows, 'sold_out')).toHaveLength(1);
  });
});
