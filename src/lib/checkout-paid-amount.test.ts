import { describe, expect, it } from 'vitest';
import {
  checkoutPaidAmountAcceptable,
  checkoutPaidCurrencyMatches,
  rejectedCheckoutCaptureShouldRefund,
  unpromotedCheckoutCaptureShouldRefund,
} from './checkout-paid-amount';

describe('checkoutPaidAmountAcceptable', () => {
  it('rejects missing or zero paid amounts', () => {
    expect(checkoutPaidAmountAcceptable({ amountPaid: null, bookingTotalAmount: 189 })).toBe(false);
    expect(checkoutPaidAmountAcceptable({ amountPaid: 0, bookingTotalAmount: 189 })).toBe(false);
  });

  it('rejects underpayment against the session quoted_total (preferred over booking)', () => {
    expect(
      checkoutPaidAmountAcceptable({ amountPaid: 100, bookingTotalAmount: 189, quotedTotalMeta: '189' })
    ).toBe(false);
    expect(checkoutPaidAmountAcceptable({ amountPaid: 188.98, bookingTotalAmount: 189 })).toBe(false);
  });

  it('accepts a session that paid its quoted_total even if booking total was raised', () => {
    expect(
      checkoutPaidAmountAcceptable({
        amountPaid: 100,
        bookingTotalAmount: 189,
        quotedTotalMeta: '100',
      })
    ).toBe(true);
  });

  it('accepts exact and slightly over/rounded amounts', () => {
    expect(checkoutPaidAmountAcceptable({ amountPaid: 189, bookingTotalAmount: 189 })).toBe(true);
    expect(checkoutPaidAmountAcceptable({ amountPaid: 189.01, bookingTotalAmount: 189 })).toBe(true);
    expect(checkoutPaidAmountAcceptable({ amountPaid: 188.99, bookingTotalAmount: 189 })).toBe(true);
  });

  it('falls back to booking total when quoted_total metadata is missing', () => {
    expect(checkoutPaidAmountAcceptable({ amountPaid: 50, bookingTotalAmount: 189 })).toBe(false);
    expect(checkoutPaidAmountAcceptable({ amountPaid: 189, bookingTotalAmount: 189 })).toBe(true);
  });

  it('falls back to quoted_total metadata when booking total is missing', () => {
    expect(checkoutPaidAmountAcceptable({ amountPaid: 50, quotedTotalMeta: '189' })).toBe(false);
    expect(checkoutPaidAmountAcceptable({ amountPaid: 189, quotedTotalMeta: '189' })).toBe(true);
    expect(checkoutPaidAmountAcceptable({ amountPaid: 50 })).toBe(true);
  });
});

describe('checkoutPaidCurrencyMatches', () => {
  it('requires session and booking currencies to match when both exist', () => {
    expect(checkoutPaidCurrencyMatches({ sessionCurrency: 'eur', bookingCurrency: 'EUR' })).toBe(true);
    expect(checkoutPaidCurrencyMatches({ sessionCurrency: 'usd', bookingCurrency: 'EUR' })).toBe(false);
    expect(checkoutPaidCurrencyMatches({ sessionCurrency: 'usd', bookingCurrency: null })).toBe(true);
    expect(checkoutPaidCurrencyMatches({ sessionCurrency: null, bookingCurrency: 'EUR' })).toBe(true);
  });
});

describe('rejectedCheckoutCaptureShouldRefund', () => {
  it('refunds paid sessions with a PaymentIntent', () => {
    expect(
      rejectedCheckoutCaptureShouldRefund({
        sessionPaymentStatus: 'paid',
        paymentIntentId: 'pi_x',
      })
    ).toBe(true);
  });

  it('skips unpaid or missing PI', () => {
    expect(
      rejectedCheckoutCaptureShouldRefund({
        sessionPaymentStatus: 'unpaid',
        paymentIntentId: 'pi_x',
      })
    ).toBe(false);
    expect(
      rejectedCheckoutCaptureShouldRefund({
        sessionPaymentStatus: 'paid',
        paymentIntentId: null,
      })
    ).toBe(false);
  });
});

describe('unpromotedCheckoutCaptureShouldRefund', () => {
  it('refunds captured sessions when the booking was not promoted to paid', () => {
    expect(
      unpromotedCheckoutCaptureShouldRefund({
        sessionPaymentStatus: 'paid',
        paymentIntentId: 'pi_x',
        bookingPaymentStatus: 'pending',
      })
    ).toBe(true);
    expect(
      unpromotedCheckoutCaptureShouldRefund({
        sessionPaymentStatus: 'paid',
        paymentIntentId: 'pi_x',
        bookingPaymentStatus: 'failed',
      })
    ).toBe(true);
  });

  it('does not refund when the booking already settled', () => {
    expect(
      unpromotedCheckoutCaptureShouldRefund({
        sessionPaymentStatus: 'paid',
        paymentIntentId: 'pi_x',
        bookingPaymentStatus: 'paid',
      })
    ).toBe(false);
    expect(
      unpromotedCheckoutCaptureShouldRefund({
        sessionPaymentStatus: 'paid',
        paymentIntentId: 'pi_x',
        bookingPaymentStatus: 'refunded',
      })
    ).toBe(false);
  });
});
