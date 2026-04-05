/**
 * Password reset emails append #...&type=recovery to the redirect URL.
 * If Supabase "Site URL" is only the domain (e.g. https://traverion.com), users land on /
 * and never see a "set new password" form. Send them to a route that handles recovery.
 */
import { isPublicTraverionMarketingHost } from './adminHost';
import { isTraverionPartnerHost, supplierPortalPublicBaseUrl } from './partnerHost';
import {
  PARTNER_APP_BASE,
  PARTNER_LOGIN_PATH,
  legacySupplierPathToPartnerPath,
} from './partnerPortalPaths';

export function redirectIfPasswordRecoveryLandingInWrongPlace(): void {
  if (typeof window === 'undefined') return;
  const { pathname, hash, search, origin } = window.location;
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  let type: string | null = null;
  if (h) {
    try {
      type = new URLSearchParams(h).get('type');
    } catch {
      /* ignore */
    }
  }
  if (type !== 'recovery') {
    try {
      if (new URLSearchParams(window.location.search).get('type') === 'recovery') {
        type = 'recovery';
      }
    } catch {
      return;
    }
  }
  if (type !== 'recovery') return;

  const p = pathname.replace(/\/$/, '') || '/';
  const host = window.location.hostname;

  const fragment = h ? `#${h}` : '';

  if (host === 'admin.traverion.com') {
    if (p === '/login' || p === '/admin') return;
    window.location.replace(`${origin}/login${search}${fragment}`);
    return;
  }

  if (isTraverionPartnerHost()) {
    if (
      p === PARTNER_LOGIN_PATH ||
      p === PARTNER_APP_BASE ||
      p.startsWith(`${PARTNER_APP_BASE}/`)
    ) {
      return;
    }
    window.location.replace(`${origin}${PARTNER_LOGIN_PATH}${search}${fragment}`);
    return;
  }

  if (isPublicTraverionMarketingHost()) {
    const legacySupplier =
      p === '/supplier-log-in' || p === '/supplier' || p.startsWith('/supplier/');
    if (legacySupplier) {
      const mapped = legacySupplierPathToPartnerPath(p);
      window.location.replace(
        `${supplierPortalPublicBaseUrl()}${mapped}${search}${fragment}`
      );
      return;
    }
    if (
      p === PARTNER_LOGIN_PATH ||
      p === PARTNER_APP_BASE ||
      p.startsWith(`${PARTNER_APP_BASE}/`)
    ) {
      window.location.replace(`${supplierPortalPublicBaseUrl()}${p}${search}${fragment}`);
      return;
    }
  }

  if (p === '/auth' || p === '/sign-up' || p === '/log-in') return;

  if (p.startsWith('/supplier') || p === '/supplier-log-in') {
    window.location.replace(`${origin}${PARTNER_LOGIN_PATH}${search}${fragment}`);
    return;
  }

  window.location.replace(`${origin}/log-in${search}${fragment}`);
}
