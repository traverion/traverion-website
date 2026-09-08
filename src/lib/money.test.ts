import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  isStripeTestCheckoutSession,
  isStripeTestPublishableKey,
  isSupportedCurrency,
  normalizeCurrency,
} from './money';

describe('money', () => {
  it('defaults invalid codes to EUR', () => {
    expect(normalizeCurrency(null)).toBe(DEFAULT_CURRENCY);
    expect(normalizeCurrency('')).toBe('EUR');
    expect(normalizeCurrency('eur')).toBe('EUR');
    expect(normalizeCurrency('USD')).toBe('USD');
  });

  it('formats with the stored currency, not a guessed symbol', () => {
    expect(formatMoney(189, 'EUR')).toMatch(/189/);
    expect(formatMoney(189, 'EUR')).toMatch(/€/);
    expect(formatMoney(189, 'USD')).toMatch(/189/);
    expect(formatMoney(189, 'USD')).toMatch(/\$/);
    expect(formatMoney(445.5, 'EUR')).toMatch(/445/);
  });

  it('formats a non-EUR supported Stripe currency without assuming euro', () => {
    expect(isSupportedCurrency('GBP')).toBe(true);
    expect(isSupportedCurrency('XYZ')).toBe(false);
    expect(formatMoney(99, 'GBP')).toMatch(/99/);
    expect(formatMoney(99, 'GBP')).not.toMatch(/€/);
  });

  it('detects Stripe TEST checkout sessions', () => {
    expect(isStripeTestCheckoutSession('cs_test_abc')).toBe(true);
    expect(isStripeTestCheckoutSession('cs_live_abc')).toBe(false);
    expect(isStripeTestPublishableKey('pk_test_x')).toBe(true);
    expect(isStripeTestPublishableKey('pk_live_x')).toBe(false);
  });
});
