/**
 * Partner shell access gate: early PostgREST reads after password login can
 * transiently return empty (cold JWT / auth header lag). Blocking too quickly
 * signs real partners out and bounces them to /login.
 */

/** Consecutive definitive `false` portal-access reads before treating as blocked. */
export const PARTNER_PORTAL_ACCESS_FALSE_STREAK_TO_BLOCK = 6;

/** Minimum 0-based attempt index before a false streak may block. */
export const PARTNER_PORTAL_ACCESS_MIN_ATTEMPT_TO_BLOCK = 5;

export function partnerPortalAccessFalseShouldBlock(params: {
  falseStreak: number;
  attempt: number;
}): boolean {
  return (
    params.falseStreak >= PARTNER_PORTAL_ACCESS_FALSE_STREAK_TO_BLOCK &&
    params.attempt >= PARTNER_PORTAL_ACCESS_MIN_ATTEMPT_TO_BLOCK
  );
}

/**
 * Travelers who hit /partner should be signed out and sent to login.
 * Accounts that signed up as partners must not be auto-signed-out on a
 * false-negative gate — show retry instead.
 */
export function partnerPortalBlockedShouldSignOut(params: {
  hasPartnerSignupMetadata: boolean;
}): boolean {
  return !params.hasPartnerSignupMetadata;
}
