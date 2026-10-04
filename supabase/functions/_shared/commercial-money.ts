/** Edge copy of commercial money helpers (keep in sync with src/lib/commercial-money.ts). */

export const COMMERCIAL_POLICY_ID = 'traverion_commercial_v1';

export type PayoutCadence = 'monthly' | 'semimonthly';

export const COMMERCIAL_PLANS = {
  standard: { code: 'standard', commissionBps: 1500, payoutCadence: 'monthly' as const, payoutRunDays: [1] },
  fast: { code: 'fast', commissionBps: 1800, payoutCadence: 'semimonthly' as const, payoutRunDays: [1, 15] },
} as const;

export function splitGrossByCommissionBps(grossMinor: number, commissionBps: number) {
  if (!Number.isInteger(grossMinor) || grossMinor < 0) throw new Error('gross_minor_invalid');
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10000) {
    throw new Error('commission_bps_invalid');
  }
  const commissionMinor = Math.floor((grossMinor * commissionBps) / 10000);
  const supplierMinor = grossMinor - commissionMinor;
  return { grossMinor, commissionBps, commissionMinor, supplierMinor, platformMinor: commissionMinor };
}

export function toMinorUnits(major: number): number {
  if (!Number.isFinite(major) || major < 0) throw new Error('invalid_major_amount');
  return Math.round(major * 100);
}
