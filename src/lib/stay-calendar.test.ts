import { describe, expect, it } from 'vitest';
import { formatOccupiedNightRanges, stayNightState, upcomingOccupiedNights } from './stay-calendar';

describe('stay calendar language', () => {
  it('groups consecutive occupied nights', () => {
    expect(formatOccupiedNightRanges(['2026-09-20', '2026-09-21'])).toMatch(/20/);
    expect(formatOccupiedNightRanges(['2026-09-20', '2026-09-22'])).toContain(';');
  });

  it('Phase 1512: Availability copy drops nights before listing today', () => {
    expect(
      upcomingOccupiedNights(['2026-09-22', '2026-09-23', '2026-10-01'], '2026-09-28')
    ).toEqual(['2026-10-01']);
    expect(upcomingOccupiedNights(['2026-09-22', '2026-09-23'], '2026-09-28')).toEqual([]);
    expect(upcomingOccupiedNights(['2026-09-28'], '2026-09-28')).toEqual(['2026-09-28']);
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
