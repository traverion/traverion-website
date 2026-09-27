import type { ListingBookingOption } from '../types/listingExtras';
import { optionRunsOnDate } from './booking-quote';
import { remainingCapacity } from './availability-ops';
import { bookingOccupiesInventory, type InventoryHoldRow } from './booking-hold';

export type TourDayState = 'past' | 'closed' | 'full' | 'available' | 'selected';

export function tourDayState(params: {
  iso: string;
  todayIso: string;
  selected: string;
  options: ListingBookingOption[];
  soldOut?: boolean;
}): TourDayState {
  if (params.iso < params.todayIso) return 'past';
  if (params.selected === params.iso) return 'selected';
  if (params.options.length === 0) return params.soldOut ? 'full' : 'available';
  const anyOpen = params.options.some((o) => optionRunsOnDate(o, params.iso) === null);
  if (!anyOpen) return 'closed';
  return params.soldOut ? 'full' : 'available';
}

export function formatTourDayAria(iso: string, state: TourDayState): string {
  const human = new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  if (state === 'past') return `${human}, past`;
  if (state === 'closed') return `${human}, not offered`;
  if (state === 'full') return `${human}, fully booked`;
  if (state === 'selected') return `${human}, selected`;
  return `${human}, available`;
}

/** Empty-month copy for the public tour calendar — do not call sold-out months “no departures”. */
export function tourMonthAvailabilityNote(states: TourDayState[]): string | null {
  const offered = states.filter((s) => s === 'available' || s === 'selected' || s === 'full');
  if (offered.length === 0) return 'No departures this month. Try the next month.';
  const bookable = offered.some((s) => s === 'available' || s === 'selected');
  if (!bookable) return 'All departures this month are fully booked. Try another month.';
  return null;
}

/** Public tour sold-out: paid + live checkout holds (matches RPC / assert_checkout_inventory). Refunded, failed, expired, cancelled do not fill a day. */
export function bookingCountsTowardPublicTourSoldOut(row: InventoryHoldRow, nowMs: number = Date.now()): boolean {
  return bookingOccupiesInventory(row, nowMs);
}

export function publicTourPaidGuestsByDeparture(
  rows: Array<InventoryHoldRow & { booking_date?: string | null; guests?: number | null }>,
  nowMs: number = Date.now()
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (!bookingCountsTowardPublicTourSoldOut(row, nowMs)) continue;
    const day = String(row.booking_date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const n = Math.floor(Number(row.guests ?? 0));
    if (!Number.isFinite(n) || n < 1) continue;
    out[day] = (out[day] ?? 0) + n;
  }
  return out;
}

/** Catalog date filter: hide tours when no capacity remains for the party.
 * Day-level listing_availability overrides only tighten per-departure capacity (Phase 1112).
 * With per-departure slot data: hide only when every (bookable) departure lacks party capacity —
 * including a single remaining departure after cutoff filtering (Phase 1063).
 * Without slot data and no day override: do not hide (avoid false morning-fill sell-outs).
 */
export function tourDateLacksCapacityForParty(params: {
  paidGuestsThatDay: number;
  dayCapacity: number | undefined;
  fallbackCapacity: number;
  partySize?: number;
  paidBySlot?: Record<string, number>;
  departures?: Array<{ startTimeHm: string; maxSpots: number }>;
  slotKey?: (startTimeHm: string) => string;
}): boolean {
  const need = Math.max(1, Math.floor(params.partySize ?? 1));
  const dayCap =
    typeof params.dayCapacity === 'number' && Number.isFinite(params.dayCapacity)
      ? Math.max(0, Math.floor(params.dayCapacity))
      : null;
  if (dayCap != null && dayCap < 1) return true;
  // Caller passed an explicit departure list that is empty (e.g. all past cutoff).
  if (Array.isArray(params.departures) && params.departures.length === 0) return true;
  const deps = params.departures ?? [];
  if (deps.length >= 1 && params.paidBySlot && params.slotKey) {
    const anyOpen = deps.some((d) => {
      const cap = dayCap != null ? Math.min(d.maxSpots, dayCap) : d.maxSpots;
      const paid = params.paidBySlot![params.slotKey!(d.startTimeHm)] ?? 0;
      return remainingCapacity(cap, paid) >= need;
    });
    return !anyOpen;
  }
  if (dayCap != null) {
    return remainingCapacity(dayCap, params.paidGuestsThatDay) < need;
  }
  return false;
}

/**
 * Public calendar sold-out markers.
 * Day overrides only tighten; with slot data a day is full when every departure is full
 * under min(slotMax, dayCap) (Phase 1112). Without slot data, fall back to day-wide paid.
 */
export function tourSoldOutDates(params: {
  paidByDay: Record<string, number>;
  capByDay: Map<string, number>;
  fallbackCapacity: number;
  paidBySlot?: Record<string, number>;
  departuresForDay?: (day: string) => Array<{ startTimeHm: string; maxSpots: number }>;
  slotKey?: (day: string, startTimeHm: string) => string;
}): Set<string> {
  const next = new Set<string>();
  const days = new Set<string>([
    ...params.capByDay.keys(),
    ...Object.keys(params.paidByDay),
  ]);
  for (const day of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const dayCap = params.capByDay.has(day) ? (params.capByDay.get(day) as number) : null;
    if (dayCap != null && dayCap < 1) {
      next.add(day);
      continue;
    }
    const departures = params.departuresForDay?.(day) ?? [];
    if (departures.length >= 1 && params.paidBySlot && params.slotKey) {
      const allFull = departures.every((d) => {
        const cap = dayCap != null ? Math.min(d.maxSpots, dayCap) : d.maxSpots;
        const paid = params.paidBySlot![params.slotKey!(day, d.startTimeHm)] ?? 0;
        return remainingCapacity(cap, paid) < 1;
      });
      if (allFull) next.add(day);
      continue;
    }
    if (dayCap != null) {
      if (remainingCapacity(dayCap, params.paidByDay[day] ?? 0) < 1) next.add(day);
      continue;
    }
    if (remainingCapacity(params.fallbackCapacity, params.paidByDay[day] ?? 0) < 1) next.add(day);
  }
  return next;
}
