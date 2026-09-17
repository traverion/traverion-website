/**
 * When confirmation polling still shows unpaid, travelers should reconcile
 * against Stripe Checkout rather than only waiting on the webhook.
 */
export function confirmationShouldReconcileCheckout(params: {
  phase: string | null | undefined;
  pollCount: number;
  reconcileAttempted: boolean;
  /** First reconcile after this many 2s polls (~6s). */
  afterPolls?: number;
}): boolean {
  if (params.reconcileAttempted) return false;
  if (params.phase !== 'confirming') return false;
  const after = params.afterPolls ?? 3;
  return params.pollCount >= after;
}

export function confirmationStillWaitingAfterReconcile(params: {
  phase: string | null | undefined;
  reconcileAttempted: boolean;
  pollCount: number;
  pollCap?: number;
}): boolean {
  if (params.phase !== 'confirming') return false;
  if (!params.reconcileAttempted) return false;
  return params.pollCount >= (params.pollCap ?? 18);
}
