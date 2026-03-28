/**
 * Single canonical form for storing and deduplicating phone numbers.
 * Strips spaces, dashes, and parentheses. Prefers E.164-style +{digits}.
 *
 * Examples:
 * - "+358 45 880 3060" → "+358458803060"
 * - "+358458803060" → "+358458803060"
 * - "0458803060" / "04 588 030 60" → "+358458803060" (Finnish national mobile)
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

  // Finnish national mobiles commonly 04x… or 050… (avoid broad 0→358 for non-FI numbers)
  if (
    !hadPlus &&
    (/^04[0-9]\d{7,8}$/.test(digits) || /^050\d{7,8}$/.test(digits))
  ) {
    return `+358${digits.slice(1)}`;
  }

  if (hadPlus) {
    return `+${digits}`;
  }

  return `+${digits}`;
}
