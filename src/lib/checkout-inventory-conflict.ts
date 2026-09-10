/**
 * True when assert_checkout_inventory rejected the paid promotion because
 * another booking already holds the inventory (soft-expired hold race).
 */
export function isCheckoutInventoryConflictError(message: string | null | undefined): boolean {
  return /already booked|not enough capacity|occupied/i.test(String(message ?? ''));
}
