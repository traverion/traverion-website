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
  /** Traverion approval of IBAN/BIC; independent from business verification_status. */
  payout_verification_status: 'pending' | 'verified' | 'rejected' | null;
  payout_verification_submitted_at: string | null;
  /** Staff note shown to supplier when business is rejected; cleared on resubmit. */
  business_verification_feedback: string | null;
  /** Staff note shown to supplier when payout is rejected; cleared on resubmit. */
  payout_verification_feedback: string | null;
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
  /** Set when approval email was delivered (admin retry idempotency). */
  business_verified_email_sent_at?: string | null;
  /** Set when rejection email was delivered (admin retry idempotency). */
  business_rejected_email_sent_at?: string | null;
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

const VERIFICATION_MIME: Record<string, 'pdf' | 'jpg' | 'png' | 'webp'> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Resolve a live authenticated user id for Storage RLS (path must be auth.uid()/…).
 * Storage sends the anon key when no session exists — that yields
 * "new row violates row-level security policy".
 */
async function requireAuthenticatedUserId(
  expectedUserId?: string
): Promise<{ userId: string } | { error: string }> {
  if (!supabase) return { error: 'Supabase not configured' };

  const sessionResult = await supabase.auth.getSession();
  let session = sessionResult.data.session;
  if (sessionResult.error) {
    console.warn('[Traverion] auth.getSession failed before upload:', sessionResult.error.message);
  }

  if (!session?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) {
      console.warn('[Traverion] auth.refreshSession failed before upload:', refreshed.error.message);
    }
    session = refreshed.data.session;
  }

  if (!session?.access_token || !session.user?.id) {
    return { error: 'Your session ended. Sign in again to continue.' };
  }

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user?.id) {
    console.warn('[Traverion] auth.getUser failed before upload:', userErr?.message);
    return { error: 'Your session ended. Sign in again to continue.' };
  }

  if (expectedUserId && expectedUserId !== user.id) {
    console.warn('[Traverion] upload userId mismatch', { expectedUserId, authUid: user.id });
    return { error: 'Your session ended. Sign in again to continue.' };
  }

  return { userId: user.id };
}

function verificationExtFromFile(file: File): 'pdf' | 'jpg' | 'png' | 'webp' | null {
  const fromMime = VERIFICATION_MIME[file.type];
  if (fromMime) return fromMime;
  // Mobile Safari often sends an empty MIME type; fall back to extension.
  const name = file.name.trim().toLowerCase();
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'jpg';
  if (name.endsWith('.png')) return 'png';
  if (name.endsWith('.webp')) return 'webp';
  return null;
}

/** Upload business registration proof (PDF or image). Returns storage path for DB. */
export async function uploadSupplierVerificationDocument(
  userId: string,
  file: File
): Promise<{ path: string | null; error?: string }> {
  if (!supabase) return { path: null, error: 'Supabase not configured' };
  const max = 5 * 1024 * 1024;
  if (file.size > max) return { path: null, error: 'File must be 5 MB or smaller.' };
  const ext = verificationExtFromFile(file);
  if (!ext) return { path: null, error: 'Use PDF, JPEG, PNG, or WebP.' };

  const auth = await requireAuthenticatedUserId(userId);
  if ('error' in auth) return { path: null, error: auth.error };

  const contentType =
    ext === 'pdf'
      ? 'application/pdf'
      : ext === 'jpg'
        ? 'image/jpeg'
        : ext === 'png'
          ? 'image/png'
          : 'image/webp';
  const path = `${auth.userId}/company-registration.${ext}`;
  const originalName =
    file.name.trim().slice(0, 200) || `company-registration.${ext}`;

  const { error: upErr } = await supabase.storage.from(VERIFICATION_BUCKET).upload(path, file, {
    upsert: true,
    contentType,
    cacheControl: '3600',
    metadata: { original_filename: originalName },
  });
  if (upErr) {
    console.warn('[Traverion] supplier-verification upload failed:', upErr.message, { path });
    return { path: null, error: upErr.message };
  }
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

/** Last segment of a storage path (e.g. company-registration.pdf). */
export function verificationDocumentBasename(storagePath: string): string {
  const parts = storagePath.trim().split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : '';
}

/**
 * Human-readable file label: original name from upload metadata when present, else storage basename.
 */
export async function getVerificationDocumentDisplayLabel(storagePath: string): Promise<string> {
  const fallback = verificationDocumentBasename(storagePath);
  if (!supabase || !storagePath.trim()) return fallback;

  const segments = storagePath.trim().split('/').filter(Boolean);
  if (segments.length < 2) return fallback;
  const objectName = segments[segments.length - 1]!;
  const folder = segments.slice(0, -1).join('/');

  const { data, error } = await supabase.storage.from(VERIFICATION_BUCKET).list(folder, { limit: 100 });
  if (error || !data?.length) return fallback;

  const row = data.find((f) => f.name === objectName);
  const meta = (row?.metadata ?? {}) as Record<string, unknown>;
  const orig = meta.original_filename;
  if (typeof orig === 'string' && orig.trim()) return orig.trim();
  return fallback;
}

/**
 * Open verification file in a new tab without navigating to supabase.co: fetch signed URL, then blob URL on this origin.
 */
export async function openVerificationDocumentPreview(storagePath: string): Promise<{ error?: string }> {
  const signed = await getSignedVerificationDocumentUrl(storagePath);
  if (!signed) return { error: 'Could not open document.' };

  try {
    const res = await fetch(signed);
    if (!res.ok) return { error: 'Could not load document.' };
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const win = window.open(objUrl, '_blank', 'noopener,noreferrer');
    if (!win) {
      URL.revokeObjectURL(objUrl);
      return { error: 'Popup blocked. Allow popups for this site to view the document.' };
    }
    window.setTimeout(() => URL.revokeObjectURL(objUrl), 600_000);
    return {};
  } catch {
    window.open(signed, '_blank', 'noopener,noreferrer');
    return {};
  }
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
  let mime = file.type;
  if (!allowed.includes(mime)) {
    const name = file.name.trim().toLowerCase();
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) mime = 'image/jpeg';
    else if (name.endsWith('.png')) mime = 'image/png';
    else if (name.endsWith('.webp')) mime = 'image/webp';
    else if (name.endsWith('.gif')) mime = 'image/gif';
    else return { publicUrl: null, error: 'Use JPEG, PNG, WebP, or GIF.' };
  }

  const auth = await requireAuthenticatedUserId(userId);
  if ('error' in auth) return { publicUrl: null, error: auth.error };

  const ext =
    mime === 'image/jpeg'
      ? 'jpg'
      : mime === 'image/png'
        ? 'png'
        : mime === 'image/webp'
          ? 'webp'
          : 'gif';
  const path = `${auth.userId}/business-logo.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(SUPPLIER_LOGO_BUCKET)
    .upload(path, file, { upsert: true, contentType: mime, cacheControl: '3600' });
  if (upErr) {
    console.warn('[Traverion] supplier-logos upload failed:', upErr.message, { path });
    return { publicUrl: null, error: upErr.message };
  }

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

type PartnerSignupMeta = {
  supplier_business_name?: string;
  supplier_phone?: string;
  traverion_product?: string;
};

/** True when this auth user went through partner sign-up (metadata from SupplierAuth). */
export function authUserHasPartnerSignupMetadata(user: object | null | undefined): boolean {
  if (!user) return false;
  const m = (user as { user_metadata?: PartnerSignupMeta }).user_metadata;
  return (
    m?.traverion_product === 'partner' ||
    Boolean(m?.supplier_business_name?.trim()) ||
    Boolean(m?.supplier_phone?.trim())
  );
}

/**
 * Creates or updates `supplier_profiles` from partner sign-up metadata (same payload as post-login in SupplierAuth).
 * Use when the row is missing but the user is clearly a partner (e.g. after email-confirm deep link without re-running the login form).
 */
export async function ensureSupplierProfileFromAuthUser(
  user: { id: string; email?: string | null; user_metadata?: unknown }
): Promise<{ success: boolean; error?: string }> {
  const m = user.user_metadata as PartnerSignupMeta | undefined;
  const business = m?.supplier_business_name?.trim() || null;
  const phoneRaw = (m?.supplier_phone ?? '').trim();
  const emailLocal = typeof user.email === 'string' ? (user.email.split('@')[0] ?? '') : '';
  return ensureSupplierProfile(user.id, {
    display_name: business ?? (emailLocal || null),
    company_legal_name: business,
    contact_phone: phoneRaw ? normalizePhoneNumber(phoneRaw) : null,
  });
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

/** Update payout fields on an existing supplier_profiles row (profile must already exist). */
export async function updateSupplierPayout(
  userId: string,
  payload: {
    payout_method?: 'bank' | 'paypal' | 'none' | null;
    payout_iban?: string | null;
    payout_bic?: string | null;
    payout_paypal_email?: string | null;
    payment_cycle?: 'monthly' | 'biweekly' | null;
    payout_threshold_min?: number | null;
    payout_verification_status?: 'pending' | 'verified' | 'rejected' | null;
    payout_verification_submitted_at?: string | null;
    payout_verification_feedback?: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { data, error } = await supabase
    .from('supplier_profiles')
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id')
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Supplier profile not found' };
  return { success: true };
}

/**
 * Partial update by id (no upsert). Prefer for single fields like business_logo_url so we do not rely on
 * upsert merge behaviour for optional columns.
 */
export async function patchSupplierProfile(
  userId: string,
  patch: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { data, error } = await supabase
    .from('supplier_profiles')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id')
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  // RLS-denied updates return zero rows with no error — treat as failure (no false success).
  if (!data) return { success: false, error: 'Supplier profile not found' };
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
    business_verification_feedback: string | null;
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
  const { data, error } = await supabase
    .from('supplier_profiles')
    .update({
      ...payload,
      ...(normalizedCompanyName ? { display_name: normalizedCompanyName, company_legal_name: normalizedCompanyName } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id')
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Supplier profile not found' };
  return { success: true };
}

/** Public operator name/legal text for listing pages. Does not expose payout or KYC fields. */
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
  const { data, error } = await supabase.rpc('supplier_public_legal', { p_id: supplierId });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return null;
  return row as {
    display_name: string | null;
    company_legal_name: string | null;
    business_address: string | null;
    business_logo_url: string | null;
    privacy_policy_text: string | null;
    terms_conditions_text: string | null;
  };
}
