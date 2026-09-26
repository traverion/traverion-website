/**
 * Public-facing traveler name for reviews / lead guest.
 * Never invent from email local-part — partner sessions on localhost share auth storage.
 */

export type TravelerNameMetadata = {
  full_name?: string;
  name?: string;
  customer_first_name?: string;
  customer_last_name?: string;
};

export function travelerDisplayNameFromSources(params: {
  profileDisplayName?: string | null;
  metadata?: TravelerNameMetadata | null;
  /** Already-typed form value (checkout lead guest). */
  formValue?: string | null;
  fallback?: string;
}): string {
  const form = (params.formValue ?? '').trim();
  if (form) return form;
  const profile = (params.profileDisplayName ?? '').trim();
  if (profile) return profile;
  const meta = params.metadata;
  const fromMeta = (
    meta?.full_name ||
    meta?.name ||
    [meta?.customer_first_name, meta?.customer_last_name].filter(Boolean).join(' ')
  ).trim();
  if (fromMeta) return fromMeta;
  return params.fallback ?? 'Guest';
}
