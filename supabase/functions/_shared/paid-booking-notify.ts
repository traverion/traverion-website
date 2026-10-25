/**
 * Paid confirmation mail is separate from earnings.
 * A channel is complete only after the notify function accepts the send
 * or reports that this booking's idempotency key was already sent.
 * Provider HTTP acceptance is not a delivered event.
 */

export type PaidNotifyChannel = 'sent' | 'skipped' | 'failed' | 'missing';

export type PaidNotifyResult = {
  customer: PaidNotifyChannel;
  supplier: PaidNotifyChannel;
  complete: boolean;
  detail: string;
};

export function classifyPaidNotifyHttp(params: {
  called: boolean;
  status: number | null;
  body: unknown;
}): PaidNotifyChannel {
  if (!params.called) return 'missing';
  const status = params.status;
  if (status == null || status < 200 || status >= 300) return 'failed';
  const body =
    params.body && typeof params.body === 'object'
      ? (params.body as { success?: unknown; skipped?: unknown })
      : {};
  if (body.success === false) return 'failed';
  if (body.skipped === true) return 'skipped';
  return 'sent';
}

export function paidNotifyResult(params: {
  customer: PaidNotifyChannel;
  supplier: PaidNotifyChannel;
}): PaidNotifyResult {
  const done = (channel: PaidNotifyChannel) => channel === 'sent' || channel === 'skipped';
  const detail = `customer:${params.customer} supplier:${params.supplier}`;
  return {
    customer: params.customer,
    supplier: params.supplier,
    complete: done(params.customer) && done(params.supplier),
    detail,
  };
}

export function parseNotifyJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
