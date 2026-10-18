/** Structured private stay address. The public listing keeps the city only. */

export type StayAddressParts = {
  street: string;
  unit: string;
  postal: string;
  city: string;
  country: string;
  countryCode: string;
};

export type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

export function stayAddressKey(street: string, postal: string, city: string): string {
  return [street, postal, city].map((part) => part.trim().toLowerCase()).join('|');
}

function component(rows: readonly GoogleAddressComponent[], type: string, short = false): string {
  const row = rows.find((item) => item.types?.includes(type));
  const text = short ? row?.shortText : row?.longText;
  return (text ?? '').trim();
}

/** Read a Places address-details payload. Missing coordinates are not filled in. */
export function stayAddressFromGoogleComponents(
  components: readonly GoogleAddressComponent[] | null | undefined,
  formattedAddress: string
): StayAddressParts {
  const rows = components ?? [];
  const number = component(rows, 'street_number');
  const route = component(rows, 'route');
  const premise = component(rows, 'premise');
  const formattedStreet = formattedAddress.split(',')[0]?.trim() ?? '';
  const formattedHasStreet =
    Boolean(number && route) &&
    formattedStreet.toLowerCase().includes(route.toLowerCase()) &&
    formattedStreet.toLowerCase().includes(number.toLowerCase());
  const street = formattedHasStreet ? formattedStreet : [number, route].filter(Boolean).join(' ').trim() || premise;
  const city =
    component(rows, 'locality') ||
    component(rows, 'postal_town') ||
    component(rows, 'administrative_area_level_3') ||
    component(rows, 'administrative_area_level_2');
  const postal = component(rows, 'postal_code');
  const country = component(rows, 'country');
  const countryCode = component(rows, 'country', true).toUpperCase();
  return {
    street: (street || formattedStreet).slice(0, 160),
    unit: component(rows, 'subpremise').slice(0, 40),
    postal: postal.slice(0, 16),
    city: city.slice(0, 80),
    country: country.slice(0, 80),
    countryCode: /^[A-Z]{2}$/.test(countryCode) ? countryCode : '',
  };
}

function uniqueParts(parts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = part.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(part.trim());
  }
  return out;
}

/** One private line for booked guests. City and postal are included once. */
export function composeStayCheckInAddress(input: {
  street: string;
  unit: string;
  postal: string;
  city: string;
  notes?: string;
}): string {
  const city = input.city.trim();
  const postal = input.postal.trim();
  const notes = (input.notes ?? '').trim();
  const streetParts = uniqueParts(
    input.street
      .split(',')
      .map((part) => part.trim())
      .filter((part) => {
        const key = part.toLowerCase();
        if (!key) return false;
        if (city && key === city.toLowerCase()) return false;
        if (postal && key === postal.toLowerCase()) return false;
        if (postal && city && key === `${postal} ${city}`.toLowerCase()) return false;
        if (/^unit\s+/i.test(part)) return false;
        return true;
      })
  );
  const street = streetParts.join(', ');
  const unit = input.unit.trim();
  const locality = [postal, city].filter(Boolean).join(' ');
  const core = uniqueParts([street, unit ? `Unit ${unit}` : '', locality].filter(Boolean)).join(', ');
  if (!notes || core.toLowerCase().includes(notes.toLowerCase())) return core.slice(0, 400);
  return `${core}${core ? ', ' : ''}${notes}`.slice(0, 400);
}

/** Recover street and postal when an older draft stored the whole line in the street field. */
export function parseLegacyStayAddress(line: string, city: string): { street: string; unit: string; postal: string } {
  const cityKey = city.trim().toLowerCase();
  let unit = '';
  const parts = line
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const unitMatch = part.match(/^unit\s+(.+)$/i);
      if (unitMatch) {
        unit = unit || unitMatch[1].trim().slice(0, 40);
        return '';
      }
      return part;
    })
    .filter(Boolean);
  let postal = '';
  const streetParts: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (cityKey && (key === cityKey || key.endsWith(` ${cityKey}`))) {
      const before = part.slice(0, part.length - city.length).trim();
      if (/^\d{3,10}$/.test(before) && !postal) postal = before;
      continue;
    }
    if (/^\d{3,10}$/.test(part)) {
      if (!postal) postal = part;
      continue;
    }
    streetParts.push(part);
  }
  return {
    street: uniqueParts(streetParts).join(', ').slice(0, 160),
    unit,
    postal: postal.slice(0, 16),
  };
}

export function stayPinMatchesAddress(input: {
  source: string;
  addressKey: string;
  street: string;
  postal: string;
  city: string;
  lat: number | null;
  lng: number | null;
}): boolean {
  if (input.lat == null || input.lng == null) return false;
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return false;
  if (input.lat < -90 || input.lat > 90 || input.lng < -180 || input.lng > 180) return false;
  if (input.source !== 'address' && input.source !== 'adjusted') return false;
  return input.addressKey === stayAddressKey(input.street, input.postal, input.city);
}
