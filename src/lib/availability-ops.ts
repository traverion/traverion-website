import { weekdayIndexMondayFirst } from './booking-quote';

export type AvailabilityCap = {
  available_date: string;
  capacity: number;
  booked: number;
};

/** Increment remaining occupancy by guest count (never by a flat +1 per booking). */
export function nextBookedCount(currentBooked: number, guests: number): number {
  const booked = Number.isFinite(currentBooked) ? Math.max(0, currentBooked) : 0;
  const party = Number.isFinite(guests) ? Math.max(1, Math.floor(guests)) : 1;
  return booked + party;
}

export function previousBookedCount(currentBooked: number, guests: number): number {
  const booked = Number.isFinite(currentBooked) ? Math.max(0, currentBooked) : 0;
  const party = Number.isFinite(guests) ? Math.max(1, Math.floor(guests)) : 1;
  return Math.max(0, booked - party);
}

export function remainingCapacity(capacity: number, booked: number): number {
  return Math.max(0, (capacity ?? 0) - (booked ?? 0));
}

export type MonthCell = {
  iso: string;
  day: number;
  inMonth: boolean;
  weekdayMon0: number;
};

/** Monday-first month grid (6 weeks) in UTC date-only space. monthIndex0 is 0–11. */
export function buildMonthCells(year: number, monthIndex0: number): MonthCell[] {
  const first = new Date(Date.UTC(year, monthIndex0, 1));
  const startPad = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, monthIndex0, 1 - startPad));
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const weekdayMon0 = weekdayIndexMondayFirst(iso) ?? 0;
    cells.push({
      iso,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === monthIndex0,
      weekdayMon0,
    });
  }
  return cells;
}

export function defaultCapacityForOpenDay(maxSpotsPerSlot: number | undefined): number {
  const n = typeof maxSpotsPerSlot === 'number' && maxSpotsPerSlot >= 1 ? Math.floor(maxSpotsPerSlot) : 8;
  return Math.min(99, n);
}
