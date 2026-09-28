import { describe, expect, it } from 'vitest';
import {
  assertDepartureStillBookable,
  bookingCutoffTravelerLabel,
  normalizeBookingCutoffHours,
  resolveDepartureTimezone,
  wallHourInTimeZone,
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

  it('Phase 1481: rejects spring-forward gap times that collapse to an earlier hour (Europe/Helsinki)', () => {
    // 2026-03-29 EU clocks skip 03:00–03:59; naive offset math mapped 03:00 → same instant as 02:00.
    expect(wallTimeInZoneToUtcMs('2026-03-29', '03:00', 'Europe/Helsinki')).toBeNull();
    expect(wallTimeInZoneToUtcMs('2026-03-29', '03:30', 'Europe/Helsinki')).toBeNull();
    expect(wallTimeInZoneToUtcMs('2026-03-29', '02:00', 'Europe/Helsinki')).not.toBeNull();
    expect(wallTimeInZoneToUtcMs('2026-03-29', '04:00', 'Europe/Helsinki')).not.toBeNull();
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

  it('Phase 1481: bad_time when departure wall clock does not exist (spring-forward gap)', () => {
    const res = assertDepartureStillBookable({
      bookingDate: '2026-03-29',
      startTimeHm: '03:00',
      cutoffHoursBeforeStart: 0,
      nowMs: Date.parse('2026-03-28T12:00:00.000Z'),
      timeZone: 'Europe/Helsinki',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('bad_time');
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

describe('wallHourInTimeZone (Phase 1322)', () => {
  it('returns 0–23 for Helsinki including midnight', () => {
    // 2026-01-15 22:00 UTC = 2026-01-16 00:00 Helsinki
    expect(wallHourInTimeZone(Date.parse('2026-01-15T22:00:00.000Z'), 'Europe/Helsinki')).toBe(0);
    // 2026-01-15 12:30 UTC = 2026-01-15 14:30 Helsinki
    expect(wallHourInTimeZone(Date.parse('2026-01-15T12:30:00.000Z'), 'Europe/Helsinki')).toBe(14);
  });
});
