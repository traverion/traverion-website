/**
 * Normalize staff sign-in fields so pasted values match what Supabase Auth stores.
 * Copy/paste often adds BOM, zero-width spaces, or trailing newlines — all yield
 * `invalid_credentials` even when the visible text looks correct.
 */
export function normalizeStaffSignInEmail(raw: string): string {
  return raw.trim().toLowerCase().normalize('NFC');
}

/** Strip leading/trailing whitespace and invisible characters (BOM, ZWSP, etc.). */
export function normalizeStaffSignInPassword(raw: string): string {
  return raw.replace(/^[\s\uFEFF\u200B-\u200D]+|[\s\uFEFF\u200B-\u200D]+$/g, '');
}
