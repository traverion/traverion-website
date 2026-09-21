/**
 * Deno copy of src/lib/booking-hold.ts occupancy — keep algorithms in sync.
 * Checkout stay overlap MUST use this; SQL assert_checkout_inventory is still the lock.
 */

export const CHECKOUT_HOLD_MINUTES = 30;

export type InventoryHoldRow = {
  status?: string | null;
  payment_status?: string | null;
  hold_expires_at?: string | null;
  created_at?: string | null;
};

/** True when this row must block Tour spots or Stay nights at checkout. */
export function bookingOccupiesInventory(row: InventoryHoldRow, nowMs: number = Date.now()): boolean {
  if ((row.status ?? '').trim().toLowerCase() === 'cancelled') return false;
  const pay = (row.payment_status ?? 'pending').trim().toLowerCase();
  if (pay === 'paid' || pay === 'complete' || pay === 'succeeded') return true;
  if (pay !== 'pending') return false;
  if (row.hold_expires_at) {
    const exp = Date.parse(row.hold_expires_at);
    return Number.isFinite(exp) && exp > nowMs;
  }
  const created = row.created_at ? Date.parse(row.created_at) : nowMs;
  return Number.isFinite(created) && created > nowMs - CHECKOUT_HOLD_MINUTES * 60 * 1000;
}

export type TourCheckoutOccupancyRow = InventoryHoldRow & {
  id?: string | null;
  booking_date?: string | null;
  guests?: number | null;
  start_time?: string | null;
};

/** Normalize HH:MM / HH:MM:SS to HH:MM for departure-slot matching. */
export function normalizeTourStartTimeHm(raw: string | null | undefined): string {
  const t = String(raw ?? '').trim();
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/**
 * Checkout tour occupancy: paid + live holds.
 * Refunded, cancelled, and failed bookings must not fill capacity.
 * When startTime is set, only count bookings on that departure slot (multi-schedule same day).
 */
export function tourCheckoutOccupiedGuests(
  rows: TourCheckoutOccupancyRow[],
  departure: string,
  excludeBookingId?: string | null,
  nowMs: number = Date.now(),
  startTime?: string | null
): number {
  const slot = normalizeTourStartTimeHm(startTime);
  let n = 0;
  for (const row of rows) {
    if (excludeBookingId && String(row.id ?? '') === excludeBookingId) continue;
    if (!bookingOccupiesInventory(row, nowMs)) continue;
    if (String(row.booking_date ?? '').slice(0, 10) !== departure) continue;
    if (slot) {
      const rowSlot = normalizeTourStartTimeHm(row.start_time);
      if (rowSlot !== slot) continue;
    }
    const g = Math.floor(Number(row.guests ?? 0));
    if (Number.isFinite(g) && g >= 1) n += g;
  }
  return n;
}
