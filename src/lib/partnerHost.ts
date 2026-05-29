/**
 * Partner (supplier) portal: partner.traverion.com with /login and /partner/* .
 *
 * Supabase → Authentication → URL configuration — add Redirect URLs:
 *   https://partner.traverion.com/login**
 *   https://partner.traverion.com/reset-password**
 *   https://partner.traverion.com/email-verified**
 *   https://partner.traverion.com/partner**
 * (Keep old patterns briefly if emails already sent: supplier-log-in, /supplier**)
 *
 * Optional env: VITE_PARTNER_PORTAL_URL (staging).
 */

import {
  PARTNER_LOGIN_PATH,
  PARTNER_RESET_PASSWORD_PATH,
  isPartnerMarketingStaticPath,
  isPartnerPortalPath,
  legacySupplierPathToPartnerPath,
} from './partnerPortalPaths';

export const PARTNER_HOSTNAME = 'partner.traverion.com';

const TRAVELER_MARKETING_HOSTNAMES = new Set(['www.traverion.com', 'traverion.com']);

export function isTraverionPartnerHost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === PARTNER_HOSTNAME;
}

/**
 * Partner portal SPA routes (/login, /partner/*, …) — scoped to partner host (and localhost dev).
 * `/reset-password` exists on both www and partner; only the partner host uses the supplier shell.
 */
export function isPartnerPortalPathForCurrentHost(pathname: string): boolean {
  if (typeof window === 'undefined') return false;
  const p = pathname.replace(/\/$/, '') || '/';

  if (p === PARTNER_RESET_PASSWORD_PATH) {
    return isTraverionPartnerHost();
  }

  if (!isPartnerPortalPath(p)) return false;
  if (isTraverionPartnerHost()) return true;

  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

/**
 * Marketing/legal paths (e.g. /termsofservice) belong to the partner SPA on partner.traverion.com.
 * On localhost, the same paths are served for preview except /contact (reserved for the consumer contact page).
 */
export function isPartnerMarketingPathForCurrentHost(pathname: string): boolean {
  if (typeof window === 'undefined') return false;
  if (!isPartnerMarketingStaticPath(pathname)) return false;
  if (isTraverionPartnerHost()) return true;
  const p = pathname.replace(/\/$/, '') || '/';
  if (p === '/contact') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

function isTravelerMarketingHost(): boolean {
  if (typeof window === 'undefined') return false;
  return TRAVELER_MARKETING_HOSTNAMES.has(window.location.hostname);
}

/** Canonical origin for supplier emails, Supabase redirectTo, and absolute links from the traveler site. */
export function supplierPortalPublicBaseUrl(): string {
  const v = import.meta.env.VITE_PARTNER_PORTAL_URL as string | undefined;
  if (typeof v === 'string' && v.trim()) return v.replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return window.location.origin.replace(/\/$/, '');
  }
  return `https://${PARTNER_HOSTNAME}`;
}

/** On partner host, rewrite legacy /supplier* → /login and /partner*. */
export function rewriteLegacySupplierPathsOnPartnerHost(): void {
  if (typeof window === 'undefined') return;
  if (!isTraverionPartnerHost()) return;
  const p = window.location.pathname.replace(/\/$/, '') || '/';
  if (p !== '/supplier-log-in' && p !== '/supplier' && !p.startsWith('/supplier/')) return;
  const next = legacySupplierPathToPartnerPath(p);
  window.history.replaceState(
    {},
    '',
    `${next}${window.location.search}${window.location.hash}`
  );
}

/** On partner host, unknown paths → /login (SPA entry). Preserves search + hash. */
export function normalizePartnerHostForSupplierSpa(): void {
  if (typeof window === 'undefined') return;
  if (!isTraverionPartnerHost()) return;
  const p = window.location.pathname.replace(/\/$/, '') || '/';
  if (isPartnerPortalPath(p)) return;
  if (isTraverionPartnerHost() && isPartnerMarketingStaticPath(p)) return;
  const qs = window.location.search;
  const hash = window.location.hash;
  window.history.replaceState({}, '', `${PARTNER_LOGIN_PATH}${qs}${hash}`);
}

/** www / apex: redirect old supplier URLs to partner host with new paths. */
export function redirectTravelerMarketingSupplierPathsToPartnerHost(): void {
  if (typeof window === 'undefined') return;
  if (!isTravelerMarketingHost()) return;
  const p = window.location.pathname.replace(/\/$/, '') || '/';
  if (p !== '/supplier-log-in' && p !== '/supplier' && !p.startsWith('/supplier/')) return;
  const mapped = legacySupplierPathToPartnerPath(p);
  const target = `${supplierPortalPublicBaseUrl()}${mapped}${window.location.search}${window.location.hash}`;
  window.location.replace(target);
}

/** www / apex: /login → partner login (same path on partner host). */
export function redirectTravelerMarketingPartnerLoginShortcut(): void {
  if (typeof window === 'undefined') return;
  if (!isTravelerMarketingHost()) return;
  const p = window.location.pathname.replace(/\/$/, '') || '/';
  if (p !== PARTNER_LOGIN_PATH) return;
  const target = `${supplierPortalPublicBaseUrl()}${PARTNER_LOGIN_PATH}${window.location.search}${window.location.hash}`;
  window.location.replace(target);
}

/**
 * Absolute URL to a partner path when linking from the traveler site; relative on partner host or local dev.
 */
export function supplierPortalHref(path: string): string {
  const pathNorm = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined') {
    if (isTraverionPartnerHost()) return pathNorm;
    if (!isTravelerMarketingHost()) return pathNorm;
  }
  return `${supplierPortalPublicBaseUrl()}${pathNorm}`;
}
