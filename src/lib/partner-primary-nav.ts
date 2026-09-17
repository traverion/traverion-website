/** Partner primary nav ids — Money must be one tap away on mobile. Calendar is operational core. */
export const PARTNER_PRIMARY_NAV_SECTION_IDS = [
  'dashboard',
  'bookings',
  'availability',
  'listings',
  'earnings',
] as const;

export function partnerPrimaryNavIncludesMoney(
  ids: readonly string[] = PARTNER_PRIMARY_NAV_SECTION_IDS
): boolean {
  return ids.includes('earnings');
}
