import { describe, expect, it } from 'vitest';
import {
  parseExperienceDurationMinutes,
  reviewUnlockMsForTour,
} from './review-experience-end';
import { wallTimeInZoneToUtcMs } from './tour-departure-cutoff';

describe('parseExperienceDurationMinutes', () => {
  it('parses hour and minute phrases', () => {
    expect(parseExperienceDurationMinutes('5 hours')).toBe(300);
    expect(parseExperienceDurationMinutes('90 minutes')).toBe(90);
    expect(parseExperienceDurationMinutes('1.5 hours')).toBe(90);
    expect(parseExperienceDurationMinutes('2h 30m')).toBe(150);
  });

  it('returns null when duration cannot be parsed', () => {
    expect(parseExperienceDurationMinutes('')).toBeNull();
    expect(parseExperienceDurationMinutes('half day')).toBeNull();
  });
});

describe('reviewUnlockMsForTour', () => {
  it('unlocks at departure + duration (overnight)', () => {
    const start = wallTimeInZoneToUtcMs('2026-09-01', '20:00', 'Europe/Helsinki')!;
    const unlock = reviewUnlockMsForTour({
      bookingDate: '2026-09-01',
      startTimeHm: '20:00',
      timeZone: 'Europe/Helsinki',
      durationMinutes: 300,
    });
    expect(unlock).toBe(start + 300 * 60_000);
    // 20:00 + 5h = 01:00 next local day.
    expect(unlock).toBe(wallTimeInZoneToUtcMs('2026-09-02', '01:00', 'Europe/Helsinki'));
  });

  it('falls back to start when duration is missing (does not invent)', () => {
    const start = wallTimeInZoneToUtcMs('2026-09-01', '20:00', 'Europe/Helsinki')!;
    expect(
      reviewUnlockMsForTour({
        bookingDate: '2026-09-01',
        startTimeHm: '20:00',
        timeZone: 'Europe/Helsinki',
        durationMinutes: null,
      })
    ).toBe(start);
  });
});
