import type { SupplierProfileRow } from '../data/supabase-supplier-profile';
import { connectCanReceiveTransfers } from './connect-payout-status';

export type ConnectProgressStepId =
  | 'business_details'
  | 'identity_verification'
  | 'bank_account'
  | 'ready_for_payouts';

export type ConnectProgressStep = {
  id: ConnectProgressStepId;
  label: string;
  state: 'complete' | 'current' | 'upcoming' | 'blocked';
};

export type ConnectExperienceState =
  | 'not_started'
  | 'information_required'
  | 'verification_in_progress'
  | 'additional_information_required'
  | 'restricted'
  | 'ready_for_transfers'
  | 'ready_for_bank_payouts';

function dueCount(profile: SupplierProfileRow | null | undefined): number {
  const due = Array.isArray(profile?.connect_requirements_currently_due)
    ? profile!.connect_requirements_currently_due!
    : [];
  const past = Array.isArray(profile?.connect_requirements_past_due)
    ? profile!.connect_requirements_past_due!
    : [];
  return due.length + past.length;
}

export function deriveConnectExperienceState(
  profile: SupplierProfileRow | null | undefined
): ConnectExperienceState {
  const status = (profile?.connect_onboarding_status ?? 'not_started').toLowerCase();
  if (status === 'not_started' || !profile?.stripe_connected_account_id) return 'not_started';
  if (status === 'rejected') return 'restricted';
  if (status === 'restricted' || dueCount(profile) > 0) {
    return profile?.connect_details_submitted
      ? 'additional_information_required'
      : 'information_required';
  }
  if (profile?.connect_payouts_enabled && connectCanReceiveTransfers(profile)) {
    return 'ready_for_bank_payouts';
  }
  if (profile?.connect_details_submitted && status === 'pending') {
    return 'verification_in_progress';
  }
  if (connectCanReceiveTransfers({ ...profile, connect_payouts_enabled: true }) === false &&
      profile?.connect_charges_enabled) {
    return 'ready_for_transfers';
  }
  if (status === 'complete' && profile?.connect_payouts_enabled) return 'ready_for_bank_payouts';
  if (status === 'complete') return 'ready_for_transfers';
  return 'verification_in_progress';
}

export function connectExperienceLabel(state: ConnectExperienceState): string {
  switch (state) {
    case 'not_started':
      return 'Not started';
    case 'information_required':
    case 'additional_information_required':
      return 'Action required';
    case 'verification_in_progress':
      return 'Under review';
    case 'restricted':
      return 'Restricted';
    case 'ready_for_transfers':
      return 'Verified';
    case 'ready_for_bank_payouts':
      return 'Payouts enabled';
    default:
      return 'Action required';
  }
}

/** Adaptive progress — steps reflect Stripe capability reality, not a fixed checklist. */
export function buildConnectProgressSteps(
  profile: SupplierProfileRow | null | undefined
): ConnectProgressStep[] {
  const state = deriveConnectExperienceState(profile);
  const hasAccount = Boolean(profile?.stripe_connected_account_id);
  const details = Boolean(profile?.connect_details_submitted);
  const due = dueCount(profile);
  const transfers = connectCanReceiveTransfers(profile ?? {});
  const payouts = Boolean(profile?.connect_payouts_enabled) && transfers;

  const mark = (
    complete: boolean,
    current: boolean,
    blocked = false
  ): ConnectProgressStep['state'] => {
    if (blocked) return 'blocked';
    if (complete) return 'complete';
    if (current) return 'current';
    return 'upcoming';
  };

  return [
    {
      id: 'business_details',
      label: 'Business details',
      state: mark(hasAccount && details, !details && state !== 'not_started', state === 'restricted'),
    },
    {
      id: 'identity_verification',
      label: 'Identity verification',
      state: mark(
        details && due === 0 && state !== 'verification_in_progress' && state !== 'additional_information_required',
        details && (due > 0 || state === 'verification_in_progress' || state === 'additional_information_required'),
        state === 'restricted'
      ),
    },
    {
      id: 'bank_account',
      label: 'Bank account',
      state: mark(payouts, details && due === 0 && !payouts, state === 'restricted'),
    },
    {
      id: 'ready_for_payouts',
      label: 'Ready for payouts',
      state: mark(payouts, payouts === false && transfers, state === 'restricted'),
    },
  ];
}

export type PayoutBlockCategory = 'account' | 'earnings' | 'schedule';

export type PayoutBlockItem = {
  category: PayoutBlockCategory;
  message: string;
};

/** Supplier-facing blocks — no internal fraud codes. */
export function listSupplierPayoutBlocks(input: {
  profile: SupplierProfileRow | null | undefined;
  financialHold?: boolean;
  debtMinor?: number;
  eligibleEarningsMinor?: number;
  scheduleReached?: boolean;
}): PayoutBlockItem[] {
  const blocks: PayoutBlockItem[] = [];
  const p = input.profile;
  const state = deriveConnectExperienceState(p);

  if (state === 'not_started') {
    blocks.push({ category: 'account', message: 'Complete verification to enable automatic payouts.' });
  } else if (state === 'information_required' || state === 'additional_information_required') {
    blocks.push({ category: 'account', message: 'Additional verification information is still required.' });
  } else if (state === 'verification_in_progress') {
    blocks.push({ category: 'account', message: 'Your verification details are under review.' });
  } else if (state === 'restricted') {
    blocks.push({ category: 'account', message: 'Payout account needs attention. Resume verification to continue.' });
  } else if (!p?.connect_payouts_enabled) {
    blocks.push({ category: 'account', message: 'A verified bank account is still required for payouts.' });
  }

  if (input.financialHold) {
    blocks.push({ category: 'earnings', message: 'A financial hold is active on one or more bookings.' });
  }
  if ((input.debtMinor ?? 0) > 0) {
    blocks.push({
      category: 'earnings',
      message: 'Outstanding recovery balance will be deducted from the next payout.',
    });
  }
  if ((input.eligibleEarningsMinor ?? 1) <= 0) {
    blocks.push({ category: 'earnings', message: 'No eligible earnings are ready for this payout period yet.' });
  }
  if (input.scheduleReached === false) {
    blocks.push({ category: 'schedule', message: 'Your Traverion payout schedule date has not been reached yet.' });
  }

  return blocks;
}
