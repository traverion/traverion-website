import type { SupplierProfileRow } from '../data/supabase-supplier-profile';

/** Multi-line string for legal templates and legacy `business_address` column. */
export function formatSupplierBusinessAddressFromParts(parts: {
  address_street?: string | null;
  address_postal_code?: string | null;
  address_city?: string | null;
  address_country?: string | null;
}): string {
  const street = parts.address_street?.trim() ?? '';
  const cityLine = [parts.address_postal_code?.trim(), parts.address_city?.trim()].filter(Boolean).join(' ');
  const country = parts.address_country?.trim() ?? '';
  const lines = [street, cityLine, country].filter(Boolean);
  return lines.join('\n');
}

/** True when structured fields are all set, or legacy single `business_address` is non-empty. */
export function isSupplierAddressComplete(profile: SupplierProfileRow | null | undefined): boolean {
  if (!profile) return false;
  const s = profile.address_street?.trim();
  const c = profile.address_city?.trim();
  const z = profile.address_postal_code?.trim();
  const co = profile.address_country?.trim();
  if (s && c && z && co) return true;
  return Boolean(profile.business_address?.trim());
}
