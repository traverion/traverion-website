/**
 * Partner business + payout review status for badges and home notifications.
 * Statuses are independent: both must be verified before publish.
 *
 * Supplier-facing chip labels (only): Incomplete | Under review | Action required | Verified
 */

import { PARTNER_HELP } from './partnerHelpCopy';

export type PartnerReviewState = 'incomplete' | 'ready' | 'pending' | 'verified' | 'rejected';

export type PartnerStatusTone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

export type PartnerStatusChip = {
  label: string;
  tone: PartnerStatusTone;
};

function norm(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase();
}

export function partnerBusinessReviewState(input: {
  verificationStatus: string | null | undefined;
  submittedAt?: string | null | undefined;
  draftComplete?: boolean;
}): PartnerReviewState {
  const v = norm(input.verificationStatus);
  if (v === 'verified') return 'verified';
  if (v === 'rejected') return 'rejected';
  if ((input.submittedAt ?? '').trim()) return 'pending';
  if (input.draftComplete) return 'ready';
  return 'incomplete';
}

export function partnerPayoutReviewState(input: {
  verificationStatus: string | null | undefined;
  submittedAt?: string | null | undefined;
  hasBankDetails?: boolean;
}): PartnerReviewState {
  const v = norm(input.verificationStatus);
  if (v === 'verified') return 'verified';
  if (v === 'rejected') return 'rejected';
  if ((input.submittedAt ?? '').trim()) return 'pending';
  if (input.hasBankDetails) return 'ready';
  return 'incomplete';
}

/** Shared supplier-facing status labels — never show Verified unless genuinely complete. */
export function partnerReviewStatusChip(state: PartnerReviewState): PartnerStatusChip {
  switch (state) {
    case 'verified':
      return { label: 'Verified', tone: 'good' };
    case 'rejected':
      return { label: 'Action required', tone: 'bad' };
    case 'pending':
      return { label: 'Under review', tone: 'warn' };
    case 'ready':
    case 'incomplete':
    default:
      return { label: 'Incomplete', tone: 'neutral' };
  }
}

export function partnerBusinessStatusChip(state: PartnerReviewState): PartnerStatusChip {
  return partnerReviewStatusChip(state);
}

export function partnerPayoutStatusChip(state: PartnerReviewState): PartnerStatusChip {
  return partnerReviewStatusChip(state);
}

/** Optional ? tip body for a review status (shown only on request). */
export function partnerReviewStatusHelp(state: PartnerReviewState): string {
  switch (state) {
    case 'verified':
      return PARTNER_HELP.verified;
    case 'rejected':
      return PARTNER_HELP.actionRequired;
    case 'pending':
      return PARTNER_HELP.underReview;
    default:
      return PARTNER_HELP.incomplete;
  }
}

export type PartnerAccountStatusKind = 'operational' | 'rejected' | 'pending' | 'setup';

export type PartnerAccountStatus = {
  kind: PartnerAccountStatusKind;
  title: string;
  detail: string;
  tone: PartnerStatusTone;
  chipLabel: string;
};

/** Home / summary status when both business and payout reviews are considered. */
export function partnerAccountStatus(input: {
  business: PartnerReviewState;
  payout: PartnerReviewState;
}): PartnerAccountStatus {
  const { business, payout } = input;
  if (business === 'verified' && payout === 'verified') {
    return {
      kind: 'operational',
      title: 'Ready to publish',
      detail: 'Business and payout are verified.',
      tone: 'good',
      chipLabel: 'Verified',
    };
  }
  if (business === 'rejected' || payout === 'rejected') {
    const parts: string[] = [];
    if (business === 'rejected') parts.push('business');
    if (payout === 'rejected') parts.push('payout');
    return {
      kind: 'rejected',
      title: 'Action required',
      detail: `Update your ${parts.join(' and ')} details, then submit again.`,
      tone: 'bad',
      chipLabel: 'Action required',
    };
  }
  if (business === 'pending' || payout === 'pending') {
    return {
      kind: 'pending',
      title: 'Under review',
      detail: 'You can draft listings while you wait.',
      tone: 'warn',
      chipLabel: 'Under review',
    };
  }
  return {
    kind: 'setup',
    title: 'Finish setup',
    detail: 'Complete business and payout details.',
    tone: 'warn',
    chipLabel: 'Incomplete',
  };
}
