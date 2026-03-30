import { supabase } from '../lib/supabase';
import { normalizePhoneNumber } from '../lib/phoneNormalize';

export type SupplierProfileRow = {
  id: string;
  display_name: string | null;
  contact_phone: string | null;
  payout_method: string | null;
  payout_iban: string | null;
  payout_bic: string | null;
  payout_paypal_email: string | null;
  business_type: 'company' | 'individual' | null;
  company_legal_name: string | null;
  company_registration_number: string | null;
  managing_directors: string | null;
  business_address: string | null;
  address_street: string | null;
  address_country: string | null;
  address_city: string | null;
  address_postal_code: string | null;
  tax_id: string | null;
  vat_id: string | null;
  verification_status: 'pending' | 'verified' | 'rejected' | null;
  verification_submitted_at: string | null;
  insurance_policy_number: string | null;
  insurance_coverage: string | null;
  insurance_start: string | null;
  insurance_end: string | null;
  insurance_provider: string | null;
  /** Operator-authored; public read for guests on listings/bookings */
  privacy_policy_text: string | null;
  /** Operator-authored; public read for guests on listings/bookings */
  terms_conditions_text: string | null;
  payment_cycle: 'monthly' | 'biweekly' | null;
  payout_threshold_min: number | null;
  welcome_email_sent_at: string | null;
  /** Public Storage URL; shown on tour page and supplier dashboard */
  business_logo_url: string | null;
  /** Private bucket path for ID proof */
  identity_document_path: string | null;
  /** Private bucket path for company registration extract (company suppliers) */
  company_registration_document_path: string | null;
  created_at: string;
  updated_at: string;
};

const SUPPLIER_LOGO_BUCKET = 'supplier-logos';
const VERIFICATION_BUCKET = 'supplier-verification';

/** Upload business registration proof (PDF or image). Returns storage path for DB. */
export async function uploadSupplierVerificationDocument(
  userId: string,
  file: File
): Promise<{ path: string | null; error?: string }> {
  if (!supabase) return { path: null, error: 'Supabase not configured' };
  const max = 5 * 1024 * 1024;
  if (file.size > max) return { path: null, error: 'File must be 5 MB or smaller.' };
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowed.includes(file.type)) return { path: null, error: 'Use PDF, JPEG, PNG, or WebP.' };

  const ext =
    file.type === 'application/pdf'
      ? 'pdf'
      : file.type === 'image/jpeg'
        ? 'jpg'
        : file.type === 'image/png'
          ? 'png'
          : 'webp';
  const path = `${userId}/company-registration.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
  if (upErr) return { path: null, error: upErr.message };
  return { path };
}

export async function removeSupplierVerificationDocumentFile(path: string): Promise<void> {
  if (!supabase || !path.trim()) return;
  await supabase.storage.from(VERIFICATION_BUCKET).remove([path]);
}

export async function getSignedVerificationDocumentUrl(
  path: string,
  expiresIn = 3600
): Promise<string | null> {
  if (!supabase || !path.trim()) return null;
  const { data, error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Upload a business profile photo; returns public URL to store on supplier_profiles.business_logo_url */
export async function uploadSupplierBusinessLogo(
  userId: string,
  file: File
): Promise<{ publicUrl: string | null; error?: string }> {
  if (!supabase) return { publicUrl: null, error: 'Supabase not configured' };
  const max = 2 * 1024 * 1024;
  if (file.size > max) return { publicUrl: null, error: 'Image must be 2 MB or smaller.' };
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.type)) return { publicUrl: null, error: 'Use JPEG, PNG, WebP, or GIF.' };

  const ext =
    file.type === 'image/jpeg'
      ? 'jpg'
      : file.type === 'image/png'
        ? 'png'
        : file.type === 'image/webp'
          ? 'webp'
          : 'gif';
  const path = `${userId}/business-logo.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(SUPPLIER_LOGO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
  if (upErr) return { publicUrl: null, error: upErr.message };

  const { data } = supabase.storage.from(SUPPLIER_LOGO_BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl };
}

/** Remove all files in the supplier's logo folder (e.g. before clearing profile URL). */
export async function removeSupplierBusinessLogoFiles(userId: string): Promise<void> {
  if (!supabase) return;
  const { data: files } = await supabase.storage.from(SUPPLIER_LOGO_BUCKET).list(userId);
  if (!files?.length) return;
  const paths = files.map((f) => `${userId}/${f.name}`);
  await supabase.storage.from(SUPPLIER_LOGO_BUCKET).remove(paths);
}

/**
 * Ensure base supplier profile row exists for authenticated supplier.
 * Safe to call multiple times.
 */
export async function ensureSupplierProfile(
  userId: string,
  payload?: {
    display_name?: string | null;
    company_legal_name?: string | null;
    contact_phone?: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const normalizedCompanyName = payload?.company_legal_name?.trim() || null;
  const normalizedDisplayName = payload?.display_name?.trim() || normalizedCompanyName;
  const normalizedContactPhone = payload?.contact_phone
    ? normalizePhoneNumber(payload.contact_phone)
    : '';
  const { error } = await supabase
    .from('supplier_profiles')
    .upsert(
      {
        id: userId,
        ...(normalizedDisplayName ? { display_name: normalizedDisplayName } : {}),
        ...(normalizedCompanyName ? { company_legal_name: normalizedCompanyName } : {}),
        ...(normalizedContactPhone ? { contact_phone: normalizedContactPhone } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Fetch supplier profile (RLS: own row). */
export async function fetchSupplierProfile(userId: string): Promise<SupplierProfileRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('supplier_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as SupplierProfileRow;
}

/** Update payout fields. Creates row if not exists (insert with id = userId). */
export async function updateSupplierPayout(
  userId: string,
  payload: {
    payout_method?: 'bank' | 'paypal' | 'none' | null;
    payout_iban?: string | null;
    payout_bic?: string | null;
    payout_paypal_email?: string | null;
    payment_cycle?: 'monthly' | 'biweekly' | null;
    payout_threshold_min?: number | null;
  }
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { error } = await supabase
    .from('supplier_profiles')
    .upsert(
      {
        id: userId,
        ...payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Update full company/business profile (business type, legal name, address, tax, verification, insurance). */
export async function updateSupplierCompanyProfile(
  userId: string,
  payload: Partial<{
    business_type: 'company' | 'individual' | null;
    company_legal_name: string | null;
    company_registration_number: string | null;
    managing_directors: string | null;
    business_address: string | null;
    address_street: string | null;
    address_country: string | null;
    address_city: string | null;
    address_postal_code: string | null;
    tax_id: string | null;
    vat_id: string | null;
    verification_status: 'pending' | 'verified' | 'rejected' | null;
    verification_submitted_at: string | null;
    insurance_policy_number: string | null;
    insurance_coverage: string | null;
    insurance_start: string | null;
    insurance_end: string | null;
    insurance_provider: string | null;
    privacy_policy_text: string | null;
    terms_conditions_text: string | null;
    business_logo_url: string | null;
    identity_document_path: string | null;
    company_registration_document_path: string | null;
  }>
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const normalizedCompanyName = payload.company_legal_name?.trim();
  const { error } = await supabase
    .from('supplier_profiles')
    .upsert(
      {
        id: userId,
        ...payload,
        ...(normalizedCompanyName ? { display_name: normalizedCompanyName, company_legal_name: normalizedCompanyName } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Public fields for listing/booking UIs (RLS allows select for all). */
export async function fetchSupplierPublicLegal(
  supplierId: string
): Promise<{
  display_name: string | null;
  company_legal_name: string | null;
  business_address: string | null;
  business_logo_url: string | null;
  privacy_policy_text: string | null;
  terms_conditions_text: string | null;
} | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('supplier_profiles')
    .select(
      'display_name, company_legal_name, business_address, business_logo_url, privacy_policy_text, terms_conditions_text'
    )
    .eq('id', supplierId)
    .maybeSingle();
  if (error || !data) return null;
  return data as {
    display_name: string | null;
    company_legal_name: string | null;
    business_address: string | null;
    business_logo_url: string | null;
    privacy_policy_text: string | null;
    terms_conditions_text: string | null;
  };
}
