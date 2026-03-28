/**
 * Canonical form for storing and deduplicating phone numbers globally.
 * Strips all non-digits (spaces, dashes, parentheses, dots, etc.), then
 * stores as E.164-style `+{digits}` so the same number in different formats
 * maps to one string for uniqueness checks and DB comparison.
 *
 * Examples:
 * - "+358 45 880 3060" → "+358458803060"
 * - "+1 (555) 123-4567" → "+15551234567"
 * - "358458803060" → "+358458803060"
 *
 * Users should enter numbers with country code (leading + or full international
 * digits). National-only input is still normalized consistently but may not
 * match another user who entered the same line with a country prefix.
 */
export function normalizePhoneNumber(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  return `+${digits}`;
}
