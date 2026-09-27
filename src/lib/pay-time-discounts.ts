/**
 * Pay-time discount refresh must not treat a failed offers load as [].
 * Checkout already fails closed (Phase 1088); BookingPage mirrors that gate (Phase 1090).
 */
export function payTimeDiscountsOrBlock<T>(
  result: { ok: true; discounts: T[] } | { ok: false }
): { proceed: true; discounts: T[] } | { proceed: false } {
  if (!result.ok) return { proceed: false };
  return { proceed: true, discounts: result.discounts };
}
