/**
 * Server-backed onboarding progress.
 * Status labels come from Traverion verification and Stripe requirement keys only.
 */

import { humanizeConnectRequirements } from './connect-requirement-labels';
import type { SupplierOnboardingScreenId } from './supplier-onboarding-steps';
import { SUPPLIER_ONBOARDING_SCREENS } from './supplier-onboarding-steps';

export type OnboardingLaneStatus =
  | 'not_started'
  | 'saved'
  | 'action_required'
  | 'submitted'
  | 'pending_verification'
  | 'verified'
  | 'rejected';

export const ONBOARDING_LANE_LABEL: Record<OnboardingLaneStatus, string> = {
  not_started: 'Not started',
  saved: 'Saved',
  action_required: 'Action required',
  submitted: 'Submitted',
  pending_verification: 'Pending verification',
  verified: 'Verified',
  rejected: 'Rejected',
};

export type OnboardingProgressProfile = {
  verification_status?: string | null;
  verification_submitted_at?: string | null;
  business_verification_feedback?: string | null;
  company_legal_name?: string | null;
  company_registration_document_path?: string | null;
  stripe_connected_account_id?: string | null;
  connect_details_submitted?: boolean | null;
  connect_payouts_enabled?: boolean | null;
  connect_onboarding_status?: string | null;
  connect_requirements_currently_due?: string[] | null;
  connect_requirements_past_due?: string[] | null;
  payout_wizard_draft?: {
    step?: string;
    rep?: { first_name?: string; last_name?: string };
    tos_accepted_intent?: boolean;
    markers?: { representativeSavedAt?: string | null; bankSavedAt?: string | null };
  } | null;
  setup_progress?: { screen?: string | null } | null;
};

export type OnboardingLane = {
  status: OnboardingLaneStatus;
  detail: string;
};

export type SupplierOnboardingSnapshot = {
  company: OnboardingLane;
  identity: OnboardingLane;
  payout: OnboardingLane;
  requirements: string[];
  nextScreen: SupplierOnboardingScreenId;
  nextAction: string;
  actionable: boolean;
};

function dueKeys(profile: OnboardingProgressProfile): string[] {
  return [
    ...(profile.connect_requirements_currently_due ?? []),
    ...(profile.connect_requirements_past_due ?? []),
  ].map(String);
}

function matches(keys: string[], pattern: RegExp): boolean {
  return keys.some((key) => pattern.test(key));
}

function bookmarkedScreen(row: OnboardingProgressProfile): SupplierOnboardingScreenId | null {
  const raw = row.setup_progress?.screen;
  if (typeof raw !== 'string') return null;
  return SUPPLIER_ONBOARDING_SCREENS.some((screen) => screen.id === raw)
    ? (raw as SupplierOnboardingScreenId)
    : null;
}

export function supplierOnboardingSnapshot(
  profile: OnboardingProgressProfile | null | undefined
): SupplierOnboardingSnapshot {
  const row = profile ?? {};
  const keys = dueKeys(row);
  const labels = humanizeConnectRequirements(keys);
  const companyStatus = (row.verification_status ?? '').trim().toLowerCase();
  const submittedForReview = Boolean((row.verification_submitted_at ?? '').trim());
  const hasAccount = Boolean(row.stripe_connected_account_id?.trim());
  const detailsSubmitted = row.connect_details_submitted === true;
  const payoutsEnabled = row.connect_payouts_enabled === true;
  const rep = row.payout_wizard_draft?.rep;
  const hasName = Boolean(rep?.first_name?.trim() && rep?.last_name?.trim());
  const identityDue = matches(keys, /director|dob|first_name|last_name|owner|representative|verification\.document|primary_verification/);
  const bankDue = matches(keys, /external_account|bank_account/);
  const termsDue = matches(keys, /tos_acceptance/);
  const identityLabel = humanizeConnectRequirements(
    keys.filter((key) => /director|dob|first_name|last_name|owner|representative|verification\.document|primary_verification/i.test(key))
  )[0];
  const payoutLabel = humanizeConnectRequirements(
    keys.filter((key) => /external_account|bank_account|tos_acceptance/i.test(key))
  )[0];

  const company: OnboardingLane =
    companyStatus === 'verified'
      ? { status: 'verified', detail: 'Company record approved' }
      : companyStatus === 'rejected'
        ? { status: 'rejected', detail: 'Update the company record' }
        : companyStatus === 'pending' && submittedForReview
          ? {
              status: (row.business_verification_feedback ?? '').trim() ? 'action_required' : 'pending_verification',
              detail: (row.business_verification_feedback ?? '').trim()
                ? 'Update the company record'
                : 'Waiting for review',
            }
          : row.company_legal_name?.trim()
            ? { status: 'saved', detail: 'Company details saved' }
            : { status: 'not_started', detail: 'Add the company' };

  const identity: OnboardingLane = !hasAccount
    ? { status: 'not_started', detail: 'Identity has not been sent' }
    : identityDue
      ? { status: 'action_required', detail: identityLabel ?? 'Identity details required' }
      : detailsSubmitted || payoutsEnabled
        ? {
            status: payoutsEnabled ? 'verified' : 'pending_verification',
            detail: payoutsEnabled ? 'Identity accepted' : 'Waiting for review',
          }
        : hasName || row.payout_wizard_draft?.markers?.representativeSavedAt
          ? { status: 'saved', detail: 'Identity saved on this account' }
          : { status: 'not_started', detail: 'Identity has not been sent' };

  const payout: OnboardingLane = !hasAccount
    ? { status: 'not_started', detail: 'Payout account has not been started' }
    : bankDue || termsDue
      ? { status: 'action_required', detail: payoutLabel ?? 'Payout details required' }
      : payoutsEnabled
        ? { status: 'verified', detail: 'Payout account verified' }
        : detailsSubmitted || row.payout_wizard_draft?.markers?.bankSavedAt
          ? { status: 'pending_verification', detail: 'Waiting for review' }
          : { status: 'saved', detail: 'No payout requirement is open' };

  let nextScreen: SupplierOnboardingScreenId = 'status';
  if (company.status === 'not_started') nextScreen = 'company';
  else if (company.status === 'rejected' || company.status === 'action_required') nextScreen = 'documents';
  else if (identity.status === 'action_required') {
    nextScreen = 'person';
  } else if (bankDue) nextScreen = 'bank';
  else if (termsDue) nextScreen = 'terms';
  else if (company.status === 'saved') {
    const bookmark = bookmarkedScreen(row);
    nextScreen = bookmark ?? 'documents';
  }

  const actionable =
    company.status === 'not_started' ||
    company.status === 'saved' ||
    company.status === 'rejected' ||
    company.status === 'action_required' ||
    identity.status === 'action_required' ||
    payout.status === 'action_required';

  const nextAction = actionable
    ? nextScreen === 'company'
      ? company.detail
      : nextScreen === 'documents'
        ? 'Update the registration document'
        : (identity.status === 'action_required' ? identity.detail : payout.detail)
    : 'Verification pending';

  return {
    company,
    identity,
    payout,
    requirements: labels,
    nextScreen,
    nextAction,
    actionable,
  };
}

/** Confirmed lanes may say setup is complete. A pending review must not. */
export function supplierSetupCompletionCopy(
  verified: boolean,
  pendingTitle: string,
  pendingMessage: string,
): { title: string; message: string } {
  if (verified) {
    return {
      title: 'Setup completed!',
      message: 'Your company, identity, and payout details are confirmed.',
    };
  }
  return { title: pendingTitle, message: pendingMessage };
}

export function onboardingLanesVerified(snapshot: SupplierOnboardingSnapshot): boolean {
  return (
    snapshot.company.status === 'verified' &&
    snapshot.identity.status === 'verified' &&
    snapshot.payout.status === 'verified'
  );
}

/** Sidebar and dashboard label. A verified account is not unfinished setup. */
export function supplierSetupMenuLabel(snapshot: SupplierOnboardingSnapshot): string | null {
  if (onboardingLanesVerified(snapshot)) return null;
  if (!snapshot.actionable) return 'Verification pending';
  return snapshot.nextAction;
}
