import { bookingOccupiesInventory, inventoryStartTimeHmFromBooking, normalizeTourStartTimeHm } from './booking-hold';

export type ScheduleOccupancyBooking = {
  listing_id?: string | null;
  booking_option_id?: string | null;
  start_time?: string | null;
  purchase_snapshot?: unknown;
  guests?: number | null;
  status?: string | null;
  payment_status?: string | null;
  hold_expires_at?: string | null;
  created_at?: string | null;
};

/**
 * Occupying guests for one booking option + departure time across all dates.
 * Used when a partner lowers schedule max spots or removes a schedule.
 * Matches inventory on purchased startTimeHm when present (ops edits do not move seats).
 */
export function occupyingGuestsForOptionDeparture(params: {
  bookings: ScheduleOccupancyBooking[];
  listingId: string;
  optionId: string;
  startTimeHm: string;
  nowMs?: number;
}): number {
  const listingId = params.listingId.trim();
  const optionId = params.optionId.trim();
  const slot = normalizeTourStartTimeHm(params.startTimeHm);
  if (!listingId || !optionId || !slot) return 0;
  const nowMs = params.nowMs ?? Date.now();
  let n = 0;
  for (const row of params.bookings) {
    if (String(row.listing_id ?? '').trim() !== listingId) continue;
    if (String(row.booking_option_id ?? '').trim() !== optionId) continue;
    if (inventoryStartTimeHmFromBooking(row) !== slot) continue;
    if (!bookingOccupiesInventory(row, nowMs)) continue;
    const g = Math.floor(Number(row.guests ?? 0));
    if (Number.isFinite(g) && g >= 1) n += g;
  }
  return n;
}

/** Occupying guests for an entire booking option (any departure). */
export function occupyingGuestsForBookingOption(params: {
  bookings: ScheduleOccupancyBooking[];
  listingId: string;
  optionId: string;
  nowMs?: number;
}): number {
  const listingId = params.listingId.trim();
  const optionId = params.optionId.trim();
  if (!listingId || !optionId) return 0;
  const nowMs = params.nowMs ?? Date.now();
  let n = 0;
  for (const row of params.bookings) {
    if (String(row.listing_id ?? '').trim() !== listingId) continue;
    if (String(row.booking_option_id ?? '').trim() !== optionId) continue;
    if (!bookingOccupiesInventory(row, nowMs)) continue;
    const g = Math.floor(Number(row.guests ?? 0));
    if (Number.isFinite(g) && g >= 1) n += g;
  }
  return n;
}

/** Confirm copy when deleting a schedule that still has occupying guests. */
export function removeScheduleOccupancyNotice(
  guestCount: number,
  startTimeHm?: string | null
): string | null {
  const sold = Math.max(0, Math.floor(guestCount));
  if (sold < 1) return null;
  const when = startTimeHm?.trim() ? ` the ${startTimeHm.trim()} departure` : '';
  return `You already have ${sold} guest${sold === 1 ? '' : 's'} booked on${when}. Removing this schedule will not cancel those trips — travelers keep their seats. New travelers will no longer see this departure.`;
}

/** Confirm copy when deleting a booking option that still has occupying guests. */
export function removeBookingOptionOccupancyNotice(guestCount: number): string | null {
  const sold = Math.max(0, Math.floor(guestCount));
  if (sold < 1) return null;
  return `You already have ${sold} guest${sold === 1 ? '' : 's'} booked on this option. Removing it will not cancel those trips — travelers keep their seats. New travelers will no longer see this option.`;
}

/**
 * Phase 1109: after applying a schedule startTime change, every occupied purchased
 * slot for this option must still have a ready schedule covering that wall-clock.
 * Blocks draft-save + reopen bypass of the Phase 1100 move hard-block.
 */
export function schedulePersistAbandonsOccupiedSlot(params: {
  bookings: ScheduleOccupancyBooking[];
  listingId: string;
  optionId: string;
  /** Schedules as they will exist after this persist (including the edited one). */
  schedulesAfterPersist: Array<{ id: string; startTime?: string | null; status?: string | null }>;
  nowMs?: number;
}): string | null {
  const listingId = params.listingId.trim();
  const optionId = params.optionId.trim();
  if (!listingId || !optionId) return null;
  const nowMs = params.nowMs ?? Date.now();
  const occupied = new Map<string, number>();
  for (const row of params.bookings) {
    if (String(row.listing_id ?? '').trim() !== listingId) continue;
    if (String(row.booking_option_id ?? '').trim() !== optionId) continue;
    if (!bookingOccupiesInventory(row, nowMs)) continue;
    const slot = inventoryStartTimeHmFromBooking(row);
    if (!slot) continue;
    const g = Math.floor(Number(row.guests ?? 0));
    if (!Number.isFinite(g) || g < 1) continue;
    occupied.set(slot, (occupied.get(slot) ?? 0) + g);
  }
  if (occupied.size === 0) return null;

  const readyCover = new Set<string>();
  for (const s of params.schedulesAfterPersist) {
    if (String(s.status ?? '').trim() !== 'ready') continue;
    const hm = normalizeTourStartTimeHm(s.startTime);
    if (hm) readyCover.add(hm);
  }

  for (const [slot, sold] of occupied) {
    if (readyCover.has(slot)) continue;
    return `You already have ${sold} guest${sold === 1 ? '' : 's'} booked on the ${slot} departure. Keep a ready schedule at ${slot}, or add a separate schedule for the new time — do not move this one away from sold seats.`;
  }
  return null;
}
