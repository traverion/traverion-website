/**
 * Partner business + payout review status for badges and home notifications.
 * Statuses are independent: both must be verified before publish.
 */

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

export function partnerBusinessStatusChip(state: PartnerReviewState): PartnerStatusChip {
  switch (state) {
    case 'verified':
      return { label: 'Business approved', tone: 'good' };
    case 'rejected':
      return { label: 'Business rejected', tone: 'bad' };
    case 'pending':
      return { label: 'Business pending review', tone: 'warn' };
    case 'ready':
      return { label: 'Business ready to submit', tone: 'info' };
    default:
      return { label: 'Business incomplete', tone: 'neutral' };
  }
}

export function partnerPayoutStatusChip(state: PartnerReviewState): PartnerStatusChip {
  switch (state) {
    case 'verified':
      return { label: 'Payout approved', tone: 'good' };
    case 'rejected':
      return { label: 'Payout rejected', tone: 'bad' };
    case 'pending':
      return { label: 'Payout pending review', tone: 'warn' };
    case 'ready':
      return { label: 'Payout ready to submit', tone: 'info' };
    default:
      return { label: 'Payout incomplete', tone: 'neutral' };
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
      title: 'Account operational',
      detail: 'Business and payout are approved. You can publish listings that meet quality checks.',
      tone: 'good',
      chipLabel: 'Approved',
    };
  }
  if (business === 'rejected' || payout === 'rejected') {
    const parts: string[] = [];
    if (business === 'rejected') parts.push('business');
    if (payout === 'rejected') parts.push('payout');
    return {
      kind: 'rejected',
      title: 'Verification needs updates',
      detail: `Update your ${parts.join(' and ')} details, then save again for Traverion to review.`,
      tone: 'bad',
      chipLabel: 'Rejected',
    };
  }
  if (business === 'pending' || payout === 'pending') {
    const parts: string[] = [];
    if (business === 'pending') parts.push('business');
    if (payout === 'pending') parts.push('payout');
    const waiting = parts.length === 2 ? 'Business and payout' : parts[0] === 'business' ? 'Business' : 'Payout';
    return {
      kind: 'pending',
      title: 'Verification pending',
      detail: `${waiting} details are under Traverion review. Status updates appear here and in Settings.`,
      tone: 'warn',
      chipLabel: 'Pending review',
    };
  }
  return {
    kind: 'setup',
    title: 'Finish account setup',
    detail: 'Complete business and payout details so Traverion can verify your account.',
    tone: 'warn',
    chipLabel: 'Setup needed',
  };
}
