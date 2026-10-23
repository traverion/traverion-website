/** Supplier-facing payout account labels. Never equate transfer success with bank paid. */

export type ConnectOnboardingStatus =
  | 'not_started'
  | 'pending'
  | 'restricted'
  | 'complete'
  | 'rejected';

export type ConnectLifecycle =
  | 'internal_only'
  | 'transfer_pending'
  | 'transfer_completed'
  | 'bank_payout_pending'
  | 'bank_payout_paid'
  | 'bank_payout_failed'
  | 'failed'
  | 'reversed';

/** Single clear status for the payout account summary. */
export function connectOnboardingLabel(status: string | null | undefined): string {
  switch ((status ?? 'not_started').toLowerCase()) {
    case 'complete':
      return 'Verified';
    case 'pending':
      return 'Under review';
    case 'restricted':
      return 'Action required';
    case 'rejected':
      return 'Restricted';
    default:
      return 'Not started';
  }
}

export function connectCanReceiveTransfers(input: {
  connect_payouts_enabled?: boolean | null;
  connect_onboarding_status?: string | null;
  connect_requirements_currently_due?: unknown;
  connect_requirements_past_due?: unknown;
}): boolean {
  if (!input.connect_payouts_enabled) return false;
  const status = (input.connect_onboarding_status ?? '').toLowerCase();
  if (status === 'restricted' || status === 'rejected') return false;
  const due = Array.isArray(input.connect_requirements_currently_due)
    ? input.connect_requirements_currently_due
    : [];
  const past = Array.isArray(input.connect_requirements_past_due)
    ? input.connect_requirements_past_due
    : [];
  if (due.length > 0 || past.length > 0) return false;
  return status === 'complete';
}

/**
 * Compact payout row label. Prefer Connect lifecycle when present;
 * never show "Paid to bank" from transfer_completed alone.
 */
export function connectPayoutPresentationStatus(input: {
  periodStatus: string;
  paidAt?: string | null;
  connectLifecycle?: string | null;
}): string {
  const life = (input.connectLifecycle ?? 'internal_only').toLowerCase();
  if (life === 'bank_payout_paid') return 'Paid to bank';
  if (life === 'bank_payout_pending') return 'Bank payout in progress';
  if (life === 'bank_payout_failed') return 'Bank payout failed';
  if (life === 'transfer_completed') return 'Sent to payout account';
  if (life === 'transfer_pending') return 'Processing transfer';
  if (life === 'failed') return 'Failed or restricted';
  if (life === 'reversed') return 'Reversed';
  if (input.periodStatus === 'ready') return 'Upcoming payout';
  if (input.periodStatus === 'paid' && input.paidAt) return 'Paid (manual record)';
  if (input.periodStatus === 'paid') return 'Recorded (unconfirmed)';
  if (input.periodStatus === 'processing') return 'Processing transfer';
  if (input.periodStatus === 'failed') return 'Failed or restricted';
  return 'Prepared';
}

export function payoutBlockReason(input: {
  connect_onboarding_status?: string | null;
  connect_payouts_enabled?: boolean | null;
  connect_disabled_reason?: string | null;
  connect_requirements_currently_due?: unknown;
  financialHold?: boolean;
  debtMinor?: number;
}): string | null {
  if (input.financialHold) return 'A financial hold is active on one or more bookings.';
  if ((input.debtMinor ?? 0) > 0) {
    return 'Outstanding recovery balance will be netted from the next payout.';
  }
  const status = (input.connect_onboarding_status ?? 'not_started').toLowerCase();
  if (status === 'not_started') return 'Complete verification to receive automatic payouts.';
  if (status === 'pending') return 'Additional verification is still in progress.';
  if (status === 'restricted') {
    const due = Array.isArray(input.connect_requirements_currently_due)
      ? input.connect_requirements_currently_due.length
      : 0;
    if (due > 0) return `${due} verification requirement${due === 1 ? '' : 's'} still due.`;
    return input.connect_disabled_reason?.trim() || 'Payout account needs attention.';
  }
  if (status === 'rejected') return 'Payout account needs attention. Contact Traverion support.';
  if (!input.connect_payouts_enabled) return 'Payouts not enabled yet.';
  return null;
}
