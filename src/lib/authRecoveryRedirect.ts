/**
 * Password reset emails append #...&type=recovery to the redirect URL.
 * Send users to /reset-password so they see a dedicated "set new password" form,
 * not the normal sign-in screen (which may redirect logged-in users to the app).
 */
import { isPublicTraverionMarketingHost } from './adminHost';
import { isTraverionPartnerHost, supplierPortalPublicBaseUrl } from './partnerHost';
import {
  PARTNER_APP_BASE,
  PARTNER_LOGIN_PATH,
  PARTNER_RESET_PASSWORD_PATH,
  TRAVELER_RESET_PASSWORD_PATH,
  legacySupplierPathToPartnerPath,
} from './partnerPortalPaths';
import { parseAuthHashParams } from './passwordRecoveryFlow';

export function redirectIfPasswordRecoveryLandingInWrongPlace(): void {
  if (typeof window === 'undefined') return;
  const { pathname, search, origin } = window.location;
  const h = parseAuthHashParams();
  let type = h.get('type');
  if (!type) {
    try {
      type = new URLSearchParams(search).get('type');
    } catch {
      /* ignore */
    }
  }
  if (type !== 'recovery') return;

  const p = pathname.replace(/\/$/, '') || '/';
  const host = window.location.hostname;
  const fragment = window.location.hash;

  if (host === 'admin.traverion.com') {
    if (p === '/login' || p === '/admin') return;
    window.location.replace(`${origin}/login${search}${fragment}`);
    return;
  }

  if (isTraverionPartnerHost()) {
    if (p === PARTNER_RESET_PASSWORD_PATH) return;
    window.location.replace(`${origin}${PARTNER_RESET_PASSWORD_PATH}${search}${fragment}`);
    return;
  }

  if (isPublicTraverionMarketingHost()) {
    const legacySupplier =
      p === '/supplier-log-in' || p === '/supplier' || p.startsWith('/supplier/');
    if (legacySupplier) {
      const mapped = legacySupplierPathToPartnerPath(p);
      if (mapped === PARTNER_RESET_PASSWORD_PATH || mapped === PARTNER_LOGIN_PATH) {
        window.location.replace(
          `${supplierPortalPublicBaseUrl()}${PARTNER_RESET_PASSWORD_PATH}${search}${fragment}`
        );
        return;
      }
    }
    if (p === PARTNER_LOGIN_PATH || p === PARTNER_RESET_PASSWORD_PATH) {
      window.location.replace(
        `${supplierPortalPublicBaseUrl()}${PARTNER_RESET_PASSWORD_PATH}${search}${fragment}`
      );
      return;
    }
  }

  if (p === TRAVELER_RESET_PASSWORD_PATH) return;

  if (p === '/auth' || p === '/sign-up' || p === '/log-in') {
    window.location.replace(`${origin}${TRAVELER_RESET_PASSWORD_PATH}${search}${fragment}`);
    return;
  }

  if (p.startsWith('/supplier') || p === '/supplier-log-in') {
    window.location.replace(
      `${supplierPortalPublicBaseUrl()}${PARTNER_RESET_PASSWORD_PATH}${search}${fragment}`
    );
    return;
  }

  if (
    p === PARTNER_APP_BASE ||
    p.startsWith(`${PARTNER_APP_BASE}/`)
  ) {
    window.location.replace(
      `${supplierPortalPublicBaseUrl()}${PARTNER_RESET_PASSWORD_PATH}${search}${fragment}`
    );
    return;
  }

  window.location.replace(`${origin}${TRAVELER_RESET_PASSWORD_PATH}${search}${fragment}`);
}
