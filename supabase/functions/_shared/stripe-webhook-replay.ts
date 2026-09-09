/**
 * Mirror of src/lib/stripe-webhook-replay.ts for Deno edge runtime.
 * Keep behavior in sync with the Vitest-covered module.
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
