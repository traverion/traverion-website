import { describe, expect, it } from 'vitest';
import {
  isStripeChargeFullyRefunded,
  paidPromotionShouldRefuseFullyRefundedCharge,
  refundBeforePaidShouldMarkFailed,
} from './stripe-charge-refund';

describe('isStripeChargeFullyRefunded', () => {
  it('treats Stripe refunded=true as full', () => {
    expect(isStripeChargeFullyRefunded({ amount: 18900, amount_refunded: 5000, refunded: true })).toBe(true);
  });

  it('treats amount_refunded >= amount as full', () => {
    expect(isStripeChargeFullyRefunded({ amount: 18900, amount_refunded: 18900, refunded: false })).toBe(
      true
    );
  });

  it('does not treat partial amount_refunded as full', () => {
    expect(isStripeChargeFullyRefunded({ amount: 18900, amount_refunded: 5000, refunded: false })).toBe(
      false
    );
    expect(isStripeChargeFullyRefunded({ amount: 18900, amount_refunded: 0, refunded: false })).toBe(false);
  });

  it('rejects missing or invalid amounts without refunded flag', () => {
    expect(isStripeChargeFullyRefunded({ refunded: false })).toBe(false);
    expect(isStripeChargeFullyRefunded({ amount: 0, amount_refunded: 0, refunded: false })).toBe(false);
    expect(isStripeChargeFullyRefunded({ amount: 18900, amount_refunded: null, refunded: false })).toBe(
      false
    );
  });
});

describe('refundBeforePaidShouldMarkFailed', () => {
  it('marks pending/failed holds failed after a full refund', () => {
    expect(
      refundBeforePaidShouldMarkFailed({ bookingPaymentStatus: 'pending', fullyRefunded: true })
    ).toBe(true);
    expect(
      refundBeforePaidShouldMarkFailed({ bookingPaymentStatus: 'failed', fullyRefunded: true })
    ).toBe(true);
  });

  it('does not rewrite paid rows or partial refunds', () => {
    expect(
      refundBeforePaidShouldMarkFailed({ bookingPaymentStatus: 'paid', fullyRefunded: true })
    ).toBe(false);
    expect(
      refundBeforePaidShouldMarkFailed({ bookingPaymentStatus: 'pending', fullyRefunded: false })
    ).toBe(false);
  });
});

describe('paidPromotionShouldRefuseFullyRefundedCharge', () => {
  it('refuses promotion when the charge is fully refunded', () => {
    expect(
      paidPromotionShouldRefuseFullyRefundedCharge({
        amount: 18900,
        amount_refunded: 18900,
        refunded: false,
      })
    ).toBe(true);
    expect(paidPromotionShouldRefuseFullyRefundedCharge(null)).toBe(false);
  });
});
