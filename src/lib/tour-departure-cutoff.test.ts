import { describe, expect, it } from 'vitest';
import {
  assertDepartureStillBookable,
  bookingCutoffTravelerLabel,
  normalizeBookingCutoffHours,
  resolveDepartureTimezone,
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

describe('resolveDepartureTimezone', () => {
  it('defaults empty / invalid to Europe/Helsinki', () => {
    expect(resolveDepartureTimezone(undefined)).toBe('Europe/Helsinki');
    expect(resolveDepartureTimezone('')).toBe('Europe/Helsinki');
    expect(resolveDepartureTimezone('Not/AZone')).toBe('Europe/Helsinki');
  });

  it('accepts a valid IANA zone', () => {
    expect(resolveDepartureTimezone('America/New_York')).toBe('America/New_York');
    expect(resolveDepartureTimezone('Europe/Helsinki')).toBe('Europe/Helsinki');
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

  it('keeps the same wall clock when zone is America/New_York (EST)', () => {
    // 2026-01-15 20:00 EST = 01:00 UTC next day
    const ms = wallTimeInZoneToUtcMs('2026-01-15', '20:00', 'America/New_York');
    expect(ms).toBe(Date.UTC(2026, 0, 16, 1, 0, 0));
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

  it('uses listing timezone for cutoff math', () => {
    const startMs = wallTimeInZoneToUtcMs('2026-01-15', '20:00', 'America/New_York')!;
    const open = assertDepartureStillBookable({
      bookingDate: '2026-01-15',
      startTimeHm: '20:00',
      cutoffHoursBeforeStart: 0,
      nowMs: startMs - 60_000,
      timeZone: 'America/New_York',
    });
    expect(open.ok).toBe(true);
    const closed = assertDepartureStillBookable({
      bookingDate: '2026-01-15',
      startTimeHm: '20:00',
      cutoffHoursBeforeStart: 0,
      nowMs: startMs + 1,
      timeZone: 'America/New_York',
    });
    expect(closed.ok).toBe(false);
  });
});

describe('bookingCutoffTravelerLabel', () => {
  it('omits zero and formats positive hours', () => {
    expect(bookingCutoffTravelerLabel(0)).toBeNull();
    expect(bookingCutoffTravelerLabel(1)).toMatch(/1 hour/);
    expect(bookingCutoffTravelerLabel(4)).toMatch(/4 hours/);
  });
});
