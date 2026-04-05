/** Partner portal routes (served on partner.traverion.com and on localhost for dev). */

export const PARTNER_LOGIN_PATH = '/login';

/** Dashboard at /partner; sections at /partner/listings, /partner/bookings, … */
export const PARTNER_APP_BASE = '/partner';

export function isPartnerPortalPath(pathname: string): boolean {
  const p = pathname.replace(/\/$/, '') || '/';
  return (
    p === PARTNER_LOGIN_PATH ||
    p === PARTNER_APP_BASE ||
    p.startsWith(`${PARTNER_APP_BASE}/`)
  );
}

/** Map old /supplier* URLs to new /partner* paths (pathname only, no query/hash). */
export function legacySupplierPathToPartnerPath(pathname: string): string {
  const p = pathname.replace(/\/$/, '') || '/';
  if (p === '/supplier-log-in') return PARTNER_LOGIN_PATH;
  if (p === '/supplier') return PARTNER_APP_BASE;
  if (p.startsWith('/supplier/')) return `${PARTNER_APP_BASE}${p.slice('/supplier'.length)}`;
  return p;
}
