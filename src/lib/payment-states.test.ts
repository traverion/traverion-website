import { describe, expect, it } from 'vitest';
import {
  isCollectedBooking,
  sumCollectedAmount,
  travelerPaymentLabel,
  partnerPaymentLabel,
  partnerCollectedAmountCaption,
  bookingPaymentWasCollected,
  isRefundDueBooking,
  sumRefundDueAmount,
  REFUND_DUE_MANUAL_COPY,
  REFUND_DUE_RENTAL_COPY,
  refundDueManualCopy,
  customerRefundPhase,
  customerRefundExplanation,
  customerPaymentStatusLabel,
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
    const now = Date.now();
    expect(
      travelerPaymentLabel({
        status: 'pending',
        payment_status: 'pending',
        checkout_session_id: 'cs_test_abc',
        created_at: new Date(now - 5 * 60 * 1000).toISOString(),
        hold_expires_at: new Date(now + 20 * 60 * 1000).toISOString(),
      })
    ).toBe('Payment pending');
    expect(
      travelerPaymentLabel({
        status: 'pending',
        payment_status: 'pending',
        created_at: new Date(now - 60 * 60 * 1000).toISOString(),
        hold_expires_at: new Date(now - 10 * 60 * 1000).toISOString(),
      })
    ).toBe('Checkout expired');
    expect(
      partnerPaymentLabel({
        status: 'pending',
        payment_status: 'pending',
        checkout_session_id: 'cs_test_abc',
        created_at: new Date(now - 60 * 60 * 1000).toISOString(),
        hold_expires_at: new Date(now + 20 * 60 * 1000).toISOString(),
      })
    ).toBe('Payment pending');
    expect(
      partnerPaymentLabel({
        status: 'pending',
        payment_status: 'pending',
        created_at: new Date(now - 60 * 60 * 1000).toISOString(),
        hold_expires_at: new Date(now - 10 * 60 * 1000).toISOString(),
      })
    ).toBe('Checkout expired');
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
        amount_paid: 445,
      })
    ).toBe(false);
    expect(
      isCollectedBooking({
        status: 'cancelled',
        payment_status: 'paid',
        amount_paid: 189,
      })
    ).toBe(false);
    // Phase 1725: late no_refund cancel — host keeps Stripe money; still Collected.
    expect(
      isCollectedBooking({
        status: 'cancelled',
        payment_status: 'paid',
        amount_paid: 100,
        refund_choice: 'no_refund',
      })
    ).toBe(true);
    expect(
      isCollectedBooking({
        status: 'cancelled',
        payment_status: 'paid',
        amount_paid: 100,
        refund_choice: 'full_refund',
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
    expect(bookingPaymentWasCollected('refunded')).toBe(true);
    expect(bookingPaymentWasCollected('paid')).toBe(true);
    expect(bookingPaymentWasCollected('pending')).toBe(false);
    expect(bookingPaymentWasCollected('failed')).toBe(false);
    expect(
      sumCollectedAmount([
        { status: 'confirmed', payment_status: 'paid', amount_paid: 189 },
        { status: 'confirmed', payment_status: 'paid', amount_paid: 445 },
        { status: 'confirmed', payment_status: 'refunded', amount_paid: 445 },
        { status: 'cancelled', payment_status: 'paid', amount_paid: 189 },
        { status: 'cancelled', payment_status: 'paid', amount_paid: 189 },
        { status: 'confirmed', payment_status: 'paid', amount_paid: 189 },
      ])
    ).toBe(823);
  });

  it('partner amount caption must not say Paid when refund is due', () => {
    expect(
      partnerCollectedAmountCaption({ status: 'cancelled', payment_status: 'paid', amount_paid: 189 })
    ).toBe('Refund due');
    expect(
      partnerCollectedAmountCaption({
        status: 'cancelled',
        payment_status: 'paid',
        amount_paid: 189,
        refund_choice: 'no_refund',
      })
    ).toBe('No refund');
    expect(
      partnerCollectedAmountCaption({ status: 'cancelled', payment_status: 'refunded', amount_paid: 189 })
    ).toBe('Refunded');
    expect(
      partnerCollectedAmountCaption({ status: 'confirmed', payment_status: 'paid', amount_paid: 189 })
    ).toBe('Paid');
    expect(REFUND_DUE_MANUAL_COPY.toLowerCase()).toContain('a refund is due');
    expect(REFUND_DUE_MANUAL_COPY.toLowerCase()).not.toContain('stripe');
    expect(refundDueManualCopy('stay').toLowerCase()).toContain('has not started');
    expect(refundDueManualCopy('rental').toLowerCase()).toContain('has not started');
    expect(refundDueManualCopy('rental')).toBe(REFUND_DUE_RENTAL_COPY);
  });

  it('maps customer refund wording only from the authoritative payment state', () => {
    const paid = { status: 'confirmed', payment_status: 'paid', amount_paid: 180, currency: 'EUR' };
    expect(customerRefundPhase(paid)).toBe('none');
    expect(customerRefundExplanation(paid)).toBeNull();
    expect(customerPaymentStatusLabel(travelerPaymentLabel(paid))).toBe('Paid');

    const due = { status: 'cancelled', payment_status: 'paid', amount_paid: 180, currency: 'EUR' };
    expect(travelerPaymentLabel(due)).toBe('Refund due');
    expect(customerRefundPhase(due)).toBe('due');
    expect(customerRefundExplanation(due)).toBe('A refund of €180 is due for this cancelled booking.');
    expect(customerRefundExplanation(due)?.toLowerCase()).not.toContain('being processed');

    const pending = {
      status: 'cancelled',
      payment_status: 'paid',
      amount_paid: 180,
      currency: 'EUR',
      auto_refund_status: 'submitted',
    };
    expect(customerRefundPhase(pending)).toBe('pending');
    expect(customerRefundExplanation(pending)).toBe('Your refund of €180 is being processed by Traverion.');

    const completed = { status: 'cancelled', payment_status: 'refunded', amount_paid: 180, currency: 'EUR' };
    expect(customerRefundPhase(completed)).toBe('completed');
    expect(customerRefundExplanation(completed)).toContain('Your refund of €180 has been processed.');
    expect(customerRefundExplanation(completed)).toContain('depending on your payment method');

    const attention = {
      status: 'cancelled',
      payment_status: 'paid',
      amount_paid: 180,
      currency: 'EUR',
      auto_refund_status: 'failed',
    };
    expect(customerRefundPhase(attention)).toBe('attention');
    expect(customerRefundExplanation(attention)).toBe(
      "We couldn't complete your refund automatically. Traverion Support will help resolve this."
    );

    const noRefund = {
      status: 'cancelled',
      payment_status: 'paid',
      amount_paid: 180,
      currency: 'EUR',
      refund_choice: 'no_refund',
    };
    expect(customerRefundPhase(noRefund)).toBe('none');
    expect(customerPaymentStatusLabel(travelerPaymentLabel(noRefund))).toBe('No refund');

    const missingAmount = { status: 'cancelled', payment_status: 'paid', amount_paid: 0, currency: 'EUR' };
    expect(customerRefundExplanation(missingAmount)).toBe('A refund is due for this cancelled booking.');
  });

  it('sums outstanding Refund due separately from collected revenue', () => {
    const rows = [
      { status: 'confirmed', payment_status: 'paid', amount_paid: 189 },
      { status: 'cancelled', payment_status: 'paid', amount_paid: 189 },
      { status: 'cancelled', payment_status: 'paid', amount_paid: 189 },
      { status: 'cancelled', payment_status: 'refunded', amount_paid: 445 },
      {
        status: 'cancelled',
        payment_status: 'paid',
        amount_paid: 100,
        refund_choice: 'no_refund',
      },
    ];
    expect(rows.filter(isRefundDueBooking)).toHaveLength(2);
    expect(sumRefundDueAmount(rows)).toBe(378);
    // Phase 1725: confirmed 189 + no_refund cancelled 100; Refund-due cancels stay out.
    expect(sumCollectedAmount(rows)).toBe(289);
    expect(isRefundDueBooking({ status: 'confirmed', payment_status: 'paid', amount_paid: 189 })).toBe(false);
  });
});
