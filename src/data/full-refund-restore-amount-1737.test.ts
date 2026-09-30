import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1737: full refund restores amount_paid after partial shrink', () => {
  it('stripe-webhook full-refund update includes amount_paid from cumulative refund', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/stripe-webhook/index.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1737');
    expect(src).toContain('fullRefundUpdate');
    expect(src).toMatch(/fullRefundUpdate\.amount_paid\s*=\s*refundAmount/);
    expect(src).toContain("payment_status: 'refunded'");
  });
});
