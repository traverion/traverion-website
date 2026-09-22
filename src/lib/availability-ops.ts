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

/**
 * Partner tour remaining spots: occupying guests (paid + live holds).
 * Do not pass listing_availability.booked — refunded/failed can leave that column stale.
 */
export function partnerTourRemainingSpots(capacity: number, occupyingGuests: number): number {
  return remainingCapacity(capacity, occupyingGuests);
}

/** Per-departure remaining for partner Calendar day sheet (same-day multi-time). */
export function partnerDepartureRemainingLine(params: {
  scheduleName: string;
  optionName: string;
  startTime: string;
  maxSpotsPerSlot: number;
  occupyingGuests: number;
}): { label: string; remaining: number; capacity: number; full: boolean } {
  const capacity = Math.max(0, Math.floor(params.maxSpotsPerSlot));
  const remaining = partnerTourRemainingSpots(capacity, params.occupyingGuests);
  const nameBit =
    params.scheduleName && params.scheduleName !== params.optionName
      ? `${params.scheduleName} · ${params.optionName}`
      : params.optionName || params.scheduleName || 'Departure';
  const timeBit = params.startTime.trim() || null;
  const spotsBit = remaining === 0 ? 'Full' : `${remaining} of ${capacity} left`;
  return {
    capacity,
    remaining,
    full: remaining === 0,
    label: [nameBit, timeBit, spotsBit].filter(Boolean).join(' · '),
  };
}

/**
 * Partner tour month cells: never show "spots left" / Full on days the product does not depart.
 * A listing_availability row on a closed weekday does not open traveler booking.
 */
export function partnerTourDaySpotDisplay(params: {
  offered: boolean;
  savedCapacity: number | null | undefined;
  defaultCapacity: number;
  occupyingGuests: number;
}): { capacity: number | null; remaining: number | null } {
  if (!params.offered) return { capacity: null, remaining: null };
  const capacity =
    typeof params.savedCapacity === 'number' && Number.isFinite(params.savedCapacity)
      ? Math.max(0, Math.floor(params.savedCapacity))
      : params.defaultCapacity;
  return {
    capacity,
    remaining: partnerTourRemainingSpots(capacity, params.occupyingGuests),
  };
}

/**
 * Partner month-grid label for multi-departure days.
 * Day-level listing_availability overrides stay day-wide.
 * Without a day override and ≥2 departures: Full only when every departure is full;
 * otherwise Open / Partial — never paint the whole day Full from one morning fill.
 */
export function partnerTourMonthCellCapacityLabel(params: {
  offered: boolean;
  dayCapacityOverride: number | null | undefined;
  defaultCapacity: number;
  occupyingGuestsDay: number;
  departures: Array<{ startTimeHm: string; maxSpots: number; occupyingGuests: number }>;
}): { short: string | null; aria: string | null; tone: 'full' | 'partial' | 'open' | null } {
  if (!params.offered) return { short: null, aria: null, tone: null };
  const dayCap =
    typeof params.dayCapacityOverride === 'number' && Number.isFinite(params.dayCapacityOverride)
      ? Math.max(0, Math.floor(params.dayCapacityOverride))
      : null;
  if (dayCap != null) {
    const remaining = partnerTourRemainingSpots(dayCap, params.occupyingGuestsDay);
    if (remaining === 0) return { short: 'Full', aria: 'fully booked this day', tone: 'full' };
    return {
      short: `${remaining}/${dayCap} left`,
      aria: `${remaining} of ${dayCap} spots left`,
      tone: 'open',
    };
  }
  if (params.departures.length >= 2) {
    const lines = params.departures.map((d) =>
      partnerTourRemainingSpots(d.maxSpots, d.occupyingGuests)
    );
    const allFull = lines.every((r) => r === 0);
    if (allFull) return { short: 'Full', aria: 'all departures full', tone: 'full' };
    const anyTaken = params.departures.some((d) => d.occupyingGuests > 0);
    if (anyTaken) return { short: 'Partial', aria: 'some departures still open', tone: 'partial' };
    return { short: 'Open', aria: 'open', tone: 'open' };
  }
  const capacity = params.defaultCapacity;
  const remaining = partnerTourRemainingSpots(capacity, params.occupyingGuestsDay);
  if (remaining === 0) return { short: 'Full', aria: 'fully booked', tone: 'full' };
  return {
    short: `${remaining}/${capacity} left`,
    aria: `${remaining} of ${capacity} spots left`,
    tone: 'open',
  };
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

/** Listing-wide tour cap when listing_availability has no row for the departure. */
export function listingTourCapacityFromOptions(spots: Array<number | undefined | null>): number {
  let max = 0;
  for (const raw of spots) {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1) continue;
    max = Math.max(max, Math.floor(raw));
  }
  return Math.min(99, max >= 1 ? max : 8);
}

/** Flatten option- and schedule-level maxSpotsPerSlot for listing-wide fallback capacity. */
export function capacitySpotsFromBookingOptions(
  options: Array<{
    maxSpotsPerSlot?: number | null | unknown;
    schedules?: Array<{ maxSpotsPerSlot?: number | null | unknown; status?: string } | null> | null;
  } | null | undefined>
): Array<number | null> {
  const spots: Array<number | null> = [];
  for (const o of options) {
    if (!o) continue;
    const schedules = Array.isArray(o.schedules) ? o.schedules : null;
    if (schedules && schedules.length > 0) {
      for (const s of schedules) {
        if (!s || s.status === 'draft') continue;
        spots.push(typeof s.maxSpotsPerSlot === 'number' ? s.maxSpotsPerSlot : null);
      }
      continue;
    }
    spots.push(typeof o.maxSpotsPerSlot === 'number' ? o.maxSpotsPerSlot : null);
  }
  return spots;
}
