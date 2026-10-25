import { describe, expect, it } from 'vitest';
import {
  classifyPaidNotifyHttp,
  paidNotifyResult,
} from '../../supabase/functions/_shared/paid-booking-notify.ts';

describe('paid booking notify completion', () => {
  it('accepts a provider acceptance and an idempotent skip', () => {
    const result = paidNotifyResult({
      customer: classifyPaidNotifyHttp({
        called: true,
        status: 200,
        body: { success: true, skipped: true, reason: 'already_sent' },
      }),
      supplier: classifyPaidNotifyHttp({
        called: true,
        status: 200,
        body: { success: true, providerMessageId: 're_1' },
      }),
    });
    expect(result.customer).toBe('skipped');
    expect(result.supplier).toBe('sent');
    expect(result.complete).toBe(true);
  });

  it('keeps the webhook retryable when a channel is rejected or never called', () => {
    const rejected = paidNotifyResult({
      customer: classifyPaidNotifyHttp({
        called: true,
        status: 500,
        body: { success: false, error: 'provider rejected' },
      }),
      supplier: classifyPaidNotifyHttp({
        called: true,
        status: 200,
        body: { success: true },
      }),
    });
    expect(rejected.complete).toBe(false);

    const missing = paidNotifyResult({
      customer: classifyPaidNotifyHttp({ called: false, status: null, body: null }),
      supplier: classifyPaidNotifyHttp({ called: true, status: 200, body: { success: true } }),
    });
    expect(missing.customer).toBe('missing');
    expect(missing.complete).toBe(false);
  });
});
