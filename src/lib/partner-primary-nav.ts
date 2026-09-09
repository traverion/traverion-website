/** Partner primary nav ids — Money must be one tap away on mobile. */
export const PARTNER_PRIMARY_NAV_SECTION_IDS = [
  'dashboard',
  'bookings',
  'earnings',
  'listings',
  'inbox',
] as const;

export function partnerPrimaryNavIncludesMoney(
  ids: readonly string[] = PARTNER_PRIMARY_NAV_SECTION_IDS
): boolean {
  return ids.includes('earnings');
}
