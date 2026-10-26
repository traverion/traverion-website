import { describe, expect, it } from 'vitest';
import { orphanSupersededCheckoutShouldRefund } from './orphan-checkout-refund';

describe('orphanSupersededCheckoutShouldRefund', () => {
  it('refunds a paid superseded session whose PI is not the booking PI', () => {
    expect(
      orphanSupersededCheckoutShouldRefund({
        sessionPaymentStatus: 'paid',
        eventPaymentIntentId: 'pi_old',
        bookingPaymentIntentId: null,
        eventCheckoutSessionId: 'cs_old',
        bookingCheckoutSessionId: 'cs_new',
      })
    ).toBe(true);
    expect(
      orphanSupersededCheckoutShouldRefund({
        sessionPaymentStatus: 'paid',
        eventPaymentIntentId: 'pi_old',
        bookingPaymentIntentId: 'pi_new',
        eventCheckoutSessionId: 'cs_old',
        bookingCheckoutSessionId: 'cs_new',
      })
    ).toBe(true);
  });

  it('does not refund the current checkout session even when booking PI is still null', () => {
    expect(
      orphanSupersededCheckoutShouldRefund({
        sessionPaymentStatus: 'paid',
        eventPaymentIntentId: 'pi_live',
        bookingPaymentIntentId: null,
        eventCheckoutSessionId: 'cs_live',
        bookingCheckoutSessionId: 'cs_live',
      })
    ).toBe(false);
  });

  it('does not refund unpaid stale sessions', () => {
    expect(
      orphanSupersededCheckoutShouldRefund({
        sessionPaymentStatus: 'unpaid',
        eventPaymentIntentId: 'pi_old',
        bookingPaymentIntentId: null,
        eventCheckoutSessionId: 'cs_old',
        bookingCheckoutSessionId: 'cs_new',
      })
    ).toBe(false);
  });

  it('does not refund when the event PI is the booking current PI', () => {
    expect(
      orphanSupersededCheckoutShouldRefund({
        sessionPaymentStatus: 'paid',
        eventPaymentIntentId: 'pi_same',
        bookingPaymentIntentId: 'pi_same',
        eventCheckoutSessionId: 'cs_a',
        bookingCheckoutSessionId: 'cs_b',
      })
    ).toBe(false);
  });

  it('does not refund without a payment intent', () => {
    expect(
      orphanSupersededCheckoutShouldRefund({
        sessionPaymentStatus: 'paid',
        eventPaymentIntentId: null,
        bookingPaymentIntentId: 'pi_new',
        eventCheckoutSessionId: 'cs_old',
        bookingCheckoutSessionId: 'cs_new',
      })
    ).toBe(false);
  });
});
