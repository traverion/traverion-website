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
