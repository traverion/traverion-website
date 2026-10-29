import { describe, expect, it } from 'vitest';
import {
  earliestStayCheckoutIso,
  formatOccupiedNightRanges,
  stayNightState,
  upcomingOccupiedNights,
} from './stay-calendar';
import { planStayNightPick } from './stay-night-pick';

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

describe('stay check-out eligibility (min nights, frozen 2026-10-29)', () => {
  const todayIso = '2026-10-29';

  it('check-in Oct 30 / min 1 night → Oct 29 muted; Oct 30 check-in only; Oct 31 first checkout', () => {
    expect(earliestStayCheckoutIso('2026-10-30', 1)).toBe('2026-10-31');
    expect(
      stayNightState({
        iso: '2026-10-29',
        todayIso,
        occupied: new Set(),
        checkIn: '2026-10-30',
        checkOut: '',
        minNights: 1,
      })
    ).toBe('past');
    expect(
      planStayNightPick({
        iso: '2026-10-29',
        todayIso,
        occupied: new Set(),
        checkIn: '2026-10-30',
        checkOut: '',
        minNights: 1,
      })
    ).toEqual({ checkIn: '2026-10-30', checkOut: '', close: false, reason: 'past' });
    expect(
      stayNightState({
        iso: '2026-10-30',
        todayIso,
        occupied: new Set(),
        checkIn: '2026-10-30',
        checkOut: '',
        minNights: 1,
      })
    ).toBe('selected');
    // Same day as check-in is not a checkout (toggle clears, never zero-night stay).
    expect(
      planStayNightPick({
        iso: '2026-10-30',
        todayIso,
        occupied: new Set(),
        checkIn: '2026-10-30',
        checkOut: '',
        minNights: 1,
      })
    ).toEqual({ checkIn: '', checkOut: '', close: false });
    expect(
      stayNightState({
        iso: '2026-10-31',
        todayIso,
        occupied: new Set(),
        checkIn: '2026-10-30',
        checkOut: '',
        minNights: 1,
      })
    ).toBe('available');
    expect(
      planStayNightPick({
        iso: '2026-10-31',
        todayIso,
        occupied: new Set(),
        checkIn: '2026-10-30',
        checkOut: '',
        minNights: 1,
      })
    ).toEqual({ checkIn: '2026-10-30', checkOut: '2026-10-31', close: true });
  });

  it('multi-night minimum disables nights before earliest checkout', () => {
    expect(earliestStayCheckoutIso('2026-10-30', 3)).toBe('2026-11-02');
    expect(
      stayNightState({
        iso: '2026-10-31',
        todayIso,
        occupied: new Set(),
        checkIn: '2026-10-30',
        checkOut: '',
        minNights: 3,
      })
    ).toBe('past');
    expect(
      stayNightState({
        iso: '2026-11-01',
        todayIso,
        occupied: new Set(),
        checkIn: '2026-10-30',
        checkOut: '',
        minNights: 3,
      })
    ).toBe('past');
    expect(
      stayNightState({
        iso: '2026-11-02',
        todayIso,
        occupied: new Set(),
        checkIn: '2026-10-30',
        checkOut: '',
        minNights: 3,
      })
    ).toBe('available');
  });

  it('blocked intermediate nights stay occupied; checkout after last occupied night is allowed', () => {
    const occupied = new Set(['2026-11-01']);
    expect(
      stayNightState({
        iso: '2026-11-01',
        todayIso,
        occupied,
        checkIn: '2026-10-30',
        checkOut: '',
        minNights: 1,
      })
    ).toBe('occupied');
    // Checkout boundary night after occupied is not itself occupied.
    expect(
      stayNightState({
        iso: '2026-11-02',
        todayIso,
        occupied,
        checkIn: '2026-10-30',
        checkOut: '',
        minNights: 1,
      })
    ).toBe('available');
    expect(
      planStayNightPick({
        iso: '2026-11-02',
        todayIso,
        occupied,
        checkIn: '2026-10-30',
        checkOut: '',
        minNights: 1,
      }).reason
    ).toBe('occupied_in_range');
    expect(
      planStayNightPick({
        iso: '2026-10-31',
        todayIso,
        occupied,
        checkIn: '2026-10-30',
        checkOut: '',
        minNights: 1,
      })
    ).toEqual({ checkIn: '2026-10-30', checkOut: '2026-10-31', close: true });
  });

  it('DST spring-forward civil days still advance by calendar night', () => {
    // Europe/Helsinki springs forward 2026-03-29; civil nights still +1.
    expect(earliestStayCheckoutIso('2026-03-28', 1)).toBe('2026-03-29');
    expect(earliestStayCheckoutIso('2026-03-29', 1)).toBe('2026-03-30');
    expect(
      stayNightState({
        iso: '2026-03-29',
        todayIso: '2026-03-20',
        occupied: new Set(),
        checkIn: '2026-03-28',
        checkOut: '',
        minNights: 1,
      })
    ).toBe('available');
  });
});

