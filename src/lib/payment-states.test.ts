import { describe, expect, it } from 'vitest';
import {
  isCollectedBooking,
  sumCollectedAmount,
  travelerPaymentLabel,
} from './payment-states';

describe('payment states', () => {
  it('does not treat checkout-created as collected money', () => {
    expect(
      isCollectedBooking({
        status: 'pending',
        payment_status: 'pending',
        amount_paid: 0,
        checkout_session_id: 'cs_test_abc',
      })
    ).toBe(false);
    expect(
      travelerPaymentLabel({
        status: 'pending',
        payment_status: 'pending',
        checkout_session_id: 'cs_test_abc',
      })
    ).toBe('Payment pending');
  });

  it('reconciles Booking #5 + #6 as 189 + 445 = 634', () => {
    const rows = [
      { status: 'confirmed', payment_status: 'paid', amount_paid: 189, currency: 'EUR' },
      { status: 'confirmed', payment_status: 'paid', amount_paid: 445, currency: 'EUR' },
    ];
    expect(sumCollectedAmount(rows)).toBe(634);
  });

  it('excludes cancelled and failed rows from collected totals', () => {
    expect(
      sumCollectedAmount([
        { status: 'confirmed', payment_status: 'paid', amount_paid: 189 },
        { status: 'cancelled', payment_status: 'paid', amount_paid: 445 },
        { status: 'pending', payment_status: 'failed', amount_paid: 0 },
      ])
    ).toBe(189);
  });
});
