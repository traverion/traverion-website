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
  tax_id: string | null;
  vat_id: string | null;
  verification_status: 'pending' | 'verified' | 'rejected' | null;
  insurance_policy_number: string | null;
  insurance_coverage: string | null;
  insurance_start: string | null;
  insurance_end: string | null;
  insurance_provider: string | null;
  payment_cycle: 'monthly' | 'biweekly' | null;
  payout_threshold_min: number | null;
  welcome_email_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

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
    tax_id: string | null;
    vat_id: string | null;
    verification_status: 'pending' | 'verified' | 'rejected' | null;
    insurance_policy_number: string | null;
    insurance_coverage: string | null;
    insurance_start: string | null;
    insurance_end: string | null;
    insurance_provider: string | null;
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
