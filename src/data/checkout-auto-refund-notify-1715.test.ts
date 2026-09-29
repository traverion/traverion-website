import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1715: remaining silent auto-refund traveler notifies', () => {
  it('wires inventory, underpay, currency, orphan, and unpromoted refund notifies', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/_shared/promote-paid-from-checkout.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1715');
    for (const key of [
      'inventory_conflict_checkout_refund',
      'underpay_checkout_refund',
      'currency_mismatch_checkout_refund',
      'orphan_checkout_refund',
      'orphan_checkout_refund_unpromoted',
      'unpromoted_checkout_refund',
    ]) {
      expect(src).toContain(`reasonKey: '${key}'`);
    }
  });
});
