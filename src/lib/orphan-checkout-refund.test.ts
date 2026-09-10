import { describe, expect, it } from 'vitest';
import { orphanSupersededCheckoutShouldRefund } from './orphan-checkout-refund';

describe('orphanSupersededCheckoutShouldRefund', () => {
  it('refunds a paid superseded session whose PI is not the booking PI', () => {
    expect(
      orphanSupersededCheckoutShouldRefund({
        sessionPaymentStatus: 'paid',
        eventPaymentIntentId: 'pi_old',
        bookingPaymentIntentId: null,
      })
    ).toBe(true);
    expect(
      orphanSupersededCheckoutShouldRefund({
        sessionPaymentStatus: 'paid',
        eventPaymentIntentId: 'pi_old',
        bookingPaymentIntentId: 'pi_new',
      })
    ).toBe(true);
  });

  it('does not refund unpaid stale sessions', () => {
    expect(
      orphanSupersededCheckoutShouldRefund({
        sessionPaymentStatus: 'unpaid',
        eventPaymentIntentId: 'pi_old',
        bookingPaymentIntentId: null,
      })
    ).toBe(false);
  });

  it('does not refund when the event PI is the booking current PI', () => {
    expect(
      orphanSupersededCheckoutShouldRefund({
        sessionPaymentStatus: 'paid',
        eventPaymentIntentId: 'pi_same',
        bookingPaymentIntentId: 'pi_same',
      })
    ).toBe(false);
  });

  it('does not refund without a payment intent', () => {
    expect(
      orphanSupersededCheckoutShouldRefund({
        sessionPaymentStatus: 'paid',
        eventPaymentIntentId: null,
        bookingPaymentIntentId: 'pi_new',
      })
    ).toBe(false);
  });
});
