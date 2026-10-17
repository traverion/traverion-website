import { describe, expect, it } from 'vitest';
import { catalogPayoutRates, catalogRateForPreference, parsePayoutThreshold } from './payout-preference';

describe('payout preference', () => {
  it('uses the catalog plans for monthly and twice-monthly commission', () => {
    const rates = catalogPayoutRates();
    expect(rates.standardLabel).toBe('15%');
    expect(rates.twiceMonthlyLabel).toBe('18%');
    expect(rates.extraBps).toBe(300);
    expect(catalogRateForPreference('monthly')).toBe(1500);
    expect(catalogRateForPreference('biweekly')).toBe(1800);
  });

  it('accepts an empty threshold and rejects invalid amounts', () => {
    expect(parsePayoutThreshold('')).toEqual({ ok: true, value: null });
    expect(parsePayoutThreshold('50')).toEqual({ ok: true, value: 50 });
    expect(parsePayoutThreshold('50.5')).toEqual({ ok: true, value: 50.5 });
    expect(parsePayoutThreshold('-1').ok).toBe(false);
    expect(parsePayoutThreshold('12.345').ok).toBe(false);
  });
});
