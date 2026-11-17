/**
 * Country-aware business identity validation (P9.18).
 * Finnish Business ID (Y-tunnus) and VAT ID with light normalization.
 */

const FI_YTUNNUS_WEIGHTS = [7, 9, 10, 5, 8, 4, 2] as const;

export function normalizeCountryCode(raw: string | null | undefined): string {
  const t = (raw ?? '').trim().toUpperCase();
  if (t === 'FINLAND') return 'FI';
  if (/^[A-Z]{2}$/.test(t)) return t;
  return t;
}

/** Digits only from a Finnish business id / VAT candidate. */
function fiDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Normalize Finnish Business ID to NNNNNNN-C when possible.
 * Accepts "1234567-8", "12345678", "FI12345678".
 */
export function normalizeFinnishBusinessId(raw: string | null | undefined): string {
  const digits = fiDigits(raw ?? '');
  if (digits.length === 8) {
    return `${digits.slice(0, 7)}-${digits.slice(7)}`;
  }
  const trimmed = (raw ?? '').trim().replace(/\s+/g, '');
  const m = /^(\d{7})-?(\d)$/.exec(trimmed);
  if (m) return `${m[1]}-${m[2]}`;
  return trimmed;
}

/** Normalize Finnish VAT to FI + 8 digits. */
export function normalizeFinnishVatId(raw: string | null | undefined): string {
  const upper = (raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!upper) return '';
  let digits = fiDigits(upper.startsWith('FI') ? upper.slice(2) : upper);
  if (digits.length === 7) {
    // Incomplete without check digit — leave as-is for validator.
    return upper.startsWith('FI') ? `FI${digits}` : upper;
  }
  if (digits.length === 8) return `FI${digits}`;
  // From Y-tunnus form
  const biz = normalizeFinnishBusinessId(raw);
  const m = /^(\d{7})-(\d)$/.exec(biz);
  if (m) return `FI${m[1]}${m[2]}`;
  return upper;
}

export function isValidFinnishBusinessId(raw: string | null | undefined): boolean {
  const normalized = normalizeFinnishBusinessId(raw);
  const m = /^(\d{7})-(\d)$/.exec(normalized);
  if (!m) return false;
  const body = m[1]!;
  const check = Number(m[2]);
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum += Number(body[i]) * FI_YTUNNUS_WEIGHTS[i]!;
  }
  const rem = sum % 11;
  if (rem === 1) return false;
  const expected = rem === 0 ? 0 : 11 - rem;
  return check === expected;
}

export function isValidFinnishVatId(raw: string | null | undefined): boolean {
  const normalized = normalizeFinnishVatId(raw);
  const m = /^FI(\d{8})$/.exec(normalized);
  if (!m) return false;
  return isValidFinnishBusinessId(`${m[1]!.slice(0, 7)}-${m[1]!.slice(7)}`);
}

export function validateRegistrationNumberForCountry(
  country: string | null | undefined,
  registrationNumber: string | null | undefined
): string | null {
  const value = (registrationNumber ?? '').trim();
  if (!value) return 'Enter your company registration number.';
  const cc = normalizeCountryCode(country);
  if (cc === 'FI') {
    if (!isValidFinnishBusinessId(value)) {
      return 'Enter a valid Finnish Business ID (for example 1234567-8).';
    }
  }
  return null;
}

export function validateVatIdForCountry(
  country: string | null | undefined,
  vatId: string | null | undefined,
  opts?: { required?: boolean }
): string | null {
  const required = opts?.required !== false;
  const value = (vatId ?? '').trim();
  if (!value) {
    return required ? 'Enter your VAT ID.' : null;
  }
  const cc = normalizeCountryCode(country);
  if (cc === 'FI') {
    if (!isValidFinnishVatId(value)) {
      return 'Enter a valid Finnish VAT ID (for example FI12345678).';
    }
  }
  return null;
}

/** Persist directors as newline-separated names. */
export function serializeDirectors(directors: string[]): string {
  return directors
    .map((d) => d.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Parse stored managing_directors into a list.
 * Supports newline, semicolon, pipe, or legacy comma-separated values.
 */
export function parseDirectors(raw: string | null | undefined): string[] {
  const text = (raw ?? '').trim();
  if (!text) return [''];
  let parts: string[];
  if (/[\n;|]/.test(text)) {
    parts = text.split(/[\n;|]+/);
  } else if (text.includes(',') && !/,\s*(jr|sr|ii|iii|iv)\b/i.test(text)) {
    parts = text.split(',');
  } else {
    parts = [text];
  }
  const cleaned = parts.map((p) => p.trim()).filter(Boolean);
  return cleaned.length ? cleaned : [''];
}

export function validateDirectorsList(directors: string[]): string | null {
  const named = directors.map((d) => d.trim()).filter(Boolean);
  if (!named.length) return 'Add at least one director.';
  return null;
}

export const BUSINESS_COUNTRY_LABELS: Record<string, string> = {
  FI: 'Finland',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  EE: 'Estonia',
  DE: 'Germany',
};

export function businessCountryLabel(code: string | null | undefined): string {
  const cc = normalizeCountryCode(code);
  if (!cc) return '—';
  return BUSINESS_COUNTRY_LABELS[cc] ?? cc;
}
