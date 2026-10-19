/** Stripe Checkout session expiry window (session TTL). Not an inventory hold for Instant Book. */
export const CHECKOUT_HOLD_MINUTES = 60;

export type InventoryHoldRow = {
  status?: string | null;
  payment_status?: string | null;
  hold_expires_at?: string | null;
  created_at?: string | null;
};

/**
 * True when this row must block Tour spots or Stay nights.
 * Instant Book unpaid pending never occupies — nights are claimed only when payment
 * promotes paid (first successful promote wins). Request-to-Book authorized still holds.
 */
export function bookingOccupiesInventory(row: InventoryHoldRow, nowMs: number = Date.now()): boolean {
  if ((row.status ?? '').trim().toLowerCase() === 'cancelled') return false;
  const pay = (row.payment_status ?? 'pending').trim().toLowerCase();
  if (pay === 'paid' || pay === 'complete' || pay === 'succeeded') return true;
  // Authorized Request-to-Book holds inventory until host accepts, declines, or the window expires.
  if (pay === 'authorized') {
    if (row.hold_expires_at) {
      const exp = Date.parse(row.hold_expires_at);
      return Number.isFinite(exp) && exp > nowMs;
    }
    const created = row.created_at ? Date.parse(row.created_at) : nowMs;
    return Number.isFinite(created) && created > nowMs - 24 * 60 * 60 * 1000;
  }
  return false;
}

/**
 * Public stay calendar occupancy — paid + authorized R2B only.
 * Abandoned Instant Book checkouts never cross out nights.
 */
export function bookingOccupiesPublicStayCalendar(row: InventoryHoldRow, nowMs: number = Date.now()): boolean {
  return bookingOccupiesInventory(row, nowMs);
}

export type TourCheckoutOccupancyRow = InventoryHoldRow & {
  id?: string | null;
  booking_date?: string | null;
  guests?: number | null;
  start_time?: string | null;
  /** When present, inventory seats stay on purchased departure even if start_time was ops-edited. */
  purchase_snapshot?: unknown;
};

/** Normalize HH:MM / HH:MM:SS to HH:MM for departure-slot matching. */
export function normalizeTourStartTimeHm(raw: string | null | undefined): string {
  const t = String(raw ?? '').trim();
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/**
 * Inventory departure slot for a booking row.
 * Prefer purchase_snapshot.startTimeHm (sold seat); fall back to live start_time.
 */
export function inventoryStartTimeHmFromBooking(row: {
  start_time?: string | null;
  purchase_snapshot?: unknown;
}): string {
  const snap = row.purchase_snapshot;
  if (snap && typeof snap === 'object') {
    const hm = (snap as { startTimeHm?: unknown }).startTimeHm;
    if (typeof hm === 'string') {
      const fromSnap = normalizeTourStartTimeHm(hm);
      if (fromSnap) return fromSnap;
    }
  }
  return normalizeTourStartTimeHm(row.start_time);
}

/**
 * Checkout tour occupancy: paid + authorized R2B only.
 * Instant Book unpaid pending does not fill capacity.
 * When startTime is set, only count bookings on that departure slot (multi-schedule same day).
 * Slot match uses purchased startTimeHm when present so ops edits cannot move sold seats.
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
      const rowSlot = inventoryStartTimeHmFromBooking(row);
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

/**
 * True when an unpaid Instant Book checkout still has a live Stripe session window.
 * Does NOT mean inventory is reserved — use bookingOccupiesInventory for that.
 */
export function unpaidCheckoutSessionIsLive(
  row: InventoryHoldRow,
  nowMs: number = Date.now()
): boolean {
  if ((row.status ?? '').trim().toLowerCase() === 'cancelled') return false;
  const pay = (row.payment_status ?? 'pending').trim().toLowerCase();
  if (pay !== 'pending') return false;
  if (row.hold_expires_at) {
    const exp = Date.parse(row.hold_expires_at);
    return Number.isFinite(exp) && exp > nowMs;
  }
  const created = row.created_at ? Date.parse(row.created_at) : NaN;
  return Number.isFinite(created) && created > nowMs - CHECKOUT_HOLD_MINUTES * 60 * 1000;
}

/**
 * @deprecated Instant Book pending no longer holds inventory. Always false for pending.
 * Kept so partner call sites compile; prefer bookingOccupiesInventory for real holds.
 */
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
 * Partner-facing label for unpaid Instant Book checkout rows.
 * Null when not an unpaid pending checkout.
 */
export function formatPartnerCheckoutHoldLabel(
  row: InventoryHoldRow,
  nowMs: number = Date.now()
): string | null {
  if ((row.status ?? '').trim().toLowerCase() === 'cancelled') return null;
  const pay = (row.payment_status ?? 'pending').trim().toLowerCase();
  if (pay !== 'pending') return null;
  if (unpaidCheckoutSessionIsLive(row, nowMs)) {
    return 'Unpaid checkout · nights not held';
  }
  return 'Checkout expired · nights were never held';
}
