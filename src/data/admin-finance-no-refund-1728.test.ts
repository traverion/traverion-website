import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isCollectedBooking } from '../lib/payment-states';

describe('Phase 1728: Admin Finance Collected matches partner no_refund rule', () => {
  it('admin-supplier-verification finance_summary keeps cancelled+paid+no_refund', () => {
    const edge = readFileSync(
      resolve(__dirname, '../../supabase/functions/admin-supplier-verification/index.ts'),
      'utf8'
    );
    expect(edge).toContain('Phase 1728');
    expect(edge).toContain("normalizePaymentStatus(b.refund_choice) === 'no_refund'");
    expect(edge).not.toMatch(
      /const isCollected = \(b: any\): boolean => \{\s*if \(normalizePaymentStatus\(b\.status\) === 'cancelled'\) return false;/
    );
  });

  it('canonical isCollectedBooking still includes the no_refund fixture Admin must match', () => {
    expect(
      isCollectedBooking({
        status: 'cancelled',
        payment_status: 'paid',
        amount_paid: 150,
        refund_choice: 'no_refund',
      })
    ).toBe(true);
    expect(
      isCollectedBooking({
        status: 'cancelled',
        payment_status: 'paid',
        amount_paid: 150,
        refund_choice: 'full_refund',
      })
    ).toBe(false);
  });
});
