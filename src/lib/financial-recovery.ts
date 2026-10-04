/**
 * Deterministic helpers for refund / recovery economics (integer minor units).
 * Does not invent liability policy — only arithmetic representation.
 */

import { splitGrossByCommissionBps } from './commercial-money';

/** Authoritative remaining economics after cumulative refunds from original gross. */
export function remainingAfterCumulativeRefundMinor(params: {
  originalGrossMinor: number;
  cumulativeRefundMinor: number;
  commissionBps: number;
}): {
  remainingGrossMinor: number;
  commissionMinor: number;
  supplierMinor: number;
  refundedGrossMinor: number;
} {
  const { originalGrossMinor, cumulativeRefundMinor, commissionBps } = params;
  if (!Number.isInteger(originalGrossMinor) || originalGrossMinor < 0) {
    throw new Error('original_gross_invalid');
  }
  if (!Number.isInteger(cumulativeRefundMinor) || cumulativeRefundMinor < 0) {
    throw new Error('refund_invalid');
  }
  if (cumulativeRefundMinor > originalGrossMinor) throw new Error('refund_exceeds_gross');
  const remainingGrossMinor = originalGrossMinor - cumulativeRefundMinor;
  const split = splitGrossByCommissionBps(remainingGrossMinor, commissionBps);
  return {
    remainingGrossMinor,
    commissionMinor: split.commissionMinor,
    supplierMinor: split.supplierMinor,
    refundedGrossMinor: cumulativeRefundMinor,
  };
}

/** Sequential refunds: always recompute from original − cumulative (no drift). */
export function applySequentialRefundsMinor(params: {
  originalGrossMinor: number;
  commissionBps: number;
  refundMinors: number[];
}): {
  remainingGrossMinor: number;
  commissionMinor: number;
  supplierMinor: number;
  steps: ReturnType<typeof remainingAfterCumulativeRefundMinor>[];
} {
  let cumulative = 0;
  const steps: ReturnType<typeof remainingAfterCumulativeRefundMinor>[] = [];
  for (const refund of params.refundMinors) {
    if (!Number.isInteger(refund) || refund < 0) throw new Error('refund_step_invalid');
    cumulative += refund;
    const step = remainingAfterCumulativeRefundMinor({
      originalGrossMinor: params.originalGrossMinor,
      cumulativeRefundMinor: cumulative,
      commissionBps: params.commissionBps,
    });
    steps.push(step);
  }
  const final = remainingAfterCumulativeRefundMinor({
    originalGrossMinor: params.originalGrossMinor,
    cumulativeRefundMinor: cumulative,
    commissionBps: params.commissionBps,
  });
  return { ...final, steps };
}

/**
 * Supplier share delta for post-payout recovery representation.
 * OWNER POLICY decides who ultimately bears the loss.
 */
export function supplierRecoveryDeltaMinor(params: {
  beforeSupplierMinor: number;
  afterSupplierMinor: number;
}): number {
  const delta = params.beforeSupplierMinor - params.afterSupplierMinor;
  if (!Number.isInteger(delta)) throw new Error('delta_must_be_integer');
  return Math.max(delta, 0);
}

/** Earliest eligibility: experienceAt + holdHours. */
export function earliestEligibleAt(experienceAt: Date, holdHours: number): Date {
  if (!Number.isInteger(holdHours) || holdHours < 0) throw new Error('hold_hours_invalid');
  return new Date(experienceAt.getTime() + holdHours * 60 * 60 * 1000);
}

/**
 * Next STANDARD monthly inclusion: first UTC 1st on/after eligible calendar day.
 * Eligible on the 1st → that 1st (inclusive).
 */
export function nextStandardPayoutOnOrAfter(eligibleAt: Date): Date {
  const y = eligibleAt.getUTCFullYear();
  const m = eligibleAt.getUTCMonth();
  const d = eligibleAt.getUTCDate();
  if (d === 1) return new Date(Date.UTC(y, m, 1));
  return new Date(Date.UTC(y, m + 1, 1));
}

/** Next FAST semimonthly inclusion on/after eligible (UTC 1st or 15th). */
export function nextFastPayoutOnOrAfter(eligibleAt: Date): Date {
  const y = eligibleAt.getUTCFullYear();
  const m = eligibleAt.getUTCMonth();
  const d = eligibleAt.getUTCDate();
  if (d <= 1) return new Date(Date.UTC(y, m, 1));
  if (d <= 15) return new Date(Date.UTC(y, m, 15));
  return new Date(Date.UTC(y, m + 1, 1));
}
