import { describe, expect, it } from 'vitest';
import {
  addDaysYmd,
  buildRentalInterval,
  calendarDaysBetween,
  normalizeHm,
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
});
