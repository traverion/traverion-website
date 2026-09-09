import { describe, expect, it } from 'vitest';
import { isStripeChargeFullyRefunded } from './stripe-charge-refund';

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
