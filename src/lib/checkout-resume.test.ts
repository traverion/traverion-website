import { describe, expect, it } from 'vitest';
import {
  checkoutPaymentStatusCanResume,
  staleCheckoutFailureShouldApply,
  stripeWebhookCanMarkPaidFrom,
} from './checkout-resume';

describe('checkout resume after hold expiry', () => {
  it('allows pending and failed unpaid holds to resume/pay', () => {
    expect(checkoutPaymentStatusCanResume('pending')).toBe(true);
    expect(checkoutPaymentStatusCanResume('failed')).toBe(true);
    expect(checkoutPaymentStatusCanResume(null)).toBe(true);
    expect(checkoutPaymentStatusCanResume('paid')).toBe(false);
    expect(checkoutPaymentStatusCanResume('refunded')).toBe(false);
  });

  it('webhook may promote the same statuses to paid', () => {
    expect(stripeWebhookCanMarkPaidFrom('failed')).toBe(true);
    expect(stripeWebhookCanMarkPaidFrom('pending')).toBe(true);
    expect(stripeWebhookCanMarkPaidFrom('paid')).toBe(false);
  });
});

describe('staleCheckoutFailureShouldApply', () => {
  it('ignores an old Checkout expire while a newer session is current', () => {
    expect(
      staleCheckoutFailureShouldApply({
        eventCheckoutSessionId: 'cs_old',
        bookingCheckoutSessionId: 'cs_new',
      })
    ).toBe(false);
    expect(
      staleCheckoutFailureShouldApply({
        eventCheckoutSessionId: 'cs_new',
        bookingCheckoutSessionId: 'cs_new',
      })
    ).toBe(true);
  });

  it('ignores an old PI failure while a newer Checkout session is open', () => {
    expect(
      staleCheckoutFailureShouldApply({
        eventPaymentIntentId: 'pi_old',
        bookingCheckoutSessionId: 'cs_new',
        bookingPaymentIntentId: null,
      })
    ).toBe(false);
    expect(
      staleCheckoutFailureShouldApply({
        eventPaymentIntentId: 'pi_old',
        bookingCheckoutSessionId: 'cs_new',
        bookingPaymentIntentId: 'pi_old',
      })
    ).toBe(true);
  });
});
