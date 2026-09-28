/**
 * Phase 1513: interpret promote_paid_checkout_booking RPC results.
 * Inventory conflicts still arrive as PostgREST errors from assert RAISE.
 */

export type PromotePaidCheckoutResult = {
  ok?: boolean;
  reason?: string;
  booking_id?: string;
  payment_status?: string;
  message?: string;
};

export function promotePaidCheckoutOutcome(
  data: PromotePaidCheckoutResult | null | undefined,
  errorMessage?: string | null
):
  | { kind: 'promoted' }
  | { kind: 'inventory_conflict'; message: string }
  | { kind: 'already_paid' }
  | { kind: 'already_refunded' }
  | { kind: 'cancelled' }
  | { kind: 'session_mismatch' }
  | { kind: 'unpromoted'; reason: string }
  | { kind: 'rpc_error'; message: string } {
  if (errorMessage && /already booked|not enough capacity|occupied|nights are blocked|no bookable capacity/i.test(errorMessage)) {
    return { kind: 'inventory_conflict', message: errorMessage };
  }
  if (errorMessage) {
    return { kind: 'rpc_error', message: errorMessage };
  }
  if (data?.ok === true) return { kind: 'promoted' };
  const reason = String(data?.reason ?? '').trim();
  if (reason === 'already_paid') return { kind: 'already_paid' };
  if (reason === 'already_refunded') return { kind: 'already_refunded' };
  if (reason === 'cancelled') return { kind: 'cancelled' };
  if (reason === 'session_mismatch') return { kind: 'session_mismatch' };
  return { kind: 'unpromoted', reason: reason || 'unknown' };
}

/**
 * Documents the race closed by mig 198: assert txn ending before paid UPDATE
 * must not be treated as safe under concurrent claim_pending.
 */
export function promotePaidRequiresAtomicAssertUpdate(params: {
  assertAndUpdateSameTransaction: boolean;
}): boolean {
  return params.assertAndUpdateSameTransaction === true;
}
