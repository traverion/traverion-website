import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1720: refund-before-paid traveler notify', () => {
  it('promote and stripe-webhook wire notifyTravelerCheckoutCaptureReversed', () => {
    const promote = readFileSync(
      resolve(__dirname, '../../supabase/functions/_shared/promote-paid-from-checkout.ts'),
      'utf8'
    );
    const webhook = readFileSync(
      resolve(__dirname, '../../supabase/functions/stripe-webhook/index.ts'),
      'utf8'
    );
    expect(promote).toContain('Phase 1720');
    expect(promote).toContain("reasonKey: 'refunded_before_promote'");
    expect(promote).toContain('export async function notifyTravelerCheckoutCaptureReversed');
    expect(webhook).toContain('Phase 1720');
    expect(webhook).toContain("reasonKey: 'full_refund_before_paid_promotion'");
    expect(webhook).toContain('notifyTravelerCheckoutCaptureReversed');
  });
});
