import { describe, expect, it } from 'vitest';
import {
  applySequentialRefundsMinor,
  earliestEligibleAt,
  nextFastPayoutOnOrAfter,
  nextStandardPayoutOnOrAfter,
  remainingAfterCumulativeRefundMinor,
  supplierRecoveryDeltaMinor,
} from './financial-recovery';

describe('financial recovery — partial / multi refund', () => {
  it('€1000 STANDARD − €200 → 800 / 120 / 680', () => {
    const r = remainingAfterCumulativeRefundMinor({
      originalGrossMinor: 100_000,
      cumulativeRefundMinor: 20_000,
      commissionBps: 1500,
    });
    expect(r).toMatchObject({
      remainingGrossMinor: 80_000,
      commissionMinor: 12_000,
      supplierMinor: 68_000,
    });
  });

  it('€1000 FAST full refund → zeros', () => {
    const r = remainingAfterCumulativeRefundMinor({
      originalGrossMinor: 100_000,
      cumulativeRefundMinor: 100_000,
      commissionBps: 1800,
    });
    expect(r.remainingGrossMinor).toBe(0);
    expect(r.commissionMinor).toBe(0);
    expect(r.supplierMinor).toBe(0);
  });

  it('multiple partials have no rounding drift vs single cumulative', () => {
    const multi = applySequentialRefundsMinor({
      originalGrossMinor: 100_000,
      commissionBps: 1500,
      refundMinors: [10_000, 20_000, 5_000],
    });
    const single = remainingAfterCumulativeRefundMinor({
      originalGrossMinor: 100_000,
      cumulativeRefundMinor: 35_000,
      commissionBps: 1500,
    });
    expect(multi.remainingGrossMinor).toBe(single.remainingGrossMinor);
    expect(multi.commissionMinor).toBe(single.commissionMinor);
    expect(multi.supplierMinor).toBe(single.supplierMinor);
    expect(multi.commissionMinor + multi.supplierMinor).toBe(multi.remainingGrossMinor);
  });

  it('awkward cents: €89.99 − €1 and − €44.99', () => {
    const a = remainingAfterCumulativeRefundMinor({
      originalGrossMinor: 8999,
      cumulativeRefundMinor: 100,
      commissionBps: 1500,
    });
    expect(a.commissionMinor + a.supplierMinor).toBe(a.remainingGrossMinor);

    const b = remainingAfterCumulativeRefundMinor({
      originalGrossMinor: 8999,
      cumulativeRefundMinor: 4499,
      commissionBps: 1500,
    });
    expect(b.commissionMinor + b.supplierMinor).toBe(4500);
  });

  it('post-payout recovery delta', () => {
    // Paid €850, then remaining supplier €680 after €200 refund
    expect(
      supplierRecoveryDeltaMinor({ beforeSupplierMinor: 85_000, afterSupplierMinor: 68_000 })
    ).toBe(17_000);
  });
});

describe('financial recovery — 48h hold + payout boundaries', () => {
  it('48h hold from experience', () => {
    const exp = new Date(Date.UTC(2026, 9, 20, 17, 0, 0)); // Oct 20 20:00 Helsinki ≈ 17:00 UTC
    const elig = earliestEligibleAt(exp, 48);
    expect(elig.toISOString()).toBe(new Date(Date.UTC(2026, 9, 22, 17, 0, 0)).toISOString());
  });

  it('STANDARD: hold expires Oct 22 → Nov 1; hold expires Nov 2 → Dec 1', () => {
    expect(nextStandardPayoutOnOrAfter(new Date(Date.UTC(2026, 9, 22))).toISOString()).toBe(
      new Date(Date.UTC(2026, 10, 1)).toISOString()
    );
    expect(nextStandardPayoutOnOrAfter(new Date(Date.UTC(2026, 10, 2))).toISOString()).toBe(
      new Date(Date.UTC(2026, 11, 1)).toISOString()
    );
    expect(nextStandardPayoutOnOrAfter(new Date(Date.UTC(2026, 10, 1))).toISOString()).toBe(
      new Date(Date.UTC(2026, 10, 1)).toISOString()
    );
  });

  it('FAST: Oct 13 → Oct 15; Oct 16 → Nov 1; Nov 1 → Nov 1', () => {
    expect(nextFastPayoutOnOrAfter(new Date(Date.UTC(2026, 9, 13))).toISOString()).toBe(
      new Date(Date.UTC(2026, 9, 15)).toISOString()
    );
    expect(nextFastPayoutOnOrAfter(new Date(Date.UTC(2026, 9, 16))).toISOString()).toBe(
      new Date(Date.UTC(2026, 10, 1)).toISOString()
    );
    expect(nextFastPayoutOnOrAfter(new Date(Date.UTC(2026, 10, 1))).toISOString()).toBe(
      new Date(Date.UTC(2026, 10, 1)).toISOString()
    );
  });
});
