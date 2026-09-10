/**
 * Mirror of src/lib/checkout-inventory-conflict.ts for Deno edge runtime.
 */
export function isCheckoutInventoryConflictError(message: string | null | undefined): boolean {
  return /already booked|not enough capacity|occupied/i.test(String(message ?? ''));
}
