/**
 * P9.16 single choke point for Traverion business verification submission.
 * Updates the existing supplier_profiles row (no duplicate applications).
 */

import {
  fetchSupplierProfile,
  updateSupplierCompanyProfile,
  type SupplierProfileRow,
} from '../data/supabase-supplier-profile';
import { notifySupplierEvent } from '../data/supabase-supplier-messaging';
import { formatSupplierBusinessAddressFromParts } from './supplierAddress';
import { getSupplierBusinessProfileMissingReasons } from './supplierOnboarding';
import { supplierPortalPublicBaseUrl } from './partnerHost';
import type { BusinessOnboardingDraft } from './business-onboarding-wizard';
import {
  draftToBusinessProfileDraft,
  normalizeBusinessOnboardingDraft,
  validateBusinessOnboardingReview,
} from './business-onboarding-wizard';
import { serializeDirectors } from './business-identity-validation';

export type SubmitBusinessForReviewResult =
  | { ok: true; submittedAt: string; supplierId: string; profile: SupplierProfileRow | null; alreadyPending?: boolean }
  | { ok: false; error: string };

export async function submitSupplierBusinessForReview(
  userId: string,
  draft: BusinessOnboardingDraft
): Promise<SubmitBusinessForReviewResult> {
  const normalized = normalizeBusinessOnboardingDraft(draft);
  const reviewErr = validateBusinessOnboardingReview(normalized);
  if (reviewErr) return { ok: false, error: reviewErr };

  const gaps = getSupplierBusinessProfileMissingReasons(draftToBusinessProfileDraft(normalized));
  if (gaps.length) return { ok: false, error: `Still missing: ${gaps[0]}` };

  const existing = await fetchSupplierProfile(userId);
  const status = (existing?.verification_status ?? '').trim().toLowerCase();
  const submittedAtExisting = (existing?.verification_submitted_at ?? '').trim();
  if (status === 'pending' && submittedAtExisting) {
    return {
      ok: true,
      submittedAt: submittedAtExisting,
      supplierId: existing?.id ?? userId,
      profile: existing,
      alreadyPending: true,
    };
  }
  if (status === 'verified') {
    return { ok: false, error: 'Your business is already verified. Open Business settings to maintain it.' };
  }

  const combinedAddress = formatSupplierBusinessAddressFromParts({
    address_street: normalized.address_street,
    address_postal_code: normalized.address_postal_code,
    address_city: normalized.address_city,
    address_country: normalized.address_country,
  });
  const submittedNow = new Date().toISOString();
  const directors = serializeDirectors(normalized.directors);
  const res = await updateSupplierCompanyProfile(userId, {
    business_type: normalized.business_type || null,
    display_name: normalized.display_name.trim() || null,
    company_legal_name: normalized.company_legal_name.trim() || null,
    contact_phone: normalized.contact_phone.trim() || null,
    company_registration_number: normalized.company_registration_number.trim() || null,
    managing_directors: directors || null,
    address_street: normalized.address_street.trim() || null,
    address_country: normalized.address_country.trim() || null,
    address_city: normalized.address_city.trim() || null,
    address_postal_code: normalized.address_postal_code.trim() || null,
    business_address: combinedAddress.trim() || null,
    tax_id: normalized.tax_id.trim() || null,
    vat_id: normalized.vat_id.trim() || null,
    company_registration_document_path: normalized.company_registration_document_path.trim() || null,
    verification_status: 'pending',
    verification_submitted_at: submittedNow,
    business_verification_feedback: null,
  });

  if (!res.success) {
    return { ok: false, error: res.error ?? 'Could not submit business verification.' };
  }

  const ownerId = res.supplierId ?? userId;
  void notifySupplierEvent({
    supplierId: ownerId,
    eventType: 'verification_submitted',
    portalBaseUrl: supplierPortalPublicBaseUrl(),
    idempotencyKey: `supplier:verification_submitted:${ownerId}:${submittedNow.slice(0, 16)}`,
  });

  const profile = await fetchSupplierProfile(userId);
  return { ok: true, submittedAt: submittedNow, supplierId: ownerId, profile };
}
