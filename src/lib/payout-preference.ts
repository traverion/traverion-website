import { COMMERCIAL_PLANS, formatBpsAsPercent } from './commercial-money';

export type PayoutCyclePreference = 'monthly' | 'biweekly';

/** Catalog rates for the two supplier-facing preferences. Not a supplier's contract. */
export function catalogPayoutRates() {
  const standardBps = COMMERCIAL_PLANS.standard.commissionBps;
  const twiceMonthlyBps = COMMERCIAL_PLANS.fast.commissionBps;
  return {
    standardBps,
    twiceMonthlyBps,
    extraBps: twiceMonthlyBps - standardBps,
    standardLabel: formatBpsAsPercent(standardBps),
    twiceMonthlyLabel: formatBpsAsPercent(twiceMonthlyBps),
  };
}

export function catalogRateForPreference(preference: PayoutCyclePreference): number {
  const rates = catalogPayoutRates();
  return preference === 'biweekly' ? rates.twiceMonthlyBps : rates.standardBps;
}

/** Twice-a-month pricing adds three percentage points to the supplier's own agreement rate. */
export const PAYOUT_FREQUENCY_EXTRA_BPS = 300;

/**
 * The surcharge is quoted in Settings. It is not applied to settlement, past bookings,
 * or payout execution until pricing approval is explicit.
 */
export const PAYOUT_FREQUENCY_SURCHARGE_APPROVED = false;

export type PayoutFrequencyQuote =
  | {
      available: true;
      standardBps: number;
      monthlyTotalBps: number;
      twiceMonthlyExtraBps: number;
      twiceMonthlyTotalBps: number;
    }
  | { available: false };

/** Quote from the supplier's stored agreement rate. A missing rate stays unavailable. */
export function payoutFrequencyQuote(standardBps: number | null | undefined): PayoutFrequencyQuote {
  if (typeof standardBps !== 'number' || !Number.isInteger(standardBps) || standardBps < 0 || standardBps > 10000) {
    return { available: false };
  }
  const twiceMonthlyTotalBps = standardBps + PAYOUT_FREQUENCY_EXTRA_BPS;
  if (twiceMonthlyTotalBps > 10000) return { available: false };
  return {
    available: true,
    standardBps,
    monthlyTotalBps: standardBps,
    twiceMonthlyExtraBps: PAYOUT_FREQUENCY_EXTRA_BPS,
    twiceMonthlyTotalBps,
  };
}

/**
 * Commission used for money movement. Unapproved frequency pricing keeps the agreement rate.
 */
export function settlementCommissionBps(input: {
  agreementBps: number | null | undefined;
  cycle: PayoutCyclePreference;
  surchargeApproved?: boolean;
}): number | null {
  const quote = payoutFrequencyQuote(input.agreementBps);
  if (!quote.available) return null;
  const approved = input.surchargeApproved ?? PAYOUT_FREQUENCY_SURCHARGE_APPROVED;
  if (!approved || input.cycle === 'monthly') return quote.standardBps;
  return quote.twiceMonthlyTotalBps;
}

/**
 * Minimum balance preference in major units. Empty means no minimum.
 * Does not start a payout.
 */
export function parsePayoutThreshold(raw: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return { ok: false, error: 'Enter a minimum of 0 or more, with up to two decimal places.' };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) {
    return { ok: false, error: 'Enter a minimum between 0 and 1,000,000.' };
  }
  return { ok: true, value };
}
