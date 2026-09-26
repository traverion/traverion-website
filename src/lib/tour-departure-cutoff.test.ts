import { describe, expect, it } from 'vitest';
import {
  assertDepartureStillBookable,
  bookingCutoffTravelerLabel,
  normalizeBookingCutoffHours,
  wallTimeInZoneToUtcMs,
} from './tour-departure-cutoff';

describe('normalizeBookingCutoffHours', () => {
  it('clamps non-positive and oversized values', () => {
    expect(normalizeBookingCutoffHours(undefined)).toBe(0);
    expect(normalizeBookingCutoffHours(-3)).toBe(0);
    expect(normalizeBookingCutoffHours(2.9)).toBe(2);
    expect(normalizeBookingCutoffHours(999)).toBe(168);
  });
});

describe('wallTimeInZoneToUtcMs (Europe/Helsinki)', () => {
  it('maps winter Helsinki wall time to UTC+2', () => {
    // 2026-01-15 18:00 EET = 16:00 UTC
    const ms = wallTimeInZoneToUtcMs('2026-01-15', '18:00');
    expect(ms).toBe(Date.UTC(2026, 0, 15, 16, 0, 0));
  });

  it('maps summer Helsinki wall time to UTC+3', () => {
    // 2026-07-15 20:30 EEST = 17:30 UTC
    const ms = wallTimeInZoneToUtcMs('2026-07-15', '20:30');
    expect(ms).toBe(Date.UTC(2026, 6, 15, 17, 30, 0));
  });
});

describe('assertDepartureStillBookable', () => {
  it('rejects after start even with zero cut-off hours', () => {
    const startMs = wallTimeInZoneToUtcMs('2026-09-27', '20:30')!;
    const res = assertDepartureStillBookable({
      bookingDate: '2026-09-27',
      startTimeHm: '20:30',
      cutoffHoursBeforeStart: 0,
      nowMs: startMs + 1,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('past_start');
  });

  it('rejects inside supplier cut-off window', () => {
    const startMs = wallTimeInZoneToUtcMs('2026-09-27', '20:30')!;
    const res = assertDepartureStillBookable({
      bookingDate: '2026-09-27',
      startTimeHm: '20:30',
      cutoffHoursBeforeStart: 2,
      nowMs: startMs - 90 * 60 * 1000,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('cutoff');
      expect(res.error).toMatch(/2 hours/i);
    }
  });

  it('allows booking before the cut-off', () => {
    const startMs = wallTimeInZoneToUtcMs('2026-09-27', '20:30')!;
    const res = assertDepartureStillBookable({
      bookingDate: '2026-09-27',
      startTimeHm: '20:30',
      cutoffHoursBeforeStart: 2,
      nowMs: startMs - 3 * 60 * 60 * 1000,
    });
    expect(res.ok).toBe(true);
  });
});

describe('bookingCutoffTravelerLabel', () => {
  it('omits zero and formats positive hours', () => {
    expect(bookingCutoffTravelerLabel(0)).toBeNull();
    expect(bookingCutoffTravelerLabel(1)).toMatch(/1 hour/);
    expect(bookingCutoffTravelerLabel(4)).toMatch(/4 hours/);
  });
});
