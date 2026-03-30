import type { SupplierProfileRow } from '../data/supabase-supplier-profile';

/** Payout method selected and minimum details saved for that method. */
export function isSupplierPayoutConfigured(profile: SupplierProfileRow | null | undefined): boolean {
  if (!profile) return false;
  const m = profile.payout_method;
  if (!m || m === 'none') return false;
  if (m === 'bank') {
    return Boolean(profile.payout_iban?.trim() && profile.payout_bic?.trim());
  }
  if (m === 'paypal') {
    return Boolean(profile.payout_paypal_email?.trim());
  }
  return false;
}

/**
 * True only after the supplier has filled real business fields in Settings,
 * uploaded business registration proof, and not just the signup business name copied into company_legal_name.
 */
export function isSupplierBusinessProfileComplete(profile: SupplierProfileRow | null | undefined): boolean {
  if (!profile?.company_legal_name?.trim()) return false;
  if (!profile.business_address?.trim()) return false;
  if (!profile.business_type) return false;
  if (!profile.company_registration_document_path?.trim()) return false;
  if (profile.business_type === 'company') {
    return Boolean(profile.company_registration_number?.trim());
  }
  if (profile.business_type === 'individual') {
    /** Business / tax ID as shown on trade or tax registration. */
    return Boolean(profile.tax_id?.trim());
  }
  return false;
}

/**
 * Can create/publish listings: verified by Traverion, company profile complete, payout destination saved.
 * Business logo/photo is optional (branding only).
 */
export function isSupplierReadyToPublishTours(profile: SupplierProfileRow | null | undefined): boolean {
  if (!profile || profile.verification_status !== 'verified') return false;
  if (!isSupplierBusinessProfileComplete(profile)) return false;
  if (!isSupplierPayoutConfigured(profile)) return false;
  return true;
}
