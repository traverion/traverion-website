import { describe, expect, it } from 'vitest';
import {
  PAYOUT_FREQUENCY_SURCHARGE_APPROVED,
  catalogPayoutRates,
  catalogRateForPreference,
  parsePayoutThreshold,
  payoutFrequencyQuote,
  settlementCommissionBps,
} from './payout-preference';

describe('payout preference', () => {
  it('uses the catalog plans for monthly and twice-monthly commission', () => {
    const rates = catalogPayoutRates();
    expect(rates.standardLabel).toBe('15%');
    expect(rates.twiceMonthlyLabel).toBe('18%');
    expect(rates.extraBps).toBe(300);
    expect(catalogRateForPreference('monthly')).toBe(1500);
    expect(catalogRateForPreference('biweekly')).toBe(1800);
  });

  it('quotes monthly and twice-monthly fees from the agreement rate', () => {
    const quote = payoutFrequencyQuote(1500);
    expect(quote).toEqual({
      available: true,
      standardBps: 1500,
      monthlyTotalBps: 1500,
      twiceMonthlyExtraBps: 300,
      twiceMonthlyTotalBps: 1800,
    });
    expect(payoutFrequencyQuote(1250)).toMatchObject({
      standardBps: 1250,
      monthlyTotalBps: 1250,
      twiceMonthlyTotalBps: 1550,
    });
  });

  it('does not invent a rate when the agreement is missing', () => {
    expect(payoutFrequencyQuote(null)).toEqual({ available: false });
    expect(payoutFrequencyQuote(undefined)).toEqual({ available: false });
    expect(payoutFrequencyQuote(15.5)).toEqual({ available: false });
    expect(payoutFrequencyQuote(-1)).toEqual({ available: false });
  });

  it('keeps settlement on the agreement rate until the surcharge is approved', () => {
    expect(PAYOUT_FREQUENCY_SURCHARGE_APPROVED).toBe(false);
    expect(settlementCommissionBps({ agreementBps: 1500, cycle: 'biweekly' })).toBe(1500);
    expect(settlementCommissionBps({ agreementBps: 1500, cycle: 'monthly' })).toBe(1500);
    expect(
      settlementCommissionBps({ agreementBps: 1500, cycle: 'biweekly', surchargeApproved: true })
    ).toBe(1800);
    expect(settlementCommissionBps({ agreementBps: null, cycle: 'biweekly' })).toBeNull();
  });

  it('accepts an empty threshold and rejects invalid amounts', () => {
    expect(parsePayoutThreshold('')).toEqual({ ok: true, value: null });
    expect(parsePayoutThreshold('50')).toEqual({ ok: true, value: 50 });
    expect(parsePayoutThreshold('50.5')).toEqual({ ok: true, value: 50.5 });
    expect(parsePayoutThreshold('-1').ok).toBe(false);
    expect(parsePayoutThreshold('12.345').ok).toBe(false);
  });
});
