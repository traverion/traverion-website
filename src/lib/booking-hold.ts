/** Pending Stripe checkout occupies inventory until this many minutes after claim. Matches Stripe Checkout min expires_at. */
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

/** Public stay calendar: only collected paid nights, never unpaid or failed checkouts. */
export function bookingOccupiesPublicStayCalendar(row: InventoryHoldRow): boolean {
  if ((row.status ?? '').trim().toLowerCase() === 'cancelled') return false;
  const pay = (row.payment_status ?? '').trim().toLowerCase();
  return pay === 'paid' || pay === 'complete' || pay === 'succeeded';
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

export function checkoutHoldExpiresAtIso(fromMs: number = Date.now()): string {
  return new Date(fromMs + CHECKOUT_HOLD_MINUTES * 60 * 1000).toISOString();
}

export function checkoutHoldExpiresAtUnix(fromMs: number = Date.now()): number {
  return Math.floor(fromMs / 1000) + CHECKOUT_HOLD_MINUTES * 60;
}

/** Pending unpaid checkout that still blocks tour spots / stay nights. */
export function partnerUnpaidCheckoutHoldsInventory(
  row: InventoryHoldRow,
  nowMs: number = Date.now()
): boolean {
  if ((row.status ?? '').trim().toLowerCase() === 'cancelled') return false;
  const pay = (row.payment_status ?? 'pending').trim().toLowerCase();
  if (pay !== 'pending') return false;
  return bookingOccupiesInventory(row, nowMs);
}

/**
 * Partner-facing hold line for Calendar day sheet / Bookings detail.
 * Null when the row is not an unpaid pending checkout.
 */
export function formatPartnerCheckoutHoldLabel(
  row: InventoryHoldRow,
  nowMs: number = Date.now()
): string | null {
  if ((row.status ?? '').trim().toLowerCase() === 'cancelled') return null;
  const pay = (row.payment_status ?? 'pending').trim().toLowerCase();
  if (pay !== 'pending') return null;
  if (partnerUnpaidCheckoutHoldsInventory(row, nowMs)) {
    if (row.hold_expires_at) {
      const exp = Date.parse(row.hold_expires_at);
      if (Number.isFinite(exp) && exp > nowMs) {
        const until = new Date(exp).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        });
        return `Checkout hold · until ${until}`;
      }
    }
    return 'Checkout hold · still holding spots';
  }
  return 'Hold expired · inventory released';
}
