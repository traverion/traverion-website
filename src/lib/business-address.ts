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

export function addressFieldErrors(address: StructuredBusinessAddress): Record<string, string> {
  const errors: Record<string, string> = {};
  (['street', 'postal', 'city', 'country'] as const).forEach((key) => {
    if (!address[key].trim()) errors[`address-${key}`] = BUSINESS_ADDRESS_FIELD_ERROR[key];
  });
  return errors;
}
