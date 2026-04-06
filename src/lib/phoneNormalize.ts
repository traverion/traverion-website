/**
 * Canonical form for storing and deduplicating phone numbers.
 * Strips all non-digits (spaces, dashes, parentheses, etc.), then stores as
 * E.164-style `+{digits}`. Finnish national mobiles `04x…` / `050…` map to
 * `+358…` so they match international `+358…` (same rules as Postgres
 * `normalize_contact_phone`).
 *
 * Examples:
 * - "+358 40 123 4567" → "+358401234567"
 * - "0401234567" → "+358401234567"
 * - "+1 (555) 123-4567" → "+15551234567"
 */
export function normalizePhoneNumber(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  const hadPlus = trimmed.startsWith('+');

  if (digits.startsWith('358')) {
    return `+${digits}`;
  }

  if (
    !hadPlus &&
    (/^04[0-9]\d{7,8}$/.test(digits) || /^050\d{7,8}$/.test(digits))
  ) {
    return `+358${digits.slice(1)}`;
  }

  return `+${digits}`;
}
