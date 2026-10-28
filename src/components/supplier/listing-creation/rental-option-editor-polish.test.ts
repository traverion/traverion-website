import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { splitGrossByCommissionBps } from '../../../lib/commercial-money';
import { rentalCategoryConfig } from '../../../lib/rental-categories';
import { RENTAL_OPTION_STEPS } from './RentalOptionEditor';

const src = readFileSync(new URL('./RentalOptionEditor.tsx', import.meta.url), 'utf8');

describe('rental option editor polish', () => {
  it('keeps the six-step journey', () => {
    expect(RENTAL_OPTION_STEPS).toEqual([
      'identity',
      'inventory',
      'duration-mode',
      'duration-limits',
      'pricing',
      'review',
    ]);
  });

  it('shows only category attribute keys and prunes stale specs', () => {
    expect(src).toContain('attributeKeys.map');
    expect(src).toContain('pruneRentalVariantAttributes');
    expect(src).toContain('rentalOptionNameReady');
    expect(rentalCategoryConfig('bikes')?.variantAttributeKeys.some((row) => row.key === 'kit')).toBe(false);
    expect(rentalCategoryConfig('cameras_electronics')?.variantAttributeKeys.some((row) => row.key === 'kit')).toBe(
      true,
    );
  });

  it('uses inventory copy and draft vs complete save', () => {
    expect(src).toContain('Number of identical units available for rent.');
    expect(src).toContain('Save draft');
    expect(src).toContain('Save option');
    expect(src).toContain('missingItems');
    expect(src).toContain('CheckCircle2');
  });

  it('adapts pricing to option duration mode and uses supplier commission for earnings', () => {
    expect(src).toContain('effectiveVariantDurationMode');
    expect(src).toContain('duration-mode');
    expect(src).toContain('duration-limits');
    expect(src).toContain("mode === 'hourly'");
    expect(src).toContain("mode === 'both'");
    expect(src).toContain('OptionRateEarnings');
    expect(src).toContain('splitGrossByCommissionBps');
    expect(src).toContain('commissionBps');
    // Same commercial engine as checkout (15% → 1500 bps).
    expect(splitGrossByCommissionBps(10000, 1500)).toEqual({
      grossMinor: 10000,
      commissionBps: 1500,
      commissionMinor: 1500,
      supplierMinor: 8500,
      platformMinor: 1500,
    });
  });
});
