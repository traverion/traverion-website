/**
 * Traverion commercial money engine V1 — pure deterministic helpers.
 * All money math uses integer minor units (cents). Never use floats for money.
 *
 * Rounding: commission_minor = floor(gross_minor * bps / 10000);
 * supplier_minor = gross_minor - commission_minor;
 * ⇒ platform + supplier = gross exactly.
 */

export const COMMERCIAL_POLICY_ID = 'traverion_commercial_v1' as const;

export type CommercialPlanCode = 'standard' | 'fast' | 'custom';
export type PayoutCadence = 'monthly' | 'semimonthly';

export type CommercialPlanDefinition = {
  code: CommercialPlanCode;
  label: string;
  /** Basis points: 1500 = 15.00% */
  commissionBps: number;
  payoutCadence: PayoutCadence;
  /** Intended run days of month (1-based). */
  payoutRunDays: readonly number[];
  supplierFacingSummary: string;
};

/** Authoritative plan catalog. Custom negotiated rates use plan code `custom` + explicit bps. */
export const COMMERCIAL_PLANS: Readonly<Record<'standard' | 'fast', CommercialPlanDefinition>> = {
  standard: {
    code: 'standard',
    label: 'Standard',
    commissionBps: 1500,
    payoutCadence: 'monthly',
    payoutRunDays: [1],
    supplierFacingSummary: '15% commission · Monthly payouts (1st)',
  },
  fast: {
    code: 'fast',
    label: 'Fast payout',
    commissionBps: 1800,
    payoutCadence: 'semimonthly',
    payoutRunDays: [1, 15],
    supplierFacingSummary: '18% commission · Twice-monthly payouts (1st & 15th)',
  },
} as const;

export function planDefinition(code: string | null | undefined): CommercialPlanDefinition | null {
  const c = String(code ?? '')
    .trim()
    .toLowerCase();
  if (c === 'standard' || c === 'fast') return COMMERCIAL_PLANS[c];
  return null;
}

export function assertValidCommissionBps(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
    throw new Error('commission_bps must be an integer from 0 to 10000');
  }
}

/** Convert major-unit decimal string/number to minor units (cents). Exact for ≤2dp. */
export function toMinorUnits(major: number | string): number {
  const n = typeof major === 'number' ? major : Number(String(major).trim());
  if (!Number.isFinite(n) || n < 0) throw new Error('invalid_major_amount');
  return Math.round(n * 100);
}

export function fromMinorUnits(minor: number): number {
  if (!Number.isInteger(minor)) throw new Error('minor_must_be_integer');
  return minor / 100;
}

export type SplitResult = {
  grossMinor: number;
  commissionBps: number;
  commissionMinor: number;
  supplierMinor: number;
  platformMinor: number;
};

/**
 * Deterministic split. Commission is floored in minor units; remainder stays with supplier.
 */
export function splitGrossByCommissionBps(grossMinor: number, commissionBps: number): SplitResult {
  if (!Number.isInteger(grossMinor) || grossMinor < 0) {
    throw new Error('gross_minor_invalid');
  }
  assertValidCommissionBps(commissionBps);
  const commissionMinor = Math.floor((grossMinor * commissionBps) / 10000);
  const supplierMinor = grossMinor - commissionMinor;
  return {
    grossMinor,
    commissionBps,
    commissionMinor,
    supplierMinor,
    platformMinor: commissionMinor,
  };
}

/** Recompute split after an authoritative remaining gross (partial refund). */
export function splitRemainingGross(remainingGrossMinor: number, commissionBps: number): SplitResult {
  return splitGrossByCommissionBps(remainingGrossMinor, commissionBps);
}

export type UtcYmd = { y: number; m: number; d: number };

export function utcYmdFromDate(d: Date): UtcYmd {
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

export function utcDateFromYmd(ymd: UtcYmd): Date {
  return new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, 0, 0, 0, 0));
}

function daysInUtcMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function clampDay(y: number, m: number, day: number): number {
  return Math.min(day, daysInUtcMonth(y, m));
}

/**
 * Next payout run date (UTC calendar) for a cadence, strictly after `now`
 * unless `now` falls on a run day (then that day is returned — inclusive due).
 */
export function nextPayoutRunDateUtc(params: {
  cadence: PayoutCadence;
  now: Date;
  runDays?: readonly number[];
}): Date {
  const runDays = [...(params.runDays ?? (params.cadence === 'monthly' ? [1] : [1, 15]))].sort(
    (a, b) => a - b
  );
  const ymd = utcYmdFromDate(params.now);
  for (const day of runDays) {
    const candidateDay = clampDay(ymd.y, ymd.m, day);
    if (ymd.d <= candidateDay) {
      return utcDateFromYmd({ y: ymd.y, m: ymd.m, d: candidateDay });
    }
  }
  // Next month first run day
  let y = ymd.y;
  let m = ymd.m + 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  const day = clampDay(y, m, runDays[0]!);
  return utcDateFromYmd({ y, m, d: day });
}

/** Period key for a scheduled run date: YYYY-MM-DD (the run day). */
export function payoutPeriodKey(scheduledFor: Date): string {
  const { y, m, d } = utcYmdFromDate(scheduledFor);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Inclusive earnings window for a run: from previous run (exclusive) to this run (inclusive),
 * measured on eligible_at. For monthly 1st: prior month 1st 00:00 UTC → this 1st.
 * Simplified V1: period_end = scheduled_for; period_start = previous run day.
 */
export function payoutPeriodBoundsUtc(params: {
  cadence: PayoutCadence;
  scheduledFor: Date;
  runDays?: readonly number[];
}): { periodStart: Date; periodEnd: Date; periodKey: string } {
  const runDays = [...(params.runDays ?? (params.cadence === 'monthly' ? [1] : [1, 15]))].sort(
    (a, b) => a - b
  );
  const end = params.scheduledFor;
  const endYmd = utcYmdFromDate(end);
  // Find previous run day before scheduledFor
  let start: Date | null = null;
  for (let i = runDays.length - 1; i >= 0; i--) {
    const day = clampDay(endYmd.y, endYmd.m, runDays[i]!);
    if (day < endYmd.d) {
      start = utcDateFromYmd({ y: endYmd.y, m: endYmd.m, d: day });
      break;
    }
  }
  if (!start) {
    let y = endYmd.y;
    let m = endYmd.m - 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    const day = clampDay(y, m, runDays[runDays.length - 1]!);
    start = utcDateFromYmd({ y, m, d: day });
  }
  return {
    periodStart: start,
    periodEnd: end,
    periodKey: payoutPeriodKey(end),
  };
}

export function formatBpsAsPercent(bps: number): string {
  assertValidCommissionBps(bps);
  const whole = Math.floor(bps / 100);
  const frac = bps % 100;
  if (frac === 0) return `${whole}%`;
  const fracStr = String(frac).padStart(2, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}%`;
}
