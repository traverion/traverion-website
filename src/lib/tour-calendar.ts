import type { ListingBookingOption } from '../types/listingExtras';
import { optionRunsOnDate } from './booking-quote';
import { remainingCapacity } from './availability-ops';
import { bookingOccupiesPublicStayCalendar, type InventoryHoldRow } from './booking-hold';

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

/** Public tour sold-out counts collected paid guests only. Refunded, failed, and cancelled do not fill a day. */
export function bookingCountsTowardPublicTourSoldOut(row: InventoryHoldRow): boolean {
  return bookingOccupiesPublicStayCalendar(row);
}

export function publicTourPaidGuestsByDeparture(
  rows: Array<InventoryHoldRow & { booking_date?: string | null; guests?: number | null }>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (!bookingCountsTowardPublicTourSoldOut(row)) continue;
    const day = String(row.booking_date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const n = Math.floor(Number(row.guests ?? 0));
    if (!Number.isFinite(n) || n < 1) continue;
    out[day] = (out[day] ?? 0) + n;
  }
  return out;
}

export function tourSoldOutDates(params: {
  paidByDay: Record<string, number>;
  capByDay: Map<string, number>;
  fallbackCapacity: number;
}): Set<string> {
  const next = new Set<string>();
  for (const [day, cap] of params.capByDay) {
    if (remainingCapacity(cap, params.paidByDay[day] ?? 0) < 1) next.add(day);
  }
  for (const [day, paid] of Object.entries(params.paidByDay)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const cap = params.capByDay.get(day) ?? params.fallbackCapacity;
    if (remainingCapacity(cap, paid) < 1) next.add(day);
  }
  return next;
}

/** Catalog date filter: hide tours with no remaining paid capacity for the party. */
export function tourDateLacksCapacityForParty(params: {
  paidGuestsThatDay: number;
  dayCapacity: number | undefined;
  fallbackCapacity: number;
  partySize?: number;
}): boolean {
  const cap =
    typeof params.dayCapacity === 'number' && Number.isFinite(params.dayCapacity)
      ? params.dayCapacity
      : params.fallbackCapacity;
  const remaining = remainingCapacity(cap, params.paidGuestsThatDay);
  const need = Math.max(1, Math.floor(params.partySize ?? 1));
  return remaining < need;
}
