/**
 * Deterministic traveler vs partner URL decisions.
 * Pure functions so host routing can be tested without a browser.
 *
 * Traveler marketing hosts (www / apex): `/login` is traveler sign-in, never partner.
 * Partner host: `/login` and `/signup` are partner-only; `/` is the supplier landing page.
 */

export const TRAVELER_MARKETING_HOSTNAMES = ['www.traverion.com', 'traverion.com'] as const;

export function isTravelerMarketingHostname(hostname: string): boolean {
  return (TRAVELER_MARKETING_HOSTNAMES as readonly string[]).includes(hostname);
}

export function isPartnerHostname(hostname: string): boolean {
  return hostname === 'partner.traverion.com';
}

export function isLocalDevHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * On www/apex, `/login` is a traveler URL (same product as `/log-in`).
 * Returns the rewritten path + preserved search, or null if no rewrite.
 */
export function travelerMarketingLoginAlias(
  hostname: string,
  pathname: string,
  search = ''
): string | null {
  if (!isTravelerMarketingHostname(hostname)) return null;
  const p = pathname.replace(/\/$/, '') || '/';
  if (p !== '/login') return null;
  return `/log-in${search}`;
}

/** Recovery on traveler marketing `/login` stays on www `/set-password`, never partner. */
export function travelerMarketingRecoveryPath(
  hostname: string,
  pathname: string
): '/set-password' | '/reset-password' | null {
  const p = pathname.replace(/\/$/, '') || '/';
  if (isPartnerHostname(hostname)) {
    if (p === '/login' || p === '/signup' || p === '/partner' || p.startsWith('/partner/')) {
      return '/reset-password';
    }
    return null;
  }
  if (isTravelerMarketingHostname(hostname) && (p === '/login' || p === '/log-in' || p === '/sign-up' || p === '/auth')) {
    return '/set-password';
  }
  return null;
}

/** Pages a traveler login may return to (consumer product only). */
export const TRAVELER_POST_AUTH_PAGES = [
  'home',
  'packages',
  'stays',
  'cart',
  'bookings',
  'booking-confirmed',
  'account',
  'wishlist',
  'contact',
] as const;

export type TravelerPostAuthPage = (typeof TRAVELER_POST_AUTH_PAGES)[number];
