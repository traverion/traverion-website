/**
 * Completeness rules for NEW Traverion business approvals.
 * Existing verified rows are reviewed separately and are not rewritten by these helpers.
 */

export type BusinessApprovalProfile = {
  company_legal_name?: string | null;
  business_type?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
  business_address?: string | null;
  contact_phone?: string | null;
  company_registration_number?: string | null;
  tax_id?: string | null;
  company_registration_document_path?: string | null;
  verification_status?: string | null;
  verification_submitted_at?: string | null;
};

function addressComplete(profile: BusinessApprovalProfile): boolean {
  const street = (profile.address_street ?? '').trim();
  const city = (profile.address_city ?? '').trim();
  const postal = (profile.address_postal_code ?? '').trim();
  const country = (profile.address_country ?? '').trim();
  if (street && city && postal && country) return true;
  return Boolean((profile.business_address ?? '').trim());
}

/** Gaps that block a new approve_business decision. */
export function getBusinessApprovalBlockers(profile: BusinessApprovalProfile): string[] {
  const out: string[] = [];
  const legal = (profile.company_legal_name ?? '').trim();
  const type = (profile.business_type ?? '').trim().toLowerCase();
  const country = (profile.address_country ?? '').trim();
  const phone = (profile.contact_phone ?? '').trim();
  const document = (profile.company_registration_document_path ?? '').trim();
  const submittedAt = (profile.verification_submitted_at ?? '').trim();

  if (!legal) out.push('Legal business name is required.');
  if (type !== 'company' && type !== 'individual') {
    out.push('Business type must be company or individual.');
  }
  if (!country) out.push('Country must be set explicitly.');
  if (!phone) out.push('Contact phone is required.');
  if (!addressComplete(profile)) {
    out.push('Full business address is required.');
  }
  if (type === 'company' && !(profile.company_registration_number ?? '').trim()) {
    out.push('Company registration number is required.');
  }
  if (type === 'individual' && !(profile.tax_id ?? '').trim()) {
    out.push('Tax or registration ID is required for individuals.');
  }
  if (!document) out.push('Business registration document is required.');
  if (!submittedAt) {
    out.push('Supplier must submit the business profile for review before approval.');
  }
  return out;
}

/**
 * True when a verified status is backed by a real submission trail.
 * Service-role cert scripts can set verified without submitted_at or documents.
 */
export function hasGenuineBusinessVerificationEvidence(profile: BusinessApprovalProfile): boolean {
  const status = (profile.verification_status ?? '').trim().toLowerCase();
  if (status !== 'verified') return false;
  return Boolean(
    (profile.verification_submitted_at ?? '').trim() ||
      (profile.company_registration_document_path ?? '').trim()
  );
}
