import { describe, expect, it } from 'vitest';
import { traverionCalendarDayClass } from './TraverionCalendarMonth';

describe('traverionCalendarDayClass', () => {
  it('never uses line-through for disabled or occupied days', () => {
    expect(traverionCalendarDayClass('disabled')).not.toMatch(/line-through/);
    expect(traverionCalendarDayClass('occupied')).not.toMatch(/line-through/);
    expect(traverionCalendarDayClass('disabled')).toMatch(/text-ink-faint/);
    expect(traverionCalendarDayClass('occupied')).toMatch(/text-ink-faint/);
  });

  it('keeps selected and range chrome distinct from disabled', () => {
    expect(traverionCalendarDayClass('selected')).toMatch(/bg-finland/);
    expect(traverionCalendarDayClass('rangeStart')).toMatch(/bg-finland/);
    expect(traverionCalendarDayClass('disabled')).not.toMatch(/bg-finland/);
  });

  it('today cue is secondary and separate from disabled', () => {
    expect(traverionCalendarDayClass('today')).toMatch(/ring-finland/);
    expect(traverionCalendarDayClass('today')).not.toMatch(/line-through/);
  });
});
