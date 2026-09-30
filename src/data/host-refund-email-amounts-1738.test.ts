import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1738: host Stripe refund emails include money figures', () => {
  it('notify-supplier-event renders refundAmount / remaining for refund kinds', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/notify-supplier-event/index.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1738');
    expect(src).toContain('refundAmount?: number');
    expect(src).toContain('amountPaidRemaining?: number');
    expect(src).toContain('Refunded this time');
    expect(src).toContain('Collected remaining');
  });

  it('stripe-webhook passes refund figures on host partial and full notifies', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/stripe-webhook/index.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1738');
    expect(src).toContain('refundAmount: notifyAmount');
    expect(src).toContain('amountPaidRemaining: remainingPaid');
    expect(src).toMatch(/eventType:\s*'refund_completed'[\s\S]*refundAmount:/);
  });
});
