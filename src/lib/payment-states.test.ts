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

  it('does not count refunded payments as collected revenue', () => {
    expect(
      isCollectedBooking({
        status: 'confirmed',
        payment_status: 'refunded',
        amount_paid: 189,
      })
    ).toBe(false);
    expect(travelerPaymentLabel({ status: 'confirmed', payment_status: 'refunded', amount_paid: 189 })).toBe(
      'Refunded'
    );
    expect(
      travelerPaymentLabel({ status: 'cancelled', payment_status: 'paid', amount_paid: 189 })
    ).toBe('Refund due');
    expect(
      travelerPaymentLabel({
        status: 'cancelled',
        payment_status: 'paid',
        amount_paid: 189,
        refund_choice: 'no_refund',
      })
    ).toBe('No refund');
    expect(
      travelerPaymentLabel({ status: 'cancelled', payment_status: 'refunded', amount_paid: 189 })
    ).toBe('Refunded');
  });
});
