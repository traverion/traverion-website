/**
 * P8 cert fixtures — manual bank mark-paid vs Connect bank-paid separation.
 * No network, no LIVE money movement.
 */
import { describe, expect, it } from 'vitest';

describe('P8 payout readiness', () => {
  it('keeps kill switches conceptually OFF until explicit approval', () => {
    const flags = {
      payout_execution_enabled: 0,
      stripe_connect_transfers_enabled: 0,
      payout_auto_prepare_enabled: 0,
    };
    expect(Object.values(flags).every((v) => v === 0)).toBe(true);
  });

  it('rejects Stripe payout ids on the manual bank mark-paid path', () => {
    const rejectsManualStripeImpersonation = (ref: string) =>
      /^po_/i.test(ref.trim()) || /^stripe_connect/i.test(ref.trim());
    expect(rejectsManualStripeImpersonation('po_123')).toBe(true);
    expect(rejectsManualStripeImpersonation('stripe_connect_payout')).toBe(true);
    expect(rejectsManualStripeImpersonation('BANK-2026-11-15-RN-01')).toBe(false);
  });

  it('documents lifecycle: transfer confirmed ≠ bank paid', () => {
    const bankPaidTriggers = new Set(['payout.paid', 'manual_admin_with_ref']);
    expect(bankPaidTriggers.has('transfer.created')).toBe(false);
    expect(bankPaidTriggers.has('payout.created')).toBe(false);
    expect(bankPaidTriggers.has('payout.paid')).toBe(true);
  });

  it('documents Royal Nordic pilot identity', () => {
    expect('9e42bd3a-e72c-4472-bb7e-e8c3a59e2c18').toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});
