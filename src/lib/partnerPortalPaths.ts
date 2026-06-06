/** Partner portal routes (served on partner.traverion.com and on localhost for dev). */

export const PARTNER_LOGIN_PATH = '/login';

/** Password reset email links land here (recovery session in URL hash). */
export const PARTNER_RESET_PASSWORD_PATH = '/reset-password';

/** Traveler-only reset page on www / apex (partner uses /reset-password on partner host). */
export const TRAVELER_RESET_PASSWORD_PATH = '/account/reset-password';

/** Legacy traveler reset URL — redirect to TRAVELER_RESET_PASSWORD_PATH. */
export const LEGACY_TRAVELER_RESET_PASSWORD_PATH = '/reset-password';

/** Email confirmation links land here (hash tokens); not useful without Supabase’s signed fragment. */
export const PARTNER_EMAIL_VERIFIED_PATH = '/email-verified';

/** Dashboard at /partner; sections at /partner/listings, /partner/discounts, /partner/bookings, … */
export const PARTNER_APP_BASE = '/partner';

/** Public legal & info pages on the partner host (not used on www — see `isPartnerMarketingPathForCurrentHost` in partnerHost). */
export const PARTNER_TERMS_OF_SERVICE_PATH = '/termsofservice';
export const PARTNER_PRIVACY_POLICY_PATH = '/privacypolicy';
export const PARTNER_LEGAL_NOTICE_PATH = '/legalnotice';
export const PARTNER_COOKIES_POLICY_PATH = '/cookiespolicy';

export const PARTNER_MARKETING_STATIC_PATHS = [
  PARTNER_TERMS_OF_SERVICE_PATH,
  PARTNER_PRIVACY_POLICY_PATH,
  PARTNER_LEGAL_NOTICE_PATH,
  PARTNER_COOKIES_POLICY_PATH,
  '/contact',
] as const;

function normalizePartnerPath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

export function isPartnerMarketingStaticPath(pathname: string): boolean {
  const p = normalizePartnerPath(pathname);
  return (PARTNER_MARKETING_STATIC_PATHS as readonly string[]).includes(p);
}

export type PartnerMarketingPageId =
  | 'termsofservice'
  | 'privacypolicy'
  | 'legalnotice'
  | 'cookiespolicy'
  | 'contact';

const PATH_TO_MARKETING_PAGE: Record<string, PartnerMarketingPageId> = {
  [PARTNER_TERMS_OF_SERVICE_PATH]: 'termsofservice',
  [PARTNER_PRIVACY_POLICY_PATH]: 'privacypolicy',
  [PARTNER_LEGAL_NOTICE_PATH]: 'legalnotice',
  [PARTNER_COOKIES_POLICY_PATH]: 'cookiespolicy',
  '/contact': 'contact',
};

export function partnerMarketingPageFromPathname(pathname: string): PartnerMarketingPageId | null {
  const p = normalizePartnerPath(pathname);
  return PATH_TO_MARKETING_PAGE[p] ?? null;
}

export function isPartnerPortalPath(pathname: string): boolean {
  const p = normalizePartnerPath(pathname);
  return (
    p === PARTNER_LOGIN_PATH ||
    p === PARTNER_RESET_PASSWORD_PATH ||
    p === PARTNER_EMAIL_VERIFIED_PATH ||
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
