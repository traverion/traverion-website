import { describe, expect, it } from 'vitest';
import {
  bulkActionSummary,
  enumerateIsoDates,
  patchOptionCutoff,
  patchScheduleOrOptionSpots,
} from './calendarAvailabilityUi';
import type { ListingBookingOption } from '../../types/listingExtras';

describe('calendarAvailabilityUi', () => {
  it('filters bulk dates by weekday', () => {
    // 2026-10-05 Mon … 2026-10-11 Sun
    const weekdaysOnly = enumerateIsoDates('2026-10-05', '2026-10-11', [
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(weekdaysOnly).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
    ]);
    const weekends = enumerateIsoDates('2026-10-05', '2026-10-11', [
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
    expect(weekends).toEqual(['2026-10-10', '2026-10-11']);
  });

  it('summarizes bulk actions', () => {
    expect(
      bulkActionSummary({ action: 'close', dateCount: 3, stay: false })
    ).toBe('Close bookings on 3 dates');
    expect(
      bulkActionSummary({ action: 'change_capacity', dateCount: 1, capacity: 12, stay: false })
    ).toBe('Set capacity 12 on 1 date');
  });

  it('patches option cutoff and schedule spots without touching siblings', () => {
    const options = [
      {
        id: 'a',
        name: 'Small Group',
        maxSpotsPerSlot: 16,
        bookingCutoffHoursBeforeStart: 2,
        schedules: [
          { id: 's1', name: 'Main', maxSpotsPerSlot: 16, status: 'ready' },
          { id: 's2', name: 'Other', maxSpotsPerSlot: 8, status: 'ready' },
        ],
      },
      {
        id: 'b',
        name: 'Bus',
        maxSpotsPerSlot: 50,
        schedules: [{ id: 's3', name: 'Bus', maxSpotsPerSlot: 50, status: 'ready' }],
      },
    ] as unknown as ListingBookingOption[];

    const cut = patchOptionCutoff(options, 'a', 24);
    expect(cut[0]?.bookingCutoffHoursBeforeStart).toBe(24);
    expect(cut[1]?.bookingCutoffHoursBeforeStart).toBeUndefined();

    const spots = patchScheduleOrOptionSpots(options, 'a', 's1', 12);
    expect(spots[0]?.schedules?.[0]?.maxSpotsPerSlot).toBe(12);
    expect(spots[0]?.schedules?.[1]?.maxSpotsPerSlot).toBe(8);
    expect(spots[1]?.schedules?.[0]?.maxSpotsPerSlot).toBe(50);
  });
});
