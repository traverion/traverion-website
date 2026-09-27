import { describe, expect, it } from 'vitest';
import { notifyUnpaidCheckoutFromPaymentStatus } from './notify-unpaid-checkout';

describe('notifyUnpaidCheckoutFromPaymentStatus (Phase 1129)', () => {
  it('treats pending/failed/cancelled as unpaid checkout', () => {
    expect(notifyUnpaidCheckoutFromPaymentStatus('pending')).toBe(true);
    expect(notifyUnpaidCheckoutFromPaymentStatus('failed')).toBe(true);
    expect(notifyUnpaidCheckoutFromPaymentStatus('cancelled')).toBe(true);
    expect(notifyUnpaidCheckoutFromPaymentStatus(null)).toBe(true);
  });

  it('treats paid/refunded/complete as collected (not unpaid checkout)', () => {
    expect(notifyUnpaidCheckoutFromPaymentStatus('paid')).toBe(false);
    expect(notifyUnpaidCheckoutFromPaymentStatus('refunded')).toBe(false);
    expect(notifyUnpaidCheckoutFromPaymentStatus('complete')).toBe(false);
    expect(notifyUnpaidCheckoutFromPaymentStatus('succeeded')).toBe(false);
  });
});
