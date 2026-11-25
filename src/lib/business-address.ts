import { getCountries, type CountryCode } from 'libphonenumber-js';

/** Structured company address. Empty parts stay empty — nothing is inferred from a formatted line. */

export type StructuredBusinessAddress = {
  street: string;
  postal: string;
  city: string;
  country: string;
};

export function structuredBusinessAddress(parts: {
  street?: string | null;
  postal?: string | null;
  city?: string | null;
  country?: string | null;
  countryCode?: string | null;
}): StructuredBusinessAddress {
  const code = (parts.countryCode ?? '').trim();
  const countryName = (parts.country ?? '').trim();
  return {
    street: (parts.street ?? '').trim(),
    postal: (parts.postal ?? '').trim(),
    city: (parts.city ?? '').trim(),
    country: countryName || (/^[A-Za-z]{2}$/.test(code) ? code.toUpperCase() : ''),
  };
}

export function businessAddressSuggestionText(row: { name: string; address: string }): string {
  return [row.name.trim(), row.address.trim()].filter(Boolean).join(', ');
}

export function missingBusinessAddressField(
  address: StructuredBusinessAddress
): 'street' | 'postal' | 'city' | 'country' | null {
  if (!address.street.trim()) return 'street';
  if (!address.postal.trim()) return 'postal';
  if (!address.city.trim()) return 'city';
  if (!address.country.trim()) return 'country';
  return null;
}

export const BUSINESS_ADDRESS_FIELD_ERROR: Record<'street' | 'postal' | 'city' | 'country', string> = {
  street: 'Enter the street address.',
  postal: 'Enter the postal code.',
  city: 'Enter the city.',
  country: 'Enter the country.',
};

const PRIORITY_COUNTRY_CODES = ['FI', 'SE', 'NO', 'DK', 'EE', 'DE', 'GB', 'US', 'FR', 'ES', 'IT', 'NL'];

function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** English country name for a stored ISO code or an existing country name. */
export function businessCountryName(codeOrName: string | null | undefined): string {
  const raw = (codeOrName ?? '').trim();
  if (!raw) return '';
  if (/^[A-Za-z]{2}$/.test(raw)) return regionName(raw.toUpperCase());
  return raw;
}

/** Searchable country list. The current value stays selectable even if it is not a known region. */
export function businessCountryOptions(current?: string | null): { value: string; label: string }[] {
  const codes = getCountries();
  const priority = PRIORITY_COUNTRY_CODES.filter((code) => codes.includes(code as CountryCode));
  const rest = codes
    .filter((code) => !priority.includes(code))
    .sort((a, b) => regionName(a).localeCompare(regionName(b)));
  const seen = new Set<string>();
  const options: { value: string; label: string }[] = [];
  for (const code of [...priority, ...rest]) {
    const name = regionName(code);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    options.push({ value: name, label: name });
  }
  const extra = businessCountryName(current);
  if (extra && !seen.has(extra)) options.unshift({ value: extra, label: extra });
  return options;
}

export function addressFieldErrors(address: StructuredBusinessAddress): Record<string, string> {
  const errors: Record<string, string> = {};
  (['street', 'postal', 'city', 'country'] as const).forEach((key) => {
    if (!address[key].trim()) errors[`address-${key}`] = BUSINESS_ADDRESS_FIELD_ERROR[key];
  });
  return errors;
}
