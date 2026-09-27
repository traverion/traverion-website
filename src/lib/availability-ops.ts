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
  /** Phase 1281: null = unknown listing spots (do not invent 8). */
  defaultCapacity: number | null;
  occupyingGuests: number;
}): { capacity: number | null; remaining: number | null } {
  if (!params.offered) return { capacity: null, remaining: null };
  const capacity =
    typeof params.savedCapacity === 'number' && Number.isFinite(params.savedCapacity)
      ? Math.max(0, Math.floor(params.savedCapacity))
      : typeof params.defaultCapacity === 'number' && params.defaultCapacity >= 1
        ? Math.min(99, Math.floor(params.defaultCapacity))
        : null;
  if (capacity == null) return { capacity: null, remaining: null };
  return {
    capacity,
    remaining: partnerTourRemainingSpots(capacity, params.occupyingGuests),
  };
}

/**
 * Partner month-grid label for multi-departure days.
 * With departures: Full when every departure has min(slot_left, day_left) = 0 (Phase 1113).
 * Without departures, fall back to day-wide remaining.
 */
export function partnerTourMonthCellCapacityLabel(params: {
  offered: boolean;
  dayCapacityOverride: number | null | undefined;
  /** Phase 1281: null = unknown listing spots (do not invent 8). */
  defaultCapacity: number | null;
  occupyingGuestsDay: number;
  departures: Array<{ startTimeHm: string; maxSpots: number; occupyingGuests: number }>;
}): { short: string | null; aria: string | null; tone: 'full' | 'partial' | 'open' | null } {
  if (!params.offered) return { short: null, aria: null, tone: null };
  const dayCap =
    typeof params.dayCapacityOverride === 'number' && Number.isFinite(params.dayCapacityOverride)
      ? Math.max(0, Math.floor(params.dayCapacityOverride))
      : null;
  if (dayCap != null && dayCap < 1) {
    return { short: 'Full', aria: 'closed this day', tone: 'full' };
  }
  if (params.departures.length >= 1) {
    const dayLeft = dayCap != null ? Math.max(0, dayCap - params.occupyingGuestsDay) : null;
    const lines = params.departures.map((d) => {
      const slotLeft = partnerTourRemainingSpots(d.maxSpots, d.occupyingGuests);
      return dayLeft != null ? Math.min(slotLeft, dayLeft) : slotLeft;
    });
    const anyOpen = lines.some((n) => n > 0);
    if (!anyOpen) return { short: 'Full', aria: 'fully booked this day', tone: 'full' };
    const openCount = lines.filter((n) => n > 0).length;
    if (params.departures.length >= 2 && openCount < params.departures.length) {
      return {
        short: 'Partial',
        aria: `${openCount} of ${params.departures.length} departures still have seats`,
        tone: 'partial',
      };
    }
    const left = Math.max(...lines);
    if (dayCap != null) {
      return {
        short: `${left}/${dayCap} left`,
        aria: `${left} of ${dayCap} day spots left (best open departure)`,
        tone: 'open',
      };
    }
    const capShown = Math.max(...params.departures.map((d) => d.maxSpots));
    return {
      short: `${left}/${capShown} left`,
      aria: `${left} of ${capShown} spots left on the fullest open departure`,
      tone: 'open',
    };
  }
  if (dayCap != null) {
    const remaining = partnerTourRemainingSpots(dayCap, params.occupyingGuestsDay);
    if (remaining === 0) return { short: 'Full', aria: 'fully booked this day', tone: 'full' };
    return {
      short: `${remaining}/${dayCap} left`,
      aria: `${remaining} of ${dayCap} spots left`,
      tone: 'open',
    };
  }
  const fallback =
    typeof params.defaultCapacity === 'number' && params.defaultCapacity >= 1
      ? Math.min(99, Math.floor(params.defaultCapacity))
      : null;
  if (fallback == null) return { short: null, aria: null, tone: null };
  const remaining = partnerTourRemainingSpots(fallback, params.occupyingGuestsDay);
  if (remaining === 0) return { short: 'Full', aria: 'fully booked this day', tone: 'full' };
  return {
    short: `${remaining}/${fallback} left`,
    aria: `${remaining} of ${fallback} spots left`,
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

/** Phase 1281: no invent-8 — unknown option spots → null (partner must set capacity). */
export function defaultCapacityForOpenDay(maxSpotsPerSlot: number | undefined): number | null {
  if (typeof maxSpotsPerSlot !== 'number' || maxSpotsPerSlot < 1) return null;
  return Math.min(99, Math.floor(maxSpotsPerSlot));
}

/**
 * Listing-wide tour cap when listing_availability has no row for the departure.
 * Phase 1163: do not invent capacity 8 when no option/schedule spots are configured —
 * return null so callers fail closed (unknown remaining) instead of fake open seats.
 */
export function listingTourCapacityFromOptions(
  spots: Array<number | undefined | null>
): number | null {
  let max = 0;
  for (const raw of spots) {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1) continue;
    max = Math.max(max, Math.floor(raw));
  }
  if (max < 1) return null;
  return Math.min(99, max);
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
