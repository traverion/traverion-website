/**
 * Maps URL pathnames to the app's internal page id (used on load, popstate, etc.).
 */
/** Old hardcoded SEA brochure URLs — keep reachable as the live catalog, not a second product. */
const LEGACY_BROCHURE_PATHS = new Set([
  '/14-vietnam-thailand',
  '/9-vietnam',
  '/12-vietnam',
  '/10-thailand',
  '/10-cambodia',
  '/14-indochina',
]);

const PATH_TO_PAGE: Record<string, string> = {
  '/packages': 'packages',
  '/cart': 'cart',
  '/auth': 'auth',
  '/sign-up': 'auth',
  '/log-in': 'auth',
  '/set-password': 'reset-password',
  '/email-confirmed': 'email-confirmed',
  '/account': 'account',
  '/wishlist': 'wishlist',
  '/bookings': 'bookings',
  '/booking-confirmed': 'booking-confirmed',
  '/blog': 'blog',
  '/contact': 'contact',
  '/privacy': 'privacy',
  '/terms': 'terms',
  '/cookies': 'cookies',
  '/about': 'about',
  '/sitemap': 'sitemap',
  '/legal-notice': 'legal-notice',
  '/affiliate': 'affiliate',
  '/content-creator': 'content-creator',
};

export interface ParsedRoute {
  page: string;
  destinationSlug: string | null;
}

export function normalizeLegacyBrochurePathname(pathname: string): string {
  const normalized =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (!LEGACY_BROCHURE_PATHS.has(normalized) || typeof window === 'undefined') return pathname;
  window.history.replaceState(window.history.state, '', '/packages');
  return '/packages';
}

/**
 * Canonical public deep link for a Supabase listing is `/packages?tour=<uuid>`.
 * If the URL is `/tour/<uuid>`, rewrite in-place (same tab) so the SPA router opens TourDetails reliably.
 */
export function normalizePublicTourDeepLinkPathname(pathname: string): string {
  const normalized =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const m = /^\/tour\/([0-9a-f-]{36})$/i.exec(normalized);
  if (!m || typeof window === 'undefined') return pathname;
  const qs = new URLSearchParams({ tour: m[1] }).toString();
  window.history.replaceState(window.history.state, '', `/packages?${qs}`);
  return '/packages';
}

const TOUR_FLOW_PAGES = new Set(['tour-details', 'booking', 'tour-package']);

export type ParsePathnameOptions = {
  /** When true, only /login and /admin are staff routes; everything else maps to staff login. */
  adminHost?: boolean;
};

export function parsePathname(pathname: string, options?: ParsePathnameOptions): ParsedRoute {
  const normalized =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  if (options?.adminHost) {
    if (normalized === '/login') return { page: 'admin-login', destinationSlug: null };
    if (normalized === '/admin') return { page: 'admin-app', destinationSlug: null };
    if (normalized === '/' || normalized === '') return { page: 'admin-login', destinationSlug: null };
    return { page: 'admin-login', destinationSlug: null };
  }

  /** Staff UI lives on admin.traverion.com; /admin on the public app is not a route (→ home + URL cleanup). */
  if (normalized === '/admin') {
    const h = typeof window !== 'undefined' ? window.location.hostname : '';
    if (h === 'localhost' || h === '127.0.0.1') {
      return { page: 'admin', destinationSlug: null };
    }
    return { page: 'home', destinationSlug: null };
  }

  if (LEGACY_BROCHURE_PATHS.has(normalized)) {
    return { page: 'packages', destinationSlug: null };
  }
  const mapped = PATH_TO_PAGE[normalized];
  if (mapped) {
    return { page: mapped, destinationSlug: null };
  }
  if (normalized.startsWith('/destinations/')) {
    const slug = normalized.replace(/^\/destinations\/?/, '') || null;
    return { page: 'destination', destinationSlug: slug };
  }
  if (normalized === '/' || normalized === '') {
    return { page: 'home', destinationSlug: null };
  }
  return { page: 'home', destinationSlug: null };
}

export function shouldClearSelectedTour(page: string): boolean {
  return !TOUR_FLOW_PAGES.has(page);
}

/**
 * Stripe success_url historically landed on /bookings?session_id=… — normalize to the dedicated confirmation route.
 */
export function mapStripeReturnRoute(page: string, search: string): string {
  if (page !== 'bookings') return page;
  const sid = new URLSearchParams(search).get('session_id')?.trim() ?? '';
  if (!/^cs_(test|live)_/.test(sid)) return page;
  if (typeof window !== 'undefined') {
    window.history.replaceState(window.history.state, '', `/booking-confirmed?session_id=${encodeURIComponent(sid)}`);
  }
  return 'booking-confirmed';
}

/**
 * history.back() + sync via popstate; if the URL did not change (no history), go home in-app.
 */
export function navigateBackOrFallback(onFallback: () => void): void {
  const path = window.location.pathname;
  window.history.back();
  window.setTimeout(() => {
    if (window.location.pathname === path) {
      onFallback();
    }
  }, 200);
}
