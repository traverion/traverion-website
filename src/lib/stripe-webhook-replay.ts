/**
 * Decide whether a previously recorded Stripe webhook event should be
 * short-circuited, reclaimed for retry, or treated as still in flight.
 *
 * Failed inserts that later return 200 + duplicate:true permanently stop
 * Stripe retries — so only terminal (processed/ignored) statuses are safe
 * to acknowledge without re-running handlers.
 */

export type StripeWebhookReplayDecision = 'terminal' | 'claim' | 'in_flight' | 'unknown';

const DEFAULT_STALE_RECEIVED_MS = 120_000;

export function stripeWebhookReplayDecision(opts: {
  status: string | null | undefined;
  receivedAt?: string | null;
  nowMs?: number;
  staleReceivedMs?: number;
}): StripeWebhookReplayDecision {
  const status = String(opts.status ?? '')
    .trim()
    .toLowerCase();
  if (status === 'processed' || status === 'ignored') return 'terminal';
  if (status === 'failed') return 'claim';
  if (status === 'received') {
    const staleMs = opts.staleReceivedMs ?? DEFAULT_STALE_RECEIVED_MS;
    const receivedMs = opts.receivedAt ? Date.parse(opts.receivedAt) : NaN;
    const now = opts.nowMs ?? Date.now();
    if (!Number.isFinite(receivedMs) || now - receivedMs >= staleMs) return 'claim';
    return 'in_flight';
  }
  return 'unknown';
}
