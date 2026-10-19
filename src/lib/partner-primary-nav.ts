/** Partner primary nav ids — Calendar must be one tap away on mobile for daily ops. */
export const PARTNER_PRIMARY_NAV_SECTION_IDS = [
  'dashboard',
  'bookings',
  'listings',
  'availability',
] as const;

/**
 * Mobile More-tab destinations (not in the bottom primary strip).
 * Income lives here; Calendar does not (it is primary).
 */
export const PARTNER_MORE_NAV_SECTION_IDS = [
  'create', // More sheet primary CTA — not listed in PARTNER_MORE_GROUPS items
  'inbox',
  'reviews',
  'discounts',
  'pickup',
  'reservations',
  'stay-calendar',
  'earnings',
  'performance',
  'help',
  'business-profile',
  'account-settings',
  'onboarding',
  'change-password',
] as const;

export function partnerPrimaryNavIncludesCalendar(
  ids: readonly string[] = PARTNER_PRIMARY_NAV_SECTION_IDS
): boolean {
  return ids.includes('availability');
}

export function partnerMoreNavIncludesSection(
  sectionId: string,
  ids: readonly string[] = PARTNER_MORE_NAV_SECTION_IDS
): boolean {
  return (ids as readonly string[]).includes(sectionId);
}

/** @deprecated Income moved to sidebar/More; prefer partnerPrimaryNavIncludesCalendar. */
export function partnerPrimaryNavIncludesMoney(
  ids: readonly string[] = PARTNER_PRIMARY_NAV_SECTION_IDS
): boolean {
  return ids.includes('earnings');
}
