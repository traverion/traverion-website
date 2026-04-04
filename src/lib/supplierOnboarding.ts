import type { SupplierProfileRow } from '../data/supabase-supplier-profile';

/**
 * Shape used for live Settings form checks. Extend `getSupplierBusinessProfileMissingReasons` when you add
 * new required business fields—those strings are shown to suppliers in the verification status box.
 */
export type SupplierBusinessProfileDraft = {
  company_legal_name?: string | null;
  /** Legacy single-line address (optional if structured fields are set). */
  business_address?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
  business_type?: 'company' | 'individual' | null | '';
  company_registration_number?: string | null;
  tax_id?: string | null;
  company_registration_document_path?: string | null;
};

function supplierAddressCompleteFromDraft(d: SupplierBusinessProfileDraft): boolean {
  const s = d.address_street?.trim();
  const c = d.address_city?.trim();
  const z = d.address_postal_code?.trim();
  const co = d.address_country?.trim();
  if (s && c && z && co) return true;
  return Boolean(d.business_address?.trim());
}

/**
 * Human-readable gaps for the business profile (same rules as `isSupplierBusinessProfileComplete` on a row).
 * Use in the supplier portal to explain what still needs filling before submit.
 */
export function getSupplierBusinessProfileMissingReasons(
  d: SupplierBusinessProfileDraft | null | undefined
): string[] {
  if (!d) return ['Sign in and open Business profile to continue.'];
  const out: string[] = [];
  if (!d.company_legal_name?.trim()) out.push('Registered legal business name');
  if (!d.business_type) out.push('Business type (company or individual trader)');
  if (!supplierAddressCompleteFromDraft(d)) {
    out.push('Full address: street, city, postal code, and country (as on registration)');
  }
  if (!d.company_registration_document_path?.trim()) {
    out.push('Business registration proof (upload a document)');
  }
  if (d.business_type === 'company' && !d.company_registration_number?.trim()) {
    out.push('Company registration number (as on your certificate)');
  }
  if (d.business_type === 'individual' && !d.tax_id?.trim()) {
    out.push('Business or tax ID (as on your registration)');
  }
  return out;
}

export function isSupplierBusinessProfileDraftComplete(d: SupplierBusinessProfileDraft | null | undefined): boolean {
  return getSupplierBusinessProfileMissingReasons(d).length === 0;
}

/** IBAN and BIC on file (bank transfer only; PayPal no longer used in UI). */
export function isSupplierPayoutConfigured(profile: SupplierProfileRow | null | undefined): boolean {
  if (!profile) return false;
  return Boolean(profile.payout_iban?.trim() && profile.payout_bic?.trim());
}

/**
 * True only after the supplier has filled real business fields in Settings,
 * uploaded business registration proof, and not just the signup business name copied into company_legal_name.
 */
export function isSupplierBusinessProfileComplete(profile: SupplierProfileRow | null | undefined): boolean {
  if (!profile) return false;
  return isSupplierBusinessProfileDraftComplete({
    company_legal_name: profile.company_legal_name,
    business_address: profile.business_address,
    address_street: profile.address_street,
    address_city: profile.address_city,
    address_postal_code: profile.address_postal_code,
    address_country: profile.address_country,
    business_type: profile.business_type,
    company_registration_number: profile.company_registration_number,
    tax_id: profile.tax_id,
    company_registration_document_path: profile.company_registration_document_path,
  });
}

function payoutVerified(profile: SupplierProfileRow | null | undefined): boolean {
  return (profile?.payout_verification_status ?? '').trim().toLowerCase() === 'verified';
}

function businessVerified(profile: SupplierProfileRow | null | undefined): boolean {
  return (profile?.verification_status ?? '').trim().toLowerCase() === 'verified';
}

/**
 * Can create/publish listings: Traverion has verified business and payout (IBAN/BIC) independently,
 * and required fields are still complete.
 */
export function isSupplierReadyToPublishTours(profile: SupplierProfileRow | null | undefined): boolean {
  if (!profile) return false;
  if (!businessVerified(profile)) return false;
  if (!payoutVerified(profile)) return false;
  if (!isSupplierBusinessProfileComplete(profile)) return false;
  if (!isSupplierPayoutConfigured(profile)) return false;
  return true;
}
