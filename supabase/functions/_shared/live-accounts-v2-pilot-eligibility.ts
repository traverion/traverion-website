import { finlandSupplierCountry } from './accounts-v2-config.ts';
import { hasGenuineBusinessVerificationEvidence } from './supplier-business-approval.ts';

/**
 * LIVE Accounts v2 pilot eligibility.
 * Approval here is not allowlisting and does not turn on the creation gate.
 */

export type LivePilotProfileInput = {
  id: string;
  display_name?: string | null;
  company_legal_name?: string | null;
  business_type?: string | null;
  address_country?: string | null;
  connect_country?: string | null;
  contact_phone?: string | null;
  verification_status?: string | null;
  verification_submitted_at?: string | null;
  company_registration_document_path?: string | null;
  stripe_connected_account_id?: string | null;
  connect_account_type?: string | null;
  connect_account_livemode?: boolean | null;
  connect_legacy_account_id?: string | null;
  connect_create_claimed_at?: string | null;
};

export type LivePilotEligibilityOptions = {
  ownerConfirmed?: boolean;
  stripeVerificationAcknowledged?: boolean;
  duplicateSupplierIds?: string[];
  gateEnabled?: boolean;
  allowlisted?: boolean;
  nowMs?: number;
};

export type LivePilotEligibility = {
  eligible: boolean;
  supplierId: string;
  problems: string[];
  reviewFlags: string[];
  country: 'FI' | null;
  legalName: string | null;
  businessType: 'company' | 'individual' | null;
  businessVerified: boolean;
  hasLiveConnectedAccount: boolean;
  hasOpenCreateClaim: boolean;
  gateEnabled: boolean;
  allowlisted: boolean;
};

const CLAIM_WINDOW_MS = 2 * 60 * 1000;

export function normalizePilotLegalName(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function assessLiveAccountsV2PilotEligibility(
  profile: LivePilotProfileInput,
  opts: LivePilotEligibilityOptions = {}
): LivePilotEligibility {
  const problems: string[] = [];
  const reviewFlags: string[] = [];
  const country = finlandSupplierCountry(profile.address_country || profile.connect_country);
  const legalName = (profile.company_legal_name ?? '').trim() || null;
  const businessTypeRaw = (profile.business_type ?? '').trim().toLowerCase();
  const businessType =
    businessTypeRaw === 'company' || businessTypeRaw === 'individual'
      ? (businessTypeRaw as 'company' | 'individual')
      : null;
  const businessVerified = (profile.verification_status ?? '').trim().toLowerCase() === 'verified';
  const hasLinkedAccount = Boolean((profile.stripe_connected_account_id ?? '').trim());
  const hasLiveConnectedAccount =
    profile.connect_account_livemode === true ||
    (hasLinkedAccount && profile.connect_account_livemode !== false) ||
    Boolean((profile.connect_legacy_account_id ?? '').trim());
  const claimedAt = profile.connect_create_claimed_at
    ? Date.parse(profile.connect_create_claimed_at)
    : NaN;
  const nowMs = opts.nowMs ?? Date.now();
  const hasOpenCreateClaim =
    !hasLinkedAccount && Number.isFinite(claimedAt) && nowMs - claimedAt < CLAIM_WINDOW_MS;
  const gateEnabled = opts.gateEnabled === true;
  const allowlisted = opts.allowlisted === true;

  if (!country) {
    problems.push('Country must be Finland (FI). A missing country blocks LIVE pilot eligibility.');
  }
  if (!legalName) {
    problems.push('Legal business name is required.');
  }
  if (!businessType) {
    problems.push('Business type must be company or individual.');
  }
  if (!(profile.contact_phone ?? '').trim()) {
    problems.push('Contact phone is required.');
  }
  if (!businessVerified) {
    problems.push('Traverion business verification must be approved before LIVE pilot allowlisting.');
  } else if (
    !hasGenuineBusinessVerificationEvidence({
      verification_status: profile.verification_status,
      verification_submitted_at: profile.verification_submitted_at,
      company_registration_document_path: profile.company_registration_document_path,
    })
  ) {
    problems.push(
      'Business verification is marked verified without a submitted profile or registration document. Review separately before LIVE pilot use.'
    );
  }
  if (opts.ownerConfirmed !== true) {
    problems.push('Admin must confirm the signed-in owner is authorized for this business.');
  }
  if (opts.stripeVerificationAcknowledged !== true) {
    problems.push('Supplier must acknowledge that real Stripe verification may be required.');
  }
  if (hasLiveConnectedAccount || hasLinkedAccount) {
    problems.push('Supplier already has a connected account and cannot be the LIVE Accounts v2 pilot.');
  }
  if (hasOpenCreateClaim) {
    problems.push('An unresolved account-creation claim is open for this supplier.');
  }
  if ((opts.duplicateSupplierIds ?? []).length > 0) {
    reviewFlags.push(
      `Possible duplicate legal entity with supplier(s): ${opts.duplicateSupplierIds!.join(', ')}`
    );
  }
  if (!legalName && (profile.display_name ?? '').trim()) {
    reviewFlags.push('Display name is set but legal business name is missing.');
  }
  if (gateEnabled) {
    reviewFlags.push('LIVE creation gate is currently ON. Leave it OFF until a separate authorization.');
  }
  if (allowlisted) {
    reviewFlags.push('Supplier is already on the LIVE creation allowlist.');
  }

  return {
    eligible: problems.length === 0,
    supplierId: profile.id,
    problems,
    reviewFlags,
    country,
    legalName,
    businessType,
    businessVerified,
    hasLiveConnectedAccount: hasLiveConnectedAccount || hasLinkedAccount,
    hasOpenCreateClaim,
    gateEnabled,
    allowlisted,
  };
}
