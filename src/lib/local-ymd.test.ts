import { describe, expect, it } from 'vitest';
import { localYmd, localYmdPlusDays } from './local-ymd';
import { addCalendarDays, nightsOccupiedByStay } from './stayOccupancy';

describe('localYmd', () => {
  it('formats the operator local calendar day, not UTC', () => {
    // Fixed wall-clock components — independent of machine TZ offset for this assert style.
    const d = new Date(2026, 8, 19, 23, 30, 0); // 19 Sep 2026 local
    expect(localYmd(d)).toBe('2026-09-19');
    expect(localYmdPlusDays(1, d)).toBe('2026-09-20');
  });

  it('steps calendar days across EU DST spring-forward without skipping a listing date', () => {
    // 2026-03-29 is the EU spring-forward Sunday; local date math must still land on Mon 30.
    const sat = new Date(2026, 2, 28, 12, 0, 0);
    expect(localYmd(sat)).toBe('2026-03-28');
    expect(localYmdPlusDays(1, sat)).toBe('2026-03-29');
    expect(localYmdPlusDays(2, sat)).toBe('2026-03-30');
  });

  it('steps calendar days across EU DST fall-back without duplicating a listing date', () => {
    // 2026-10-25 is the EU fall-back Sunday.
    const sat = new Date(2026, 9, 24, 12, 0, 0);
    expect(localYmd(sat)).toBe('2026-10-24');
    expect(localYmdPlusDays(1, sat)).toBe('2026-10-25');
    expect(localYmdPlusDays(2, sat)).toBe('2026-10-26');
  });
});

describe('stay night boundaries', () => {
  it('occupies half-open nights across month and year boundaries', () => {
    expect(nightsOccupiedByStay('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
    ]);
    expect(nightsOccupiedByStay('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
    ]);
    expect(addCalendarDays('2026-03-29', 1)).toBe('2026-03-30');
  });
});
