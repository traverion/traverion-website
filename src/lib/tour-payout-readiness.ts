/**
 * B2B.9.3: Tour supplier payout readiness classifiers (read-only).
 * Composes Phase 5 eligibility + B2B.9.2 ledger reconcile. No Stripe / mutations.
 */

import {
  classifyTourPaymentLedgerRow,
  tourInventoryFamilyIsTour,
  type TourPaymentLedgerReconcileFlag,
  type TourPaymentLedgerReconcileInput,
} from './tour-payment-ledger-reconcile';

export type TourPayoutBlockReason =
  | 'not_tour'
  | 'invalid_supplier'
  | 'missing_earning'
  | 'missing_snapshot'
  | 'unreconciled'
  | 'payment_not_confirmed'
  | 'payment_refunded'
  | 'payment_unknown'
  | 'booking_cancelled'
  | 'booking_status_unknown'
  | 'service_not_completed'
  | 'hold_period_active'
  | 'tour_fulfillment_not_attested'
  | 'no_show'
  | 'fulfillment_disputed'
  | 'blocked_by_policy'
  | 'disputed'
  | 'already_paid'
  | 'already_included'
  | 'reversed'
  | 'zero_or_negative_amount'
  | 'duplicate_earning'
  | 'unknown_earning_status'
  | TourPaymentLedgerReconcileFlag;

export type TourPayoutBalanceBucket =
  | 'eligible'
  | 'pending_not_eligible'
  | 'held'
  | 'already_paid'
  | 'reversed'
  | 'ineligible';

export type TourPayoutReadinessInput = TourPaymentLedgerReconcileInput & {
  inventoryFamily?: string | null;
  supplierId?: string | null;
  bookingStatus?: string | null;
  disputeStatus?: string | null;
  earningStatus?: string | null;
  earningAmountMinor?: number | null;
  serviceCompletedAt?: string | null;
  eligibleAt?: string | null;
  /** scheduled | in_progress | completed | no_show | disputed */
  serviceFulfillmentStatus?: string | null;
  blocksPayout?: boolean | null;
  nowIso?: string | null;
  /** When false/unknown, fail closed. */
  supplierExists?: boolean | null;
};

export type TourPayoutReadinessResult = {
  ready: boolean;
  bucket: TourPayoutBalanceBucket;
  blockingReasons: TourPayoutBlockReason[];
  reconcileFlags: TourPaymentLedgerReconcileFlag[];
  reconciliationStatus: 'ok' | 'discrepancy';
};

/** Documented gaps — readiness refuses to invent policy; surfaces these instead. */
export const TOUR_PAYOUT_MISSING_POLICIES = [
  'no_show_and_dispute_commercial_settlement_policy_undefined_payouts_remain_held',
  'payout_execution_disabled_until_separately_authorized',
] as const;

function norm(raw: string | null | undefined): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase();
}

function asInt(n: number | null | undefined): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseIso(iso: string | null | undefined): number | null {
  if (!iso || typeof iso !== 'string') return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

const PAID_LIKE = new Set(['paid', 'complete', 'succeeded']);
const KNOWN_BOOKING = new Set([
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
  'refunded',
]);
const KNOWN_PAY = new Set([
  'pending',
  'authorized',
  'paid',
  'complete',
  'succeeded',
  'failed',
  'refunded',
]);
const KNOWN_EARNING = new Set(['pending', 'eligible', 'included', 'paid', 'reversed']);
const DISPUTE_BLOCK = new Set(['open', 'needs_response', 'under_review', 'lost']);

/**
 * Classify one Tour earning/booking for payout readiness (fail closed).
 */
export function classifyTourPayoutReadiness(
  input: TourPayoutReadinessInput
): TourPayoutReadinessResult {
  const reasons: TourPayoutBlockReason[] = [];
  const nowMs = parseIso(input.nowIso) ?? Date.now();

  if (!tourInventoryFamilyIsTour(input.inventoryFamily)) {
    reasons.push('not_tour');
  }

  const supplierId = String(input.supplierId ?? '').trim();
  if (!supplierId) {
    reasons.push('invalid_supplier');
  } else if (input.supplierExists === false) {
    reasons.push('invalid_supplier');
  }

  const reconcile = classifyTourPaymentLedgerRow(input);
  const reconcileFlags = reconcile.flags;
  for (const f of reconcileFlags) {
    if (!reasons.includes(f)) reasons.push(f);
  }
  if (reconcile.reconciliationStatus === 'discrepancy') {
    if (!reasons.includes('unreconciled')) reasons.push('unreconciled');
  }

  const pay = norm(input.paymentStatus);
  const booking = norm(input.bookingStatus);
  const dispute = norm(input.disputeStatus);
  const fulfillment = norm(input.serviceFulfillmentStatus);
  const earningStatus = norm(input.earningStatus);
  const amount = asInt(input.earningAmountMinor);

  if (!pay) {
    reasons.push('payment_unknown');
  } else if (!KNOWN_PAY.has(pay)) {
    reasons.push('payment_unknown');
  } else if (pay === 'refunded') {
    reasons.push('payment_refunded');
  } else if (!PAID_LIKE.has(pay)) {
    reasons.push('payment_not_confirmed');
  }

  if (!booking) {
    reasons.push('booking_status_unknown');
  } else if (!KNOWN_BOOKING.has(booking)) {
    reasons.push('booking_status_unknown');
  } else if (booking === 'cancelled') {
    reasons.push('booking_cancelled');
  } else if (booking === 'no_show') {
    reasons.push('no_show');
  }

  if (tourInventoryFamilyIsTour(input.inventoryFamily)) {
    if (fulfillment === 'no_show') {
      reasons.push('no_show');
    } else if (fulfillment === 'disputed') {
      reasons.push('fulfillment_disputed');
    } else if (fulfillment !== 'completed') {
      // Tours require explicit attestation — never duration-only.
      reasons.push('tour_fulfillment_not_attested');
    }
  }

  if (DISPUTE_BLOCK.has(dispute)) {
    reasons.push('disputed');
  }

  if (input.blocksPayout === true) {
    reasons.push('blocked_by_policy');
  }

  if (!earningStatus) {
    reasons.push('missing_earning');
  } else if (!KNOWN_EARNING.has(earningStatus)) {
    reasons.push('unknown_earning_status');
  }

  if (earningStatus === 'reversed') {
    reasons.push('reversed');
  }
  if (earningStatus === 'paid') {
    reasons.push('already_paid');
  }
  if (earningStatus === 'included') {
    reasons.push('already_included');
  }

  if (amount == null || amount <= 0) {
    if (earningStatus !== 'reversed') {
      reasons.push('zero_or_negative_amount');
    }
  }

  const completedMs = parseIso(input.serviceCompletedAt);
  const eligibleMs = parseIso(input.eligibleAt);
  if (completedMs == null || completedMs > nowMs) {
    reasons.push('service_not_completed');
  }
  if (eligibleMs == null || eligibleMs > nowMs) {
    reasons.push('hold_period_active');
  }

  // Fail closed if supplier existence unknown and we have an id — treat as ok only when true/undefined with id.
  // (undefined means caller did not check; SQL always checks.)

  const uniqueReasons = Array.from(new Set(reasons));

  let bucket: TourPayoutBalanceBucket = 'ineligible';
  if (earningStatus === 'reversed' || uniqueReasons.includes('reversed')) {
    bucket = 'reversed';
  } else if (earningStatus === 'paid' || earningStatus === 'included') {
    bucket = 'already_paid';
  } else if (
    uniqueReasons.some((r) =>
      [
        'not_tour',
        'invalid_supplier',
        'missing_earning',
        'missing_snapshot',
        'unreconciled',
        'payment_not_confirmed',
        'payment_refunded',
        'payment_unknown',
        'booking_cancelled',
        'booking_status_unknown',
        'blocked_by_policy',
        'disputed',
        'no_show',
        'fulfillment_disputed',
        'tour_fulfillment_not_attested',
        'duplicate_earning',
        'zero_or_negative_amount',
        'unknown_earning_status',
        'amount_mismatch',
        'split_mismatch',
        'earning_net_mismatch',
        'refunded_still_payable',
        'paid_but_reversed',
        'failed_or_pending_has_earnings',
        'duplicate_payment_intent',
        'duplicate_checkout_session',
      ].includes(r)
    )
  ) {
    bucket = 'held';
  } else if (
    uniqueReasons.includes('service_not_completed') ||
    uniqueReasons.includes('hold_period_active')
  ) {
    bucket = 'pending_not_eligible';
  } else if (uniqueReasons.length === 0 || onlyTimingCleared(uniqueReasons)) {
    bucket = 'eligible';
  } else {
    bucket = 'held';
  }

  const ready = bucket === 'eligible';

  return {
    ready,
    bucket: ready ? 'eligible' : bucket,
    blockingReasons: ready ? [] : uniqueReasons,
    reconcileFlags,
    reconciliationStatus: reconcile.reconciliationStatus,
  };
}

function onlyTimingCleared(reasons: TourPayoutBlockReason[]): boolean {
  return reasons.every((r) => r === 'service_not_completed' || r === 'hold_period_active');
}

export type TourPayoutSupplierBalanceInput = {
  currency: string;
  amountMinor: number;
  bucket: TourPayoutBalanceBucket;
};

export type TourPayoutSupplierBalance = {
  currency: string;
  totalEarnedMinor: number;
  pendingNotEligibleMinor: number;
  eligibleForPayoutMinor: number;
  heldDisputedMinor: number;
  alreadyPaidMinor: number;
};

/** Aggregate balances for one currency — never mixes currencies. */
export function aggregateTourPayoutBalances(
  rows: TourPayoutSupplierBalanceInput[]
): TourPayoutSupplierBalance {
  const currency = String(rows[0]?.currency ?? 'EUR').toUpperCase();
  let totalEarnedMinor = 0;
  let pendingNotEligibleMinor = 0;
  let eligibleForPayoutMinor = 0;
  let heldDisputedMinor = 0;
  let alreadyPaidMinor = 0;

  for (const row of rows) {
    if (String(row.currency ?? '').toUpperCase() !== currency) {
      throw new Error('aggregateTourPayoutBalances refuses mixed currencies');
    }
    const amt = Math.trunc(Number(row.amountMinor) || 0);
    if (row.bucket === 'reversed') continue;
    totalEarnedMinor += amt;
    if (row.bucket === 'pending_not_eligible') pendingNotEligibleMinor += amt;
    else if (row.bucket === 'eligible') eligibleForPayoutMinor += amt;
    else if (row.bucket === 'held' || row.bucket === 'ineligible') heldDisputedMinor += amt;
    else if (row.bucket === 'already_paid') alreadyPaidMinor += amt;
  }

  return {
    currency,
    totalEarnedMinor,
    pendingNotEligibleMinor,
    eligibleForPayoutMinor,
    heldDisputedMinor,
    alreadyPaidMinor,
  };
}
