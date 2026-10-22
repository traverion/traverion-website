import { addCalendarDays, STAY_MAX_OCCUPIED_NIGHTS } from './stayOccupancy';
import { stayNightState } from './stay-calendar';

/**
 * Pure stay date-range pick — used by StayNightPicker and regression tests.
 * Returns next check-in/check-out and whether the picker should close.
 *
 * Selection rules:
 * - First click → check-in
 * - Second valid click → check-out (closes)
 * - Click selected check-in again → clear both
 * - Click selected check-out again → clear check-out, keep check-in
 * - Click after a complete range → start a new check-in
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

  // Toggle off selected check-out while keeping check-in.
  if (params.checkIn && params.checkOut && params.iso === params.checkOut) {
    return { checkIn: params.checkIn, checkOut: '', close: false };
  }

  // Toggle off selected check-in (alone or as start of a complete range).
  if (params.checkIn && params.iso === params.checkIn) {
    return { checkIn: '', checkOut: '', close: false };
  }

  // Fresh range or restart after complete range.
  if (!params.checkIn || (params.checkIn && params.checkOut)) {
    return { checkIn: params.iso, checkOut: '', close: false };
  }

  // Second click on earlier day → new check-in.
  if (params.iso < params.checkIn) {
    return { checkIn: params.iso, checkOut: '', close: false };
  }

  // Same day as check-in already handled above; refuse zero-night stays.
  if (params.iso === params.checkIn) {
    return { checkIn: params.checkIn, checkOut: '', close: false, reason: 'zero_nights' };
  }

  const nights: string[] = [];
  let cur = params.checkIn;
  while (cur < params.iso) {
    nights.push(cur);
    cur = addCalendarDays(cur, 1);
  }
  if (nights.length < 1) {
    return { checkIn: params.checkIn, checkOut: '', close: false, reason: 'zero_nights' };
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

/** Preview nights between check-in and a hovered check-out candidate (exclusive end). */
export function stayHoverPreviewNights(checkIn: string, hoverIso: string): string[] {
  if (!checkIn || !hoverIso || hoverIso <= checkIn) return [];
  const nights: string[] = [];
  let cur = checkIn;
  while (cur < hoverIso) {
    nights.push(cur);
    cur = addCalendarDays(cur, 1);
  }
  return nights;
}
