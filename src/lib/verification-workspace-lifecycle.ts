import type { SupplierProfileRow } from '../data/supabase-supplier-profile';
import {
  deriveConnectExperienceState,
  type ConnectExperienceState,
} from './connect-payout-progress';

/**
 * Verification workspace phases — never restart the wizard for a submitted account.
 *
 * Authoritative signals: Stripe-mirrored connect_details_submitted + connect_onboarding_status.
 * Session draft is only for in-progress collection (never proof of verification).
 */

export type VerificationWorkspacePhase = 'intro' | 'wizard' | 'status';

export type VerificationLifecycleInput = {
  profile: SupplierProfileRow | null | undefined;
  /** Non-sensitive in-progress draft exists in session. */
  hasDraft: boolean;
  /** User explicitly chose to edit / continue collecting. */
  forceWizard?: boolean;
  /** Soft client marker after Finish — bridges until refresh mirrors details_submitted. */
  clientSubmitted?: boolean;
};

export function hasAuthoritativeSubmission(
  profile: SupplierProfileRow | null | undefined
): boolean {
  if (!profile?.stripe_connected_account_id) return false;
  if (profile.connect_details_submitted) return true;
  const status = (profile.connect_onboarding_status ?? 'not_started').toLowerCase();
  return (
    status === 'pending' ||
    status === 'complete' ||
    status === 'restricted' ||
    status === 'rejected'
  );
}

export function resolveVerificationWorkspacePhase(
  input: VerificationLifecycleInput
): VerificationWorkspacePhase {
  if (input.forceWizard) return 'wizard';

  const submitted =
    hasAuthoritativeSubmission(input.profile) || Boolean(input.clientSubmitted);

  // Submitted / pending / verified / action-required → status overview, never wizard restart.
  if (submitted) return 'status';

  const hasAccount = Boolean(input.profile?.stripe_connected_account_id);
  const status = (input.profile?.connect_onboarding_status ?? 'not_started').toLowerCase();

  if (input.hasDraft) return 'wizard';
  if (hasAccount && status !== 'not_started') return 'wizard';
  if (hasAccount && input.profile?.connect_details_submitted === false) {
    // Account provisioned but forms not finished — resume wizard (or intro if no draft).
    return input.hasDraft ? 'wizard' : 'intro';
  }

  return 'intro';
}

export function verificationStatusTone(
  experience: ConnectExperienceState
): 'neutral' | 'pending' | 'success' | 'action' | 'danger' {
  switch (experience) {
    case 'ready_for_bank_payouts':
    case 'ready_for_transfers':
      return 'success';
    case 'verification_in_progress':
      return 'pending';
    case 'additional_information_required':
    case 'information_required':
      return 'action';
    case 'restricted':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function verificationNextStepsCopy(
  profile: SupplierProfileRow | null | undefined
): string {
  const experience = deriveConnectExperienceState(profile);
  const due = Array.isArray(profile?.connect_requirements_currently_due)
    ? profile!.connect_requirements_currently_due!
    : [];
  const past = Array.isArray(profile?.connect_requirements_past_due)
    ? profile!.connect_requirements_past_due!
    : [];
  const outstanding = [...due, ...past];

  switch (experience) {
    case 'not_started':
      return 'Start verification to set up your payout account.';
    case 'information_required':
      return 'Continue verification to submit the required business and payout details.';
    case 'verification_in_progress':
      return 'Information is under review. Status updates when the payment provider finishes checking your details. Completing the form is not the same as being verified.';
    case 'additional_information_required':
      return outstanding.length
        ? 'Additional information is required. Update only the affected details below.'
        : 'Additional information is required before verification can continue.';
    case 'restricted':
      return profile?.connect_disabled_reason?.trim() ||
        'This payout account is restricted. Contact Traverion support if you need help.';
    case 'ready_for_transfers':
      return 'Your account can receive earnings transfers. Bank payouts enable when payouts are confirmed by the provider.';
    case 'ready_for_bank_payouts':
      return 'Transfers and bank payouts are enabled for this account according to the provider.';
    default:
      return 'Review your verification status below.';
  }
}

/** Map Stripe requirement keys to the best wizard category for targeted edits. */
export function editCategoryForRequirement(requirement: string): 'business' | 'representative' | 'ownership' | 'identity' | 'banking' | 'agreement' {
  const r = requirement.toLowerCase();
  if (/external_account|bank_account|iban/.test(r)) return 'banking';
  if (/tos_acceptance|agreement/.test(r)) return 'agreement';
  if (/verification\.document|identity|id_number|ssn/.test(r)) return 'identity';
  if (/owners|directors|executives|person\.relationship/.test(r)) return 'ownership';
  if (/individual\.|representative|dob|first_name|last_name/.test(r)) return 'representative';
  return 'business';
}

export function firstScreenForEditCategory(
  category: ReturnType<typeof editCategoryForRequirement>
): string {
  switch (category) {
    case 'banking':
      return 'bank_country';
    case 'agreement':
      return 'agree_info';
    case 'identity':
      return 'id_status';
    case 'ownership':
      return 'own_intro';
    case 'representative':
      return 'rep_identity';
    default:
      return 'biz_structure';
  }
}
