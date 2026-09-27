/**
 * True when assert_checkout_inventory rejected the paid promotion because
 * another booking already holds the inventory (soft-expired hold race).
 */
export function isCheckoutInventoryConflictError(message: string | null | undefined): boolean {
  return /already booked|not enough capacity|occupied/i.test(String(message ?? ''));
}

/**
 * Phase 1096: PostgREST/schema-cache miss for a required inventory RPC.
 * Must not be treated as “assert passed” — that fail-open oversells.
 */
export function isMissingPostgresFunctionError(message: string | null | undefined): boolean {
  return /could not find the function|schema cache/i.test(String(message ?? ''));
}
