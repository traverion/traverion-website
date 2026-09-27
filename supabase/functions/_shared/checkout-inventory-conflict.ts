/**
 * Mirror of src/lib/checkout-inventory-conflict.ts for Deno edge runtime.
 */
export function isCheckoutInventoryConflictError(message: string | null | undefined): boolean {
  return /already booked|not enough capacity|occupied/i.test(String(message ?? ''));
}

/** Phase 1096: required inventory RPC missing — fail closed, never oversell. */
export function isMissingPostgresFunctionError(message: string | null | undefined): boolean {
  return /could not find the function|schema cache/i.test(String(message ?? ''));
}
