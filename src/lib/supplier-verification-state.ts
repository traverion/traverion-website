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
