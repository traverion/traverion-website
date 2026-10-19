import { addCalendarDays, STAY_MAX_OCCUPIED_NIGHTS } from './stayOccupancy';
import { stayNightState } from './stay-calendar';

/**
 * Pure stay date-range pick — used by StayNightPicker and regression tests.
 * Returns next check-in/check-out and whether the picker should close.
 */
export function planStayNightPick(params: {
  iso: string;
  todayIso: string;
  occupied: ReadonlySet<string>;
  checkIn: string;
  checkOut: string;
  minNights: number;
}): { checkIn: string; checkOut: string; close: boolean; reason?: string } {
  const state = stayNightState({
    iso: params.iso,
    todayIso: params.todayIso,
    occupied: params.occupied as Set<string>,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
  });
  if (state === 'past' || state === 'occupied') {
    return {
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      close: false,
      reason: state,
    };
  }

  // Fresh range or restart after complete range.
  if (!params.checkIn || (params.checkIn && params.checkOut)) {
    return { checkIn: params.iso, checkOut: '', close: false };
  }

  // Second click on same or earlier day → new check-in.
  if (params.iso <= params.checkIn) {
    return { checkIn: params.iso, checkOut: '', close: false };
  }

  const nights: string[] = [];
  let cur = params.checkIn;
  while (cur < params.iso) {
    nights.push(cur);
    cur = addCalendarDays(cur, 1);
  }
  if (nights.some((n) => params.occupied.has(n))) {
    return { checkIn: params.checkIn, checkOut: '', close: false, reason: 'occupied_in_range' };
  }
  if (nights.length < params.minNights) {
    return { checkIn: params.checkIn, checkOut: '', close: false, reason: 'min_nights' };
  }
  if (nights.length > STAY_MAX_OCCUPIED_NIGHTS) {
    return { checkIn: params.checkIn, checkOut: '', close: false, reason: 'max_nights' };
  }
  return { checkIn: params.checkIn, checkOut: params.iso, close: true };
}
