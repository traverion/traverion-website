/**
 * Lead-guest autofill for traveler checkout.
 * Prefer consumer_profiles.display_name, then customer_* auth metadata only.
 * Ignore display_name / full_name / name / supplier_business_name — partner signup
 * on localhost same-origin auth can store a business name in those fields.
 */

export type TravelerCheckoutAuthMetadata = {
  customer_first_name?: string;
  customer_last_name?: string;
  customer_phone?: string;
  phone?: string;
  /** Ignored for lead guest — may be a supplier business name on shared sessions. */
  display_name?: string;
  full_name?: string;
  name?: string;
  supplier_business_name?: string;
};

export function travelerLeadGuestNameFromAuth(params: {
  consumerDisplayName?: string | null;
  metadata?: TravelerCheckoutAuthMetadata | null;
}): string {
  const fromProfile = (params.consumerDisplayName ?? '').trim();
  if (fromProfile) return fromProfile;
  const meta = params.metadata;
  return [meta?.customer_first_name, meta?.customer_last_name].filter(Boolean).join(' ').trim();
}

export function travelerLeadGuestPhoneFromAuth(params: {
  consumerPhone?: string | null;
  metadata?: TravelerCheckoutAuthMetadata | null;
}): string {
  const fromProfile = (params.consumerPhone ?? '').trim();
  if (fromProfile) return fromProfile;
  const meta = params.metadata;
  return (meta?.customer_phone ?? meta?.phone ?? '').trim();
}
