import { describe, expect, it } from 'vitest';
import { COMMERCIAL_PLANS } from './commercial-money';
import {
  formatSupplierEarningsPreview,
  previewSupplierEarningsFromGross,
  SUPPLIER_PRICING_PREVIEW_COMMISSION_BPS,
} from './supplier-pricing-preview';

describe('supplier pricing preview (standard 15%)', () => {
  it('always uses STANDARD commission bps regardless of FAST plan', () => {
    expect(SUPPLIER_PRICING_PREVIEW_COMMISSION_BPS).toBe(COMMERCIAL_PLANS.standard.commissionBps);
    expect(SUPPLIER_PRICING_PREVIEW_COMMISSION_BPS).toBe(1500);
    expect(SUPPLIER_PRICING_PREVIEW_COMMISSION_BPS).not.toBe(COMMERCIAL_PLANS.fast.commissionBps);
  });

  it('splits €99.00 into €14.85 commission and €84.15 supplier', () => {
    const preview = previewSupplierEarningsFromGross(99);
    expect(preview).not.toBeNull();
    expect(preview!.commissionMajor).toBe(14.85);
    expect(preview!.supplierMajor).toBe(84.15);
    expect(preview!.commissionPercentLabel).toBe('15%');
  });

  it('floors commission in minor units (€89.99)', () => {
    const preview = previewSupplierEarningsFromGross(89.99);
    expect(preview).not.toBeNull();
    // floor(8999 * 1500 / 10000) = 1349 → 13.49; supplier 76.50
    expect(preview!.commissionMajor).toBe(13.49);
    expect(preview!.supplierMajor).toBe(76.5);
  });

  it('returns null for empty or non-positive amounts', () => {
    expect(previewSupplierEarningsFromGross(0)).toBeNull();
    expect(previewSupplierEarningsFromGross(-5)).toBeNull();
    expect(formatSupplierEarningsPreview(0, (n) => `€${n}`)).toBe('—');
  });

  it('formats earnings for display', () => {
    expect(formatSupplierEarningsPreview(100, (n) => `€${n.toFixed(2)}`)).toBe('€85.00');
  });
});
