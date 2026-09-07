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

import { travelerMarketingLoginAlias } from './authHostRouting';
import {
  PARTNER_LANDING_DEV_PATH,
  PARTNER_LOGIN_PATH,
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
 * Partner portal SPA routes (/login, /partner/*, /reset-password, …) — partner host and localhost.
 * Traveler reset on www is `/set-password`. On localhost both products share an origin, so
 * `/reset-password` is the partner reset page (partner emails redirect here).
 */
export function isPartnerPortalPathForCurrentHost(pathname: string): boolean {
  if (typeof window === 'undefined') return false;
  const p = pathname.replace(/\/$/, '') || '/';

  if (isTraverionPartnerHost()) {
    if (p === '/' || p === '') return true;
    return isPartnerPortalPath(p);
  }

  if (!isPartnerPortalPath(p)) return false;
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

/**
 * Absolute partner URL for Supabase auth emails (reset, confirm).
 * Production always uses partner.traverion.com — never the traveler site URL.
 */
export function partnerPortalAuthRedirectUrl(path: string): string {
  const pathNorm = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') {
      return `${window.location.origin.replace(/\/$/, '')}${pathNorm}`;
    }
  }
  const staging = import.meta.env.VITE_PARTNER_PORTAL_URL as string | undefined;
  if (import.meta.env.DEV && typeof staging === 'string' && staging.trim()) {
    return `${staging.replace(/\/$/, '')}${pathNorm}`;
  }
  return `https://${PARTNER_HOSTNAME}${pathNorm}`;
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
  if (p === '/' || p === '') return;
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

/**
 * www / apex: `/login` is traveler sign-in (`/log-in`), never partner.traverion.com.
 * Partner login lives only on the partner host.
 */
export function rewriteTravelerMarketingLoginToTravelerAuth(): void {
  if (typeof window === 'undefined') return;
  const next = travelerMarketingLoginAlias(
    window.location.hostname,
    window.location.pathname,
    `${window.location.search}${window.location.hash}`
  );
  if (!next) return;
  window.history.replaceState({}, '', next);
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

/** Partner marketing entry (landing). Never the traveler home on localhost. */
export function supplierPortalLandingHref(): string {
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return PARTNER_LANDING_DEV_PATH;
    if (isTraverionPartnerHost()) return '/';
  }
  return `${supplierPortalPublicBaseUrl()}/`;
}
