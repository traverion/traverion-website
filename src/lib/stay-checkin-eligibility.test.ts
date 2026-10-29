import { describe, expect, it } from 'vitest';
import { stayCheckInStillBookable } from './stay-cutoff';
import { stayNightState } from './stay-calendar';
import { planStayNightPick } from './stay-night-pick';
import { wallTimeInZoneToUtcMs } from './tour-departure-cutoff';

const ZONE = 'Europe/Helsinki';
const DAY = '2026-12-01';
const HM = '16:00';

describe('stayCheckInStillBookable', () => {
  it('closes same-day check-in after the reservation cutoff', () => {
    const arrival = wallTimeInZoneToUtcMs(DAY, HM, ZONE)!;
    expect(
      stayCheckInStillBookable({
        checkInDate: DAY,
        checkInTimeHm: HM,
        cutoffMinutes: 120,
        timeZone: ZONE,
        nowMs: arrival - 60 * 60 * 1000,
      })
    ).toBe(false);
    expect(
      stayCheckInStillBookable({
        checkInDate: DAY,
        checkInTimeHm: HM,
        cutoffMinutes: 120,
        timeZone: ZONE,
        nowMs: arrival - 3 * 60 * 60 * 1000,
      })
    ).toBe(true);
  });

  it('never allows booking at or after official check-in', () => {
    const arrival = wallTimeInZoneToUtcMs(DAY, HM, ZONE)!;
    expect(
      stayCheckInStillBookable({
        checkInDate: DAY,
        checkInTimeHm: HM,
        cutoffMinutes: 0,
        timeZone: ZONE,
        nowMs: arrival,
      })
    ).toBe(false);
  });

  it('keeps tomorrow open when today is past cutoff', () => {
    const arrival = wallTimeInZoneToUtcMs(DAY, HM, ZONE)!;
    expect(
      stayCheckInStillBookable({
        checkInDate: '2026-12-02',
        checkInTimeHm: HM,
        cutoffMinutes: 120,
        timeZone: ZONE,
        nowMs: arrival - 30 * 60 * 1000,
      })
    ).toBe(true);
  });
});

describe('stay calendar check-in cutoff isolation', () => {
  const closed = (iso: string) => iso === DAY;

  it('disables closed today for new check-in but allows it as checkout', () => {
    expect(
      stayNightState({
        iso: DAY,
        todayIso: DAY,
        occupied: new Set(),
        checkIn: '',
        checkOut: '',
        checkInClosed: closed,
      })
    ).toBe('past');

    expect(
      stayNightState({
        iso: DAY,
        todayIso: '2026-11-30',
        occupied: new Set(),
        checkIn: '2026-11-30',
        checkOut: '',
        checkInClosed: closed,
      })
    ).toBe('available');

    const pick = planStayNightPick({
      iso: DAY,
      todayIso: '2026-11-30',
      occupied: new Set(),
      checkIn: '2026-11-30',
      checkOut: '',
      minNights: 1,
      checkInClosed: closed,
    });
    expect(pick.checkOut).toBe(DAY);
  });
});
