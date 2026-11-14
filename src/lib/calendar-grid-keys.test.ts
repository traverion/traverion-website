import { describe, expect, it } from 'vitest';
import { addCalendarMonthsYmd, calendarGridMove } from './calendar-grid-keys';

describe('calendar grid keyboard movement', () => {
  it('moves by day and week without shifting the civil date', () => {
    expect(calendarGridMove('2026-01-31', 'ArrowRight')).toBe('2026-02-01');
    expect(calendarGridMove('2026-03-01', 'ArrowLeft')).toBe('2026-02-28');
    expect(calendarGridMove('2026-03-08', 'ArrowUp')).toBe('2026-03-01');
    expect(calendarGridMove('2026-03-01', 'ArrowDown')).toBe('2026-03-08');
  });

  it('jumps to the Monday-first week and across months and years', () => {
    expect(calendarGridMove('2026-03-04', 'Home')).toBe('2026-03-02');
    expect(calendarGridMove('2026-03-04', 'End')).toBe('2026-03-08');
    expect(calendarGridMove('2026-01-31', 'PageDown')).toBe('2026-02-28');
    expect(calendarGridMove('2026-01-31', 'PageUp', true)).toBe('2025-01-31');
    expect(addCalendarMonthsYmd('2026-01-31', 12)).toBe('2027-01-31');
  });

  it('ignores keys that do not move the grid', () => {
    expect(calendarGridMove('2026-03-04', 'Enter')).toBeNull();
    expect(calendarGridMove('not-a-date', 'ArrowRight')).toBeNull();
  });
});
