import { describe, expect, it } from 'vitest';
import { defaultRentalOperatingDays } from './rental-details';
import {
  addDaysYmd,
  buildRentalInterval,
  calendarDaysBetween,
  normalizeHm,
  rentalDayClosed,
  rentalDayTimeOptions,
  rentalScheduleIssue,
} from './rental-booking-interval';

describe('rental-booking-interval', () => {
  it('normalizes HH:MM', () => {
    expect(normalizeHm('9:05')).toBe('09:05');
    expect(normalizeHm('bad', '10:00')).toBe('10:00');
  });

  it('builds daily intervals with duration in calendar days', () => {
    const r = buildRentalInterval({
      startDate: '2030-06-01',
      endDate: '2030-06-03',
      pickupHm: '10:00',
      returnHm: '18:00',
      durationUnit: 'day',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.durationUnit).toBe('day');
    expect(r.durationCount).toBe(2);
    expect(calendarDaysBetween('2030-06-01', '2030-06-03')).toBe(2);
  });

  it('bills overnight pickup→return as one calendar day (e.g. Oct 29 09:00 → Oct 30 18:00)', () => {
    const r = buildRentalInterval({
      startDate: '2026-10-29',
      endDate: '2026-10-30',
      pickupHm: '09:00',
      returnHm: '18:00',
      durationUnit: 'day',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.durationCount).toBe(1);
    expect(calendarDaysBetween('2026-10-29', '2026-10-30')).toBe(1);
  });

  it('builds hourly intervals rounding up', () => {
    const r = buildRentalInterval({
      startDate: '2030-06-01',
      endDate: '2030-06-01',
      pickupHm: '10:00',
      returnHm: '12:30',
      durationUnit: 'hour',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.durationCount).toBe(3);
  });

  it('rejects return before pickup', () => {
    const r = buildRentalInterval({
      startDate: '2030-06-02',
      endDate: '2030-06-01',
      pickupHm: '10:00',
      returnHm: '18:00',
      durationUnit: 'day',
    });
    expect(r.ok).toBe(false);
  });

  it('addDaysYmd advances calendar', () => {
    expect(addDaysYmd('2030-01-31', 1)).toBe('2030-02-01');
  });

  it('rejects a closed day and a pickup before opening', () => {
    const operatingDays = defaultRentalOperatingDays().map((day) => ({
      ...day,
      open: day.day !== 'sun',
    }));
    expect(
      rentalScheduleIssue({
        operatingDays,
        startDate: '2030-06-02',
        endDate: '2030-06-02',
        pickupHm: '10:00',
        returnHm: '16:00',
      })
    ).toMatch(/opening days/i);
    expect(
      rentalScheduleIssue({
        operatingDays,
        startDate: '2030-06-03',
        endDate: '2030-06-03',
        pickupHm: '08:00',
        returnHm: '16:00',
      })
    ).toMatch(/between 09:00 and 17:00/i);
  });

  it('enumerates pickup times in 30-minute steps within the window', () => {
    const operatingDays = defaultRentalOperatingDays().map((day) => ({ ...day, open: true }));
    // 2030-06-03 is Monday
    const opts = rentalDayTimeOptions({
      operatingDays,
      ymd: '2030-06-03',
      kind: 'pickup',
      stepMinutes: 30,
    });
    expect(opts[0]).toBe('09:00');
    expect(opts).toContain('09:30');
    expect(opts[opts.length - 1]).toBe('17:00');
    expect(opts.every((hm) => /^\d{2}:\d{2}$/.test(hm))).toBe(true);
  });

  it('returns no times on a closed day and marks the day closed', () => {
    const operatingDays = defaultRentalOperatingDays().map((day) => ({
      ...day,
      open: day.day !== 'sun',
    }));
    // 2030-06-02 is Sunday
    expect(rentalDayClosed(operatingDays, '2030-06-02')).toBe(true);
    expect(
      rentalDayTimeOptions({
        operatingDays,
        ymd: '2030-06-02',
        kind: 'pickup',
      })
    ).toEqual([]);
    expect(rentalDayClosed([], '2030-06-02')).toBe(false);
  });

  it('filters same-day return times after pickup', () => {
    const operatingDays = defaultRentalOperatingDays().map((day) => ({ ...day, open: true }));
    const opts = rentalDayTimeOptions({
      operatingDays,
      ymd: '2030-06-03',
      kind: 'return',
      afterHmExclusive: '12:00',
    });
    expect(opts[0]).toBe('12:30');
    expect(opts.every((hm) => hm > '12:00')).toBe(true);
  });

  it('requires booking notice before pickup', () => {
    const operatingDays = defaultRentalOperatingDays().map((day) => ({
      ...day,
      open: day.day !== 'sun',
    }));
    const pickup = buildRentalInterval({
      startDate: '2030-06-03',
      endDate: '2030-06-03',
      pickupHm: '10:00',
      returnHm: '16:00',
      durationUnit: 'day',
    });
    expect(pickup.ok).toBe(true);
    if (!pickup.ok) return;
    expect(
      rentalScheduleIssue({
        operatingDays,
        bookingNoticeHours: 24,
        startDate: '2030-06-03',
        endDate: '2030-06-03',
        pickupHm: '10:00',
        returnHm: '16:00',
        pickupAtIso: pickup.pickupAt,
        nowMs: Date.parse(pickup.pickupAt) - 60 * 60 * 1000,
      })
    ).toMatch(/24 hours/i);
  });
});
