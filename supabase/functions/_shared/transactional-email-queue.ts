/** Pure outbox transitions. Provider acceptance is the only path to "sent". */

export const MAX_DELIVERY_ATTEMPTS = 5;
const STALE_SENDING_MS = 2 * 60 * 1000;

export type DeliveryStatus = 'queued' | 'sending' | 'sent' | 'skipped' | 'failed';

export type QueuedEmailPayload = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string | null;
};

export function cancellationEmailShouldQueue(
  channel: 'customer' | 'supplier',
  templateKey: string,
): boolean {
  if (channel === 'customer') {
    return (
      templateKey === 'cancellation_requested_by_supplier' ||
      templateKey === 'supplier_cancelled_choose_resolution'
    );
  }
  return templateKey === 'booking_cancelled';
}

export function enqueueDecision(
  status: string | null | undefined,
): 'insert' | 'already_queued' | 'already_sent' | 'requeue' {
  if (!status) return 'insert';
  if (status === 'sent' || status === 'skipped') return 'already_sent';
  if (status === 'queued' || status === 'sending') return 'already_queued';
  if (status === 'failed') return 'requeue';
  return 'insert';
}

export function rowIsClaimable(
  row: {
    status: string;
    payload: unknown;
    nextAttemptAt?: string | null;
    lockedAt?: string | null;
    attemptCount: number;
  },
  nowMs: number,
): boolean {
  if (row.payload == null) return false;
  if (row.status === 'queued') {
    return !row.nextAttemptAt || Date.parse(row.nextAttemptAt) <= nowMs;
  }
  if (row.status === 'sending') {
    return Boolean(row.lockedAt) && Date.parse(row.lockedAt!) <= nowMs - STALE_SENDING_MS;
  }
  if (row.status === 'failed') {
    return (
      row.attemptCount < MAX_DELIVERY_ATTEMPTS &&
      Boolean(row.nextAttemptAt) &&
      Date.parse(row.nextAttemptAt!) <= nowMs
    );
  }
  return false;
}

export function deliveryResult(args: {
  attemptCount: number;
  providerOk: boolean;
  providerMessageId?: string | null;
  error?: string | null;
  nowMs: number;
}): {
  status: 'sent' | 'failed';
  providerMessageId: string | null;
  errorMessage: string | null;
  nextAttemptAt: string | null;
  retryable: boolean;
} {
  if (args.providerOk) {
    return {
      status: 'sent',
      providerMessageId: args.providerMessageId ?? null,
      errorMessage: null,
      nextAttemptAt: null,
      retryable: false,
    };
  }
  const retryable = args.attemptCount < MAX_DELIVERY_ATTEMPTS;
  const delayMs = Math.min(15_000 * 2 ** Math.max(0, args.attemptCount - 1), 120_000);
  return {
    status: 'failed',
    providerMessageId: null,
    errorMessage: args.error?.trim() || 'Provider rejected the email',
    nextAttemptAt: retryable ? new Date(args.nowMs + delayMs).toISOString() : null,
    retryable,
  };
}
