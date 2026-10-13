/**
 * Supplier-facing pricing preview for listing/schedule editors.
 * Always uses STANDARD 15% Traverion commission for display — independent of
 * payout cadence (monthly vs twice-monthly) or negotiated account terms.
 * Backend settlement remains authoritative.
 */

import {
  COMMERCIAL_PLANS,
  formatBpsAsPercent,
  fromMinorUnits,
  splitGrossByCommissionBps,
  toMinorUnits,
} from './commercial-money';

/** Fixed preview rate: Traverion standard plan (15%). */
export const SUPPLIER_PRICING_PREVIEW_COMMISSION_BPS = COMMERCIAL_PLANS.standard.commissionBps;

export type SupplierPricingPreview = {
  grossMajor: number;
  commissionMajor: number;
  supplierMajor: number;
  commissionBps: number;
  commissionPercentLabel: string;
};

/**
 * Split a customer-facing gross major amount into commission + supplier earnings
 * using the standard 15% preview rate. Returns null for empty/invalid/non-positive.
 */
export function previewSupplierEarningsFromGross(grossMajor: number): SupplierPricingPreview | null {
  if (!Number.isFinite(grossMajor) || grossMajor <= 0) return null;
  try {
    const grossMinor = toMinorUnits(grossMajor);
    const split = splitGrossByCommissionBps(grossMinor, SUPPLIER_PRICING_PREVIEW_COMMISSION_BPS);
    return {
      grossMajor: fromMinorUnits(split.grossMinor),
      commissionMajor: fromMinorUnits(split.commissionMinor),
      supplierMajor: fromMinorUnits(split.supplierMinor),
      commissionBps: split.commissionBps,
      commissionPercentLabel: formatBpsAsPercent(split.commissionBps),
    };
  } catch {
    return null;
  }
}

/** Compact label for read-only earnings fields. */
export function formatSupplierEarningsPreview(
  grossMajor: number,
  formatAmount: (n: number) => string
): string {
  const preview = previewSupplierEarningsFromGross(grossMajor);
  if (!preview) return '—';
  return formatAmount(preview.supplierMajor);
}
