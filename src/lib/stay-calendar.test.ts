import { describe, expect, it } from 'vitest';
import { formatOccupiedNightRanges, stayNightState } from './stay-calendar';

describe('stay calendar language', () => {
  it('groups consecutive occupied nights', () => {
    expect(formatOccupiedNightRanges(['2026-09-20', '2026-09-21'])).toMatch(/20/);
    expect(formatOccupiedNightRanges(['2026-09-20', '2026-09-22'])).toContain(';');
  });

  it('classifies past, occupied, selected, available', () => {
    expect(
      stayNightState({
        iso: '2026-09-01',
        todayIso: '2026-09-08',
        occupied: new Set(),
        checkIn: '',
        checkOut: '',
      })
    ).toBe('past');
    expect(
      stayNightState({
        iso: '2026-09-20',
        todayIso: '2026-09-08',
        occupied: new Set(['2026-09-20']),
        checkIn: '',
        checkOut: '',
      })
    ).toBe('occupied');
    expect(
      stayNightState({
        iso: '2026-09-12',
        todayIso: '2026-09-08',
        occupied: new Set(),
        checkIn: '2026-09-12',
        checkOut: '2026-09-14',
      })
    ).toBe('selected');
    expect(
      stayNightState({
        iso: '2026-09-14',
        todayIso: '2026-09-08',
        occupied: new Set(),
        checkIn: '2026-09-12',
        checkOut: '2026-09-14',
      })
    ).toBe('checkout');
  });
});
