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
import { draftToBusinessProfileDraft, validateBusinessOnboardingReview } from './business-onboarding-wizard';

export type SubmitBusinessForReviewResult =
  | { ok: true; submittedAt: string; supplierId: string; profile: SupplierProfileRow | null; alreadyPending?: boolean }
  | { ok: false; error: string };

export async function submitSupplierBusinessForReview(
  userId: string,
  draft: BusinessOnboardingDraft
): Promise<SubmitBusinessForReviewResult> {
  const reviewErr = validateBusinessOnboardingReview(draft);
  if (reviewErr) return { ok: false, error: reviewErr };

  const gaps = getSupplierBusinessProfileMissingReasons(draftToBusinessProfileDraft(draft));
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
    address_street: draft.address_street,
    address_postal_code: draft.address_postal_code,
    address_city: draft.address_city,
    address_country: draft.address_country,
  });
  const submittedNow = new Date().toISOString();
  const res = await updateSupplierCompanyProfile(userId, {
    business_type: draft.business_type || null,
    display_name: draft.display_name.trim() || null,
    company_legal_name: draft.company_legal_name.trim() || null,
    contact_phone: draft.contact_phone.trim() || null,
    company_registration_number: draft.company_registration_number.trim() || null,
    managing_directors: draft.managing_directors.trim() || null,
    address_street: draft.address_street.trim() || null,
    address_country: draft.address_country.trim() || null,
    address_city: draft.address_city.trim() || null,
    address_postal_code: draft.address_postal_code.trim() || null,
    business_address: combinedAddress.trim() || null,
    tax_id: draft.tax_id.trim() || null,
    vat_id: draft.vat_id.trim() || null,
    company_registration_document_path: draft.company_registration_document_path.trim() || null,
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
