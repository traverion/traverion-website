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
