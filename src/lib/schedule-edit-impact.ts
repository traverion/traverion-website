import { bookingOccupiesInventory, normalizeTourStartTimeHm } from './booking-hold';

export type ScheduleOccupancyBooking = {
  listing_id?: string | null;
  booking_option_id?: string | null;
  start_time?: string | null;
  guests?: number | null;
  status?: string | null;
  payment_status?: string | null;
  hold_expires_at?: string | null;
  created_at?: string | null;
};

/**
 * Occupying guests for one booking option + departure time across all dates.
 * Used when a partner lowers schedule max spots or removes a schedule.
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
    if (normalizeTourStartTimeHm(row.start_time) !== slot) continue;
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
