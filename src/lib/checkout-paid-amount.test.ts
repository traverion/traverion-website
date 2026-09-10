import { describe, expect, it } from 'vitest';
import { checkoutPaidAmountAcceptable, checkoutPaidCurrencyMatches } from './checkout-paid-amount';

describe('checkoutPaidAmountAcceptable', () => {
  it('rejects missing or zero paid amounts', () => {
    expect(checkoutPaidAmountAcceptable({ amountPaid: null, bookingTotalAmount: 189 })).toBe(false);
    expect(checkoutPaidAmountAcceptable({ amountPaid: 0, bookingTotalAmount: 189 })).toBe(false);
  });

  it('rejects underpayment against the booking total', () => {
    expect(
      checkoutPaidAmountAcceptable({ amountPaid: 100, bookingTotalAmount: 189, quotedTotalMeta: '189' })
    ).toBe(false);
    expect(checkoutPaidAmountAcceptable({ amountPaid: 188.98, bookingTotalAmount: 189 })).toBe(false);
  });

  it('accepts exact and slightly over/rounded amounts', () => {
    expect(checkoutPaidAmountAcceptable({ amountPaid: 189, bookingTotalAmount: 189 })).toBe(true);
    expect(checkoutPaidAmountAcceptable({ amountPaid: 189.01, bookingTotalAmount: 189 })).toBe(true);
    expect(checkoutPaidAmountAcceptable({ amountPaid: 188.99, bookingTotalAmount: 189 })).toBe(true);
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
