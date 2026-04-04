/**
 * Maps URL pathnames to the app's internal page id (used on load, popstate, etc.).
 */
const PATH_TO_PAGE: Record<string, string> = {
  '/14-vietnam-thailand': 'thailand-vietnam-14-day',
  '/9-vietnam': 'vietnam-9-day',
  '/12-vietnam': 'vietnam-12-day',
  '/10-thailand': 'thailand-10-day',
  '/10-cambodia': 'cambodia-10-day',
  '/14-indochina': 'indochina-14-day',
  '/packages': 'packages',
  '/cart': 'cart',
  '/auth': 'auth',
  '/account': 'account',
  '/wishlist': 'wishlist',
  '/bookings': 'bookings',
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
