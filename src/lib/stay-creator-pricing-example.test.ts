import { describe, expect, it } from 'vitest';
import { formatBpsAsPercent, splitGrossByCommissionBps, toMinorUnits } from './commercial-money';

/** Mirrors the Stay Creator one-night earnings example (step 16). */
function oneNightEarningsExample(nightly: number, commissionBps: number) {
  const split = splitGrossByCommissionBps(toMinorUnits(nightly), commissionBps);
  return {
    guestPays: split.grossMinor / 100,
    commissionLabel: formatBpsAsPercent(split.commissionBps),
    commission: split.commissionMinor / 100,
    supplierReceives: split.supplierMinor / 100,
  };
}

describe('stay creator one-night pricing example', () => {
  it('splits €88 at 15% without folding cleaning into the example', () => {
    const example = oneNightEarningsExample(88, 1500);
    expect(example.guestPays).toBe(88);
    expect(example.commissionLabel).toMatch(/15/);
    expect(example.commission).toBe(13.2);
    expect(example.supplierReceives).toBe(74.8);
  });

  it('uses the supplier commission rate, not a hardcoded 15%', () => {
    const custom = oneNightEarningsExample(100, 1800);
    expect(custom.commission).toBe(18);
    expect(custom.supplierReceives).toBe(82);
  });
});
