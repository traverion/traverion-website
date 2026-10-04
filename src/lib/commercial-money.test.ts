import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_PLANS,
  formatBpsAsPercent,
  nextPayoutRunDateUtc,
  payoutPeriodBoundsUtc,
  payoutPeriodKey,
  splitGrossByCommissionBps,
  toMinorUnits,
} from './commercial-money';

describe('commercial money engine V1 — split', () => {
  it('€1,000 STANDARD → 150 / 850', () => {
    const r = splitGrossByCommissionBps(100_000, COMMERCIAL_PLANS.standard.commissionBps);
    expect(r.commissionMinor).toBe(15_000);
    expect(r.supplierMinor).toBe(85_000);
    expect(r.platformMinor + r.supplierMinor).toBe(r.grossMinor);
  });

  it('€1,000 FAST → 180 / 820', () => {
    const r = splitGrossByCommissionBps(100_000, COMMERCIAL_PLANS.fast.commissionBps);
    expect(r.commissionMinor).toBe(18_000);
    expect(r.supplierMinor).toBe(82_000);
    expect(r.platformMinor + r.supplierMinor).toBe(r.grossMinor);
  });

  it('€89.99 STANDARD floors commission with no lost cent', () => {
    const gross = toMinorUnits(89.99);
    expect(gross).toBe(8999);
    const r = splitGrossByCommissionBps(gross, 1500);
    // floor(8999 * 1500 / 10000) = floor(1349.85) = 1349
    expect(r.commissionMinor).toBe(1349);
    expect(r.supplierMinor).toBe(7650);
    expect(r.commissionMinor + r.supplierMinor).toBe(8999);
  });

  it('€89.99 FAST floors commission with no lost cent', () => {
    const r = splitGrossByCommissionBps(8999, 1800);
    // floor(8999 * 1800 / 10000) = floor(1619.82) = 1619
    expect(r.commissionMinor).toBe(1619);
    expect(r.supplierMinor).toBe(7380);
    expect(r.commissionMinor + r.supplierMinor).toBe(8999);
  });

  it('handles €0, small, and large amounts', () => {
    expect(splitGrossByCommissionBps(0, 1500)).toEqual({
      grossMinor: 0,
      commissionBps: 1500,
      commissionMinor: 0,
      supplierMinor: 0,
      platformMinor: 0,
    });
    const one = splitGrossByCommissionBps(1, 1500);
    expect(one.commissionMinor).toBe(0);
    expect(one.supplierMinor).toBe(1);
    const big = splitGrossByCommissionBps(99_999_999, 1800);
    expect(big.commissionMinor + big.supplierMinor).toBe(99_999_999);
  });

  it('rejects float money inputs', () => {
    expect(() => splitGrossByCommissionBps(100.5, 1500)).toThrow();
    expect(() => splitGrossByCommissionBps(100, 15.5)).toThrow();
  });

  it('€200 partial remaining on €1000 STANDARD', () => {
    // remaining gross after €200 refund = €800
    const r = splitGrossByCommissionBps(80_000, 1500);
    expect(r.commissionMinor).toBe(12_000);
    expect(r.supplierMinor).toBe(68_000);
  });
});

describe('commercial money engine V1 — payout cadence', () => {
  it('monthly next run on 1st boundary', () => {
    const onFirst = nextPayoutRunDateUtc({
      cadence: 'monthly',
      now: new Date(Date.UTC(2026, 10, 1, 12, 0, 0)),
    });
    expect(payoutPeriodKey(onFirst)).toBe('2026-11-01');

    const afterFirst = nextPayoutRunDateUtc({
      cadence: 'monthly',
      now: new Date(Date.UTC(2026, 10, 2, 0, 0, 0)),
    });
    expect(payoutPeriodKey(afterFirst)).toBe('2026-12-01');
  });

  it('semimonthly 1st and 15th boundaries', () => {
    const mid = nextPayoutRunDateUtc({
      cadence: 'semimonthly',
      now: new Date(Date.UTC(2026, 10, 10, 0, 0, 0)),
    });
    expect(payoutPeriodKey(mid)).toBe('2026-11-15');

    const after15 = nextPayoutRunDateUtc({
      cadence: 'semimonthly',
      now: new Date(Date.UTC(2026, 10, 16, 0, 0, 0)),
    });
    expect(payoutPeriodKey(after15)).toBe('2026-12-01');
  });

  it('year boundary and leap-year Feb', () => {
    const ny = nextPayoutRunDateUtc({
      cadence: 'monthly',
      now: new Date(Date.UTC(2026, 11, 2, 0, 0, 0)),
    });
    expect(payoutPeriodKey(ny)).toBe('2027-01-01');

    const leap = nextPayoutRunDateUtc({
      cadence: 'semimonthly',
      now: new Date(Date.UTC(2028, 1, 16, 0, 0, 0)),
    });
    expect(payoutPeriodKey(leap)).toBe('2028-03-01');
  });

  it('period bounds for monthly and semimonthly', () => {
    const monthly = payoutPeriodBoundsUtc({
      cadence: 'monthly',
      scheduledFor: new Date(Date.UTC(2026, 10, 1)),
    });
    expect(payoutPeriodKey(monthly.periodStart)).toBe('2026-10-01');
    expect(monthly.periodKey).toBe('2026-11-01');

    const semi = payoutPeriodBoundsUtc({
      cadence: 'semimonthly',
      scheduledFor: new Date(Date.UTC(2026, 10, 15)),
    });
    expect(payoutPeriodKey(semi.periodStart)).toBe('2026-11-01');
    expect(semi.periodKey).toBe('2026-11-15');
  });
});

describe('commercial money engine V1 — plan catalog', () => {
  it('does not scatter magic rates outside catalog', () => {
    expect(COMMERCIAL_PLANS.standard.commissionBps).toBe(1500);
    expect(COMMERCIAL_PLANS.fast.commissionBps).toBe(1800);
    expect(formatBpsAsPercent(1500)).toBe('15%');
    expect(formatBpsAsPercent(1800)).toBe('18%');
  });
});
