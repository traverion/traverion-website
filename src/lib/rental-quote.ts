/**
 * Pure rental quote helpers — server-authoritative building blocks.
 * Not wired to public checkout until inventory holds + payment path ship.
 */

import type { RentalDetails, RentalDurationMode, RentalVariant } from '../types/rental';
import {
  effectiveVariantPricing,
  rentalIllustrativeTotalMinor,
} from './rental-details';
import { splitGrossByCommissionBps } from './commercial-money';

export type RentalQuoteInput = {
  rental: RentalDetails;
  variantId: string;
  quantity: number;
  /** Billable hours (hourly) or calendar/24h days (daily). */
  durationCount: number;
  unit: 'hour' | 'day';
  commissionBps: number;
};

export type RentalQuoteResult =
  | {
      ok: true;
      variant: RentalVariant;
      unitMinor: number;
      durationCount: number;
      quantity: number;
      customerTotalMinor: number;
      commissionMinor: number;
      supplierEarningsMinor: number;
      discountApplied: boolean;
    }
  | { ok: false; error: string };

export function findRentalVariant(rental: RentalDetails, variantId: string): RentalVariant | null {
  return (rental.variants ?? []).find((v) => v.id === variantId) ?? null;
}

export function rentalModeAllowsUnit(mode: RentalDurationMode | undefined, unit: 'hour' | 'day'): boolean {
  const m = mode ?? 'daily';
  if (unit === 'hour') return m === 'hourly' || m === 'both';
  return m === 'daily' || m === 'both';
}

/** Validate duration against listing min/max for the selected unit. */
export function rentalDurationWithinLimits(
  rental: RentalDetails,
  unit: 'hour' | 'day',
  durationCount: number
): string | null {
  if (!(durationCount > 0) || !Number.isFinite(durationCount)) return 'Duration must be greater than zero.';
  if (unit === 'hour') {
    const min = rental.minDurationHours ?? 1;
    const max = rental.maxDurationHours ?? 720;
    if (durationCount < min) return `Minimum rental is ${min} hour${min === 1 ? '' : 's'}.`;
    if (durationCount > max) return `Maximum rental is ${max} hours.`;
    return null;
  }
  const min = rental.minDurationDays ?? 1;
  const max = rental.maxDurationDays ?? 90;
  if (durationCount < min) return `Minimum rental is ${min} day${min === 1 ? '' : 's'}.`;
  if (durationCount > max) return `Maximum rental is ${max} days.`;
  return null;
}

/**
 * Authoritative customer total + commission split for a rental line.
 * Does not check live inventory — callers must verify availability separately.
 */
export function quoteRentalLine(input: RentalQuoteInput): RentalQuoteResult {
  const { rental, variantId, quantity, durationCount, unit, commissionBps } = input;
  if (!rentalModeAllowsUnit(rental.durationMode, unit)) {
    return { ok: false, error: `This rental does not offer ${unit === 'hour' ? 'hourly' : 'daily'} pricing.` };
  }
  const variant = findRentalVariant(rental, variantId);
  if (!variant) return { ok: false, error: 'Rental option not found.' };
  if (!(quantity >= 1) || !Number.isInteger(quantity)) {
    return { ok: false, error: 'Quantity must be a whole number of at least 1.' };
  }
  if (quantity > variant.quantity) {
    return { ok: false, error: `Only ${variant.quantity} unit${variant.quantity === 1 ? '' : 's'} available for this option.` };
  }
  const limitIssue = rentalDurationWithinLimits(rental, unit, durationCount);
  if (limitIssue) return { ok: false, error: limitIssue };

  const pricing = effectiveVariantPricing(rental, variant);
  const unitMinor = unit === 'hour' ? pricing.pricePerHourMinor : pricing.pricePerDayMinor;
  if (unitMinor == null || !(unitMinor > 0)) {
    return { ok: false, error: `No ${unit === 'hour' ? 'hourly' : 'daily'} price configured for this option.` };
  }

  const shared = rental.sharedPricing ?? {};
  const customerTotalMinor = rentalIllustrativeTotalMinor({
    unitMinor,
    units: quantity,
    durationCount,
    mode: unit,
    multiDayDiscountPercent: pricing.multiDayDiscountPercent ?? shared.multiDayDiscountPercent,
    multiDayDiscountMinDays: pricing.multiDayDiscountMinDays ?? shared.multiDayDiscountMinDays,
  });
  const discountApplied =
    unit === 'day' &&
    (pricing.multiDayDiscountPercent ?? shared.multiDayDiscountPercent ?? 0) > 0 &&
    durationCount >= (pricing.multiDayDiscountMinDays ?? shared.multiDayDiscountMinDays ?? 0);

  try {
    const split = splitGrossByCommissionBps(customerTotalMinor, commissionBps);
    return {
      ok: true,
      variant,
      unitMinor,
      durationCount,
      quantity,
      customerTotalMinor,
      commissionMinor: split.commissionMinor,
      supplierEarningsMinor: split.supplierMinor,
      discountApplied,
    };
  } catch {
    return { ok: false, error: 'Could not calculate commission for this quote.' };
  }
}
