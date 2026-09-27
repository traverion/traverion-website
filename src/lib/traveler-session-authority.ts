/**
 * Traveler vs partner session authority (Phase 1082).
 * Shared Supabase storage on localhost can restore a partner-only session on www routes.
 * Authority is IDENTITY + ROLE: supplier_profiles without consumer_profiles is partner-only.
 */

export function travelerSessionIsPartnerOnly(params: {
  hasSupplierProfile: boolean;
  hasConsumerProfile: boolean;
  isAdmin?: boolean;
}): boolean {
  if (params.isAdmin) return false;
  return params.hasSupplierProfile && !params.hasConsumerProfile;
}
