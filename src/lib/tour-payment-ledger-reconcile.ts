/**
 * B2B.9.2: Tour payment ↔ ledger reconciliation classifiers (read-only).
 * Pure helpers — no Stripe calls, no mutations.
 */

export type TourPaymentLedgerReconcileFlag =
  | 'missing_snapshot'
  | 'missing_earning'
  | 'duplicate_earning'
  | 'amount_mismatch'
  | 'split_mismatch'
  | 'earning_net_mismatch'
  | 'refunded_still_payable'
  | 'paid_but_reversed'
  | 'failed_or_pending_has_earnings'
  | 'duplicate_payment_intent'
  | 'duplicate_checkout_session';

export type TourPaymentLedgerReconcileInput = {
  paymentStatus?: string | null;
  amountPaidMajor?: number | null;
  /** Snapshot remaining/gross after partials when present; else original gross. */
  grossMinor?: number | null;
  commissionMinor?: number | null;
  supplierMinor?: number | null;
  earningCount?: number | null;
  earningStatus?: string | null;
  earningAmountMinor?: number | null;
  paymentIntentBookingCount?: number | null;
  checkoutSessionBookingCount?: number | null;
};

export type TourPaymentLedgerReconcileResult = {
  flags: TourPaymentLedgerReconcileFlag[];
  reconciliationStatus: 'ok' | 'discrepancy';
};

function payStatus(raw: string | null | undefined): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase();
}

function asInt(n: number | null | undefined): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.trunc(n);
}

/** Convert major currency amount to minor units (matches commercial_amount_to_minor). */
export function tourReconcileMajorToMinor(amount: number | null | undefined): number | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

/**
 * Classify a Tour booking's payment/ledger consistency.
 * Does not mutate records — flags only.
 */
export function classifyTourPaymentLedgerRow(
  input: TourPaymentLedgerReconcileInput
): TourPaymentLedgerReconcileResult {
  const flags: TourPaymentLedgerReconcileFlag[] = [];
  const status = payStatus(input.paymentStatus);
  const paidLike = status === 'paid' || status === 'complete' || status === 'succeeded';
  const refunded = status === 'refunded';
  const unpaidLike = status === 'pending' || status === 'failed' || status === 'authorized';

  const gross = asInt(input.grossMinor);
  const commission = asInt(input.commissionMinor);
  const supplier = asInt(input.supplierMinor);
  const earningCount = asInt(input.earningCount) ?? 0;
  const earningAmount = asInt(input.earningAmountMinor);
  const earningStatus = payStatus(input.earningStatus);
  const paidMinor = tourReconcileMajorToMinor(input.amountPaidMajor);

  const hasSnapshot = gross != null;
  const hasEarning = earningCount > 0;

  if (paidLike || refunded) {
    if (!hasSnapshot) flags.push('missing_snapshot');
    if (earningCount === 0) flags.push('missing_earning');
  }

  if (earningCount > 1) flags.push('duplicate_earning');

  if (paidLike && hasSnapshot && paidMinor != null && gross != null && paidMinor !== gross) {
    flags.push('amount_mismatch');
  }

  if (
    hasSnapshot &&
    gross != null &&
    commission != null &&
    supplier != null &&
    gross !== commission + supplier
  ) {
    flags.push('split_mismatch');
  }

  if (
    paidLike &&
    hasEarning &&
    supplier != null &&
    earningAmount != null &&
    earningStatus !== 'reversed' &&
    earningAmount !== supplier
  ) {
    flags.push('earning_net_mismatch');
  }

  if (refunded && hasEarning) {
    const stillPayable =
      earningStatus !== 'reversed' || (earningAmount != null && earningAmount !== 0);
    if (stillPayable) flags.push('refunded_still_payable');
  }

  if (paidLike && earningStatus === 'reversed') {
    flags.push('paid_but_reversed');
  }

  if (unpaidLike && hasEarning && earningStatus !== 'reversed') {
    flags.push('failed_or_pending_has_earnings');
  }

  const piCount = asInt(input.paymentIntentBookingCount);
  if (piCount != null && piCount > 1) flags.push('duplicate_payment_intent');

  const csCount = asInt(input.checkoutSessionBookingCount);
  if (csCount != null && csCount > 1) flags.push('duplicate_checkout_session');

  return {
    flags,
    reconciliationStatus: flags.length > 0 ? 'discrepancy' : 'ok',
  };
}

export function tourInventoryFamilyIsTour(inventoryFamily: string | null | undefined): boolean {
  const family = String(inventoryFamily ?? '')
    .trim()
    .toLowerCase();
  return family === '' || family === 'tour';
}
