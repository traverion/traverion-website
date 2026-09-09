import { describe, expect, it } from 'vitest';
import { checkoutPaymentStatusCanResume, stripeWebhookCanMarkPaidFrom } from './checkout-resume';

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
