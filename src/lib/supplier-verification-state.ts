/**
 * One supplier-facing verification status.
 * Verified only when company, identity, and the payout account have all passed.
 */

import { humanizeConnectRequirements } from './connect-requirement-labels';
import type { OnboardingProgressProfile } from './supplier-onboarding-progress';

export type SupplierVerificationStatus =
  | 'not_verified'
  | 'action_required'
  | 'verification_pending'
  | 'verified';

export type SupplierVerificationProfile = OnboardingProgressProfile & {
  connect_account_livemode?: boolean | null;
};

export type SupplierVerificationView = {
  status: SupplierVerificationStatus;
  title: string;
  summary: string;
  next: string;
  actionLabel: string | null;
  requirements: string[];
};

const COPY: Record<SupplierVerificationStatus, { title: string; summary: string; next: string; actionLabel: string | null }> = {
  not_verified: {
    title: 'Not verified',
    summary: 'Verification has not been completed.',
    next: 'Start when you are ready. You can return at any time.',
    actionLabel: 'Start verification',
  },
  action_required: {
    title: 'Action required',
    summary: 'We need some additional information to complete your verification.',
    next: 'Continue to send the missing details.',
    actionLabel: 'Continue',
  },
  verification_pending: {
    title: 'Verification pending',
    summary: "Your information has been submitted. We're reviewing your account. No action is needed right now.",
    next: 'This page updates when the review is finished.',
    actionLabel: null,
  },
  verified: {
    title: 'Verified',
    summary: 'Your business is verified and your payout account is approved.',
    next: 'Nothing else is needed for verification.',
    actionLabel: null,
  },
};

function plain(label: string): string {
  return label.replace(/Stripe /g, '').replace(/terms of service/i, 'payout terms');
}

export function supplierVerificationState(
  profile: SupplierVerificationProfile | null | undefined
): SupplierVerificationView {
  const row = profile ?? {};
  const company = (row.verification_status ?? '').trim().toLowerCase();
  const feedback = (row.business_verification_feedback ?? '').trim();
  const due = [
    ...(row.connect_requirements_currently_due ?? []),
    ...(row.connect_requirements_past_due ?? []),
  ].map(String);
  const requirements = humanizeConnectRequirements(due).map(plain);
  if (feedback && (company === 'rejected' || company === 'pending')) requirements.unshift(feedback);
  const hasAccount = Boolean(row.stripe_connected_account_id?.trim());
  const details = row.connect_details_submitted === true;
  const payouts = row.connect_payouts_enabled === true;
  const connectStatus = (row.connect_onboarding_status ?? '').trim().toLowerCase();
  const liveOk = row.connect_account_livemode !== false;
  const companyVerified = company === 'verified';
  const payoutAccountVerified =
    companyVerified &&
    payouts &&
    details &&
    due.length === 0 &&
    connectStatus === 'complete' &&
    liveOk;

  const started =
    company === 'verified' ||
    company === 'pending' ||
    company === 'rejected' ||
    Boolean((row.verification_submitted_at ?? '').trim()) ||
    hasAccount ||
    details;

  let status: SupplierVerificationStatus;
  if (payoutAccountVerified) status = 'verified';
  else if (!started) status = 'not_verified';
  else if (
    details &&
    due.length === 0 &&
    !feedback &&
    connectStatus !== 'restricted' &&
    connectStatus !== 'rejected' &&
    company !== 'rejected'
  ) {
    status = 'verification_pending';
  } else status = 'action_required';

  const copy = COPY[status];
  return {
    status,
    title: copy.title,
    summary: copy.summary,
    next: copy.next,
    actionLabel: status === 'action_required' || status === 'not_verified' ? copy.actionLabel : null,
    requirements: status === 'action_required' ? requirements : [],
  };
}

/** Payout sending is separate from verification. Closed gates are never described as active payouts. */
export function payoutAvailabilityCopy(status: SupplierVerificationStatus, gatesOpen: boolean): string {
  if (status !== 'verified') return 'Payouts are not available until verification is complete.';
  if (gatesOpen) return 'Payouts can be sent to your account.';
  return 'Your payout account is approved. Payouts are not being sent yet.';
}

export type OperationalKind = 'ready' | 'pending' | 'restricted' | 'action' | 'closed';

export type OperationalIndicator = {
  key: 'account' | 'payouts';
  headline: string;
  detail: string;
  operational: boolean;
  kind: OperationalKind;
  /** Set only when the supplier can resolve the requirement. */
  actionLabel: string | null;
};

/**
 * Account operational: verification has passed and the account may operate.
 * Payouts operational: that account can also receive payouts, and platform payout gates are open.
 */
export function supplierOperationalIndicators(
  profile: SupplierVerificationProfile | null | undefined,
  gatesOpen: boolean
): { account: OperationalIndicator; payouts: OperationalIndicator } {
  const view = supplierVerificationState(profile);
  const row = profile ?? {};
  const connectStatus = (row.connect_onboarding_status ?? '').trim().toLowerCase();
  const restricted = connectStatus === 'restricted' || connectStatus === 'rejected';
  const payoutsEnabled = row.connect_payouts_enabled === true;
  const due = [
    ...(row.connect_requirements_currently_due ?? []),
    ...(row.connect_requirements_past_due ?? []),
  ];
  const eligible =
    payoutsEnabled &&
    due.length === 0 &&
    connectStatus === 'complete' &&
    row.connect_details_submitted === true &&
    row.connect_account_livemode !== false;

  const accountOperational = view.status === 'verified';
  let accountKind: OperationalKind = 'closed';
  let accountDetail = 'Your account is not ready to operate on Traverion.';
  let accountAction: string | null = null;
  if (accountOperational) {
    accountKind = 'ready';
    accountDetail = 'Your account is verified and can operate on Traverion.';
  } else if (view.status === 'verification_pending') {
    accountKind = 'pending';
    accountDetail = 'Your information is being reviewed. No action is needed right now.';
  } else if (view.status === 'action_required') {
    accountKind = restricted ? 'restricted' : 'action';
    accountDetail = view.requirements[0] || 'We need some additional information before the account can operate.';
    accountAction = 'Continue';
  } else {
    accountKind = 'action';
    accountDetail = 'Verification has not been completed.';
    accountAction = 'Continue';
  }

  const payoutsOperational = accountOperational && eligible && gatesOpen;
  let payoutKind: OperationalKind = 'closed';
  let payoutDetail = 'Payouts are not available yet.';
  if (payoutsOperational) {
    payoutKind = 'ready';
    payoutDetail = 'Payouts can be sent to your account.';
  } else if (accountOperational && eligible && !gatesOpen) {
    payoutKind = 'closed';
    payoutDetail = 'Your payout account is approved. Payouts are not being sent yet.';
  } else if (view.status === 'verification_pending') {
    payoutKind = 'pending';
    payoutDetail = 'Payouts stay unavailable until verification is finished.';
  } else if (restricted) {
    payoutKind = 'restricted';
    payoutDetail = 'Payouts are unavailable until the account restriction is resolved.';
  } else if (view.status === 'action_required' || view.status === 'not_verified') {
    payoutKind = 'action';
    payoutDetail = 'Payouts are not available until verification is complete.';
  }

  return {
    account: {
      key: 'account',
      headline: accountOperational ? 'Account operational' : 'Account not operational',
      detail: accountDetail,
      operational: accountOperational,
      kind: accountKind,
      actionLabel: accountAction,
    },
    payouts: {
      key: 'payouts',
      headline: payoutsOperational ? 'Payouts operational' : 'Payouts not operational',
      detail: payoutDetail,
      operational: payoutsOperational,
      kind: payoutKind,
      actionLabel: null,
    },
  };
}

export type SupplierBankAccountCopy = {
  status: 'on_file' | 'connected' | 'unconfirmed' | 'not_added';
  number: string | null;
  label: string;
};

/** Never invent an account number, and never call a bare connection approved. */
export function supplierBankAccountCopy(
  profile: SupplierVerificationProfile & { payout_iban?: string | null } | null | undefined
): SupplierBankAccountCopy {
  const iban = (profile?.payout_iban ?? '').replace(/\s+/g, '');
  if (iban.length >= 8) {
    return {
      status: 'on_file',
      number: `${iban.slice(0, 4)} •••• ${iban.slice(-4)}`,
      label: `${iban.slice(0, 4)} •••• ${iban.slice(-4)}`,
    };
  }
  const verified = supplierVerificationState(profile).status === 'verified';
  if (verified && profile?.connect_payouts_enabled === true) {
    return { status: 'connected', number: null, label: 'Connected' };
  }
  if (profile?.stripe_connected_account_id?.trim()) {
    return { status: 'unconfirmed', number: null, label: 'Not confirmed' };
  }
  return { status: 'not_added', number: null, label: 'Not added' };
}
