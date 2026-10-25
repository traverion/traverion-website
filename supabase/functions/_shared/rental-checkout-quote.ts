/**
 * Server-side rental quote for checkout edge (Deno).
 * Mirrors src/lib/rental-quote.ts — keep logic aligned when changing either side.
 */

import { splitGrossByCommissionBps } from './commercial-money.ts';

type RentalPricingSlice = {
  pricePerHourMinor?: unknown;
  pricePerDayMinor?: unknown;
  multiDayDiscountPercent?: unknown;
  multiDayDiscountMinDays?: unknown;
};

type RentalVariant = {
  id?: unknown;
  quantity?: unknown;
  /** Authoritative variant price override (matches client `pricingOverride`). */
  pricingOverride?: RentalPricingSlice | null;
  /** Legacy alias — prefer pricingOverride. */
  pricing?: RentalPricingSlice;
};

type RentalExtras = {
  durationMode?: unknown;
  minDurationHours?: unknown;
  maxDurationHours?: unknown;
  minDurationDays?: unknown;
  maxDurationDays?: unknown;
  sharedPricing?: RentalPricingSlice;
  variants?: unknown;
  depositDisclosure?: unknown;
  deposit?: { disclosure?: unknown; amountMinor?: unknown; type?: unknown };
};

function asInt(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.round(n);
}

function illustrativeTotalMinor(args: {
  unitMinor: number;
  units: number;
  durationCount: number;
  mode: 'hour' | 'day';
  multiDayDiscountPercent?: number | null;
  multiDayDiscountMinDays?: number | null;
}): number {
  let gross = Math.round(args.unitMinor * args.units * args.durationCount);
  if (args.mode === 'day') {
    const pct = args.multiDayDiscountPercent ?? 0;
    const minDays = args.multiDayDiscountMinDays ?? 0;
    if (pct > 0 && args.durationCount >= minDays) {
      gross = Math.round(gross * (1 - Math.min(90, pct) / 100));
    }
  }
  return Math.max(0, gross);
}

export type RentalCheckoutQuoteOk = {
  ok: true;
  variantId: string;
  quantity: number;
  durationCount: number;
  durationUnit: 'hour' | 'day';
  unitMinor: number;
  customerTotalMinor: number;
  commissionMinor: number;
  supplierEarningsMinor: number;
  discountApplied: boolean;
  depositDisclosure: string | null;
};

export type RentalCheckoutQuoteResult = RentalCheckoutQuoteOk | { ok: false; error: string };

export function quoteRentalCheckoutLine(input: {
  rentalExtras: unknown;
  variantId: string;
  quantity: number;
  durationCount: number;
  durationUnit: 'hour' | 'day';
  commissionBps: number;
}): RentalCheckoutQuoteResult {
  const rental =
    input.rentalExtras && typeof input.rentalExtras === 'object'
      ? (input.rentalExtras as RentalExtras)
      : null;
  if (!rental) return { ok: false, error: 'Rental configuration missing.' };

  const mode = typeof rental.durationMode === 'string' ? rental.durationMode : 'daily';
  if (input.durationUnit === 'hour' && mode !== 'hourly' && mode !== 'both') {
    return { ok: false, error: 'This rental does not offer hourly pricing.' };
  }
  if (input.durationUnit === 'day' && mode !== 'daily' && mode !== 'both') {
    return { ok: false, error: 'This rental does not offer daily pricing.' };
  }

  const variants = Array.isArray(rental.variants) ? (rental.variants as RentalVariant[]) : [];
  const variant = variants.find((v) => typeof v.id === 'string' && v.id === input.variantId);
  if (!variant) return { ok: false, error: 'Rental option not found.' };

  const stock = asInt(variant.quantity) ?? 0;
  if (!(input.quantity >= 1) || !Number.isInteger(input.quantity)) {
    return { ok: false, error: 'Quantity must be a whole number of at least 1.' };
  }
  if (input.quantity > stock) {
    return { ok: false, error: `Only ${stock} unit${stock === 1 ? '' : 's'} available for this option.` };
  }

  if (!(input.durationCount > 0) || !Number.isFinite(input.durationCount)) {
    return { ok: false, error: 'Duration must be greater than zero.' };
  }
  if (input.durationUnit === 'hour') {
    const min = asInt(rental.minDurationHours) ?? 1;
    const max = asInt(rental.maxDurationHours) ?? 720;
    if (input.durationCount < min) return { ok: false, error: `Minimum rental is ${min} hour${min === 1 ? '' : 's'}.` };
    if (input.durationCount > max) return { ok: false, error: `Maximum rental is ${max} hours.` };
  } else {
    const min = asInt(rental.minDurationDays) ?? 1;
    const max = asInt(rental.maxDurationDays) ?? 90;
    if (input.durationCount < min) return { ok: false, error: `Minimum rental is ${min} day${min === 1 ? '' : 's'}.` };
    if (input.durationCount > max) return { ok: false, error: `Maximum rental is ${max} days.` };
  }

  // Match client effectiveVariantPricing: override → shared (never silent null).
  const override =
    variant.pricingOverride && typeof variant.pricingOverride === 'object'
      ? variant.pricingOverride
      : variant.pricing && typeof variant.pricing === 'object'
        ? variant.pricing
        : {};
  const shared = rental.sharedPricing ?? {};
  const unitMinor =
    input.durationUnit === 'hour'
      ? asInt(override.pricePerHourMinor) ?? asInt(shared.pricePerHourMinor)
      : asInt(override.pricePerDayMinor) ?? asInt(shared.pricePerDayMinor);
  if (unitMinor == null || !(unitMinor > 0)) {
    return {
      ok: false,
      error: `No ${input.durationUnit === 'hour' ? 'hourly' : 'daily'} price configured for this option.`,
    };
  }

  const multiDayDiscountPercent =
    asInt(override.multiDayDiscountPercent) ?? asInt(shared.multiDayDiscountPercent);
  const multiDayDiscountMinDays =
    asInt(override.multiDayDiscountMinDays) ?? asInt(shared.multiDayDiscountMinDays);

  const customerTotalMinor = illustrativeTotalMinor({
    unitMinor,
    units: input.quantity,
    durationCount: input.durationCount,
    mode: input.durationUnit,
    multiDayDiscountPercent,
    multiDayDiscountMinDays,
  });

  const discountApplied =
    input.durationUnit === 'day' &&
    (multiDayDiscountPercent ?? 0) > 0 &&
    input.durationCount >= (multiDayDiscountMinDays ?? 0);

  try {
    const split = splitGrossByCommissionBps(customerTotalMinor, input.commissionBps);
    const depositDisclosure =
      typeof rental.depositDisclosure === 'string' && rental.depositDisclosure.trim()
        ? rental.depositDisclosure.trim()
        : typeof rental.deposit?.disclosure === 'string' && rental.deposit.disclosure.trim()
          ? rental.deposit.disclosure.trim()
          : null;
    return {
      ok: true,
      variantId: input.variantId,
      quantity: input.quantity,
      durationCount: input.durationCount,
      durationUnit: input.durationUnit,
      unitMinor,
      customerTotalMinor,
      commissionMinor: split.commissionMinor,
      supplierEarningsMinor: split.supplierMinor,
      discountApplied,
      depositDisclosure,
    };
  } catch {
    return { ok: false, error: 'Could not calculate commission for this quote.' };
  }
}
