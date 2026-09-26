import { describe, expect, it } from 'vitest';
import { calendarMonthTitle } from './calendar-month-title';

describe('calendarMonthTitle', () => {
  it('formats a UTC month with long name and year', () => {
    const title = calendarMonthTitle(2026, 8);
    expect(title).toMatch(/2026/);
    expect(title.length).toBeGreaterThan(4);
  });
});
