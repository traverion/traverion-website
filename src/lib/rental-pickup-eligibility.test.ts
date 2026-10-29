import { describe, expect, it } from 'vitest';
import {
  buildRentalInterval,
  rentalDayTimeOptions,
  rentalPickupDayExhausted,
  todayLocalYmd,
  weekdayOfYmd,
} from './rental-booking-interval';
import { defaultRentalOperatingDays } from './rental-details';
import { wallTimeInZoneToUtcMs } from './tour-departure-cutoff';

const ZONE = 'Europe/Helsinki';
const DAY = '2026-06-15'; // Monday

describe('rental pickup eligibility', () => {
  const operatingDays = defaultRentalOperatingDays().map((day) => ({
    ...day,
    open: true,
    earliestPickupHm: '09:00',
    latestPickupHm: '17:00',
    earliestReturnHm: '09:00',
    latestReturnHm: '18:00',
  }));

  it('uses listing timezone for interval instants (not browser local)', () => {
    const interval = buildRentalInterval({
      startDate: DAY,
      endDate: DAY,
      pickupHm: '10:00',
      returnHm: '14:00',
      durationUnit: 'hour',
      timeZone: ZONE,
    });
    expect(interval.ok).toBe(true);
    if (!interval.ok) return;
    expect(Date.parse(interval.pickupAt)).toBe(wallTimeInZoneToUtcMs(DAY, '10:00', ZONE));
  });

  it('drops past and notice-window pickup times for today', () => {
    const noon = wallTimeInZoneToUtcMs(DAY, '12:00', ZONE)!;
    const times = rentalDayTimeOptions({
      operatingDays,
      ymd: DAY,
      kind: 'pickup',
      timeZone: ZONE,
      bookingNoticeHours: 2,
      nowMs: noon,
    });
    expect(times).not.toContain('09:00');
    expect(times).not.toContain('12:00');
    expect(times).not.toContain('13:30'); // inside 2h notice
    expect(times).toContain('14:00');
    expect(times).toContain('17:00');
  });

  it('marks today exhausted when every pickup is past notice', () => {
    const late = wallTimeInZoneToUtcMs(DAY, '16:30', ZONE)!;
    expect(
      rentalPickupDayExhausted({
        operatingDays,
        ymd: DAY,
        timeZone: ZONE,
        bookingNoticeHours: 2,
        nowMs: late,
      })
    ).toBe(true);
  });

  it('resolves weekday from civil YMD via UTC noon', () => {
    expect(weekdayOfYmd('2026-06-15')).toBe('mon');
    expect(todayLocalYmd(wallTimeInZoneToUtcMs(DAY, '23:30', ZONE)!, ZONE)).toBe(DAY);
  });
});
