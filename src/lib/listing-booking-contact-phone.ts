import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { normalizePhoneNumber } from './phoneNormalize';

export function validateBookingContactPhone(
  raw: string,
  defaultCountry: CountryCode = 'FI'
): { ok: true; e164: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'Add a booking contact number to publish.' };
  }
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (!parsed || !parsed.isValid()) {
    return { ok: false, error: 'Enter a valid international phone number.' };
  }
  return { ok: true, e164: parsed.format('E.164') };
}

/** Prefer libphonenumber; fall back to platform normalize for edge cases. */
export function normalizeBookingContactPhoneInput(
  raw: string,
  defaultCountry: CountryCode = 'FI'
): string {
  const validated = validateBookingContactPhone(raw, defaultCountry);
  if (validated.ok) return validated.e164;
  return normalizePhoneNumber(raw);
}

export function formatBookingContactForDisplay(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164.trim());
  if (parsed) return parsed.formatInternational();
  return e164.trim();
}

export function suggestDefaultPhoneCountry(
  countryName: string | null | undefined
): CountryCode {
  const c = (countryName ?? '').trim().toLowerCase();
  if (!c) return 'FI';
  if (c.includes('finland') || c === 'fi') return 'FI';
  if (c.includes('sweden') || c === 'se') return 'SE';
  if (c.includes('norway') || c === 'no') return 'NO';
  if (c.includes('denmark') || c === 'dk') return 'DK';
  if (c.includes('germany') || c === 'de') return 'DE';
  if (c.includes('united kingdom') || c.includes('uk') || c === 'gb') return 'GB';
  if (c.includes('united states') || c === 'us' || c.includes('usa')) return 'US';
  return 'FI';
}
