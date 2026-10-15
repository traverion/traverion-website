/** Product-context return for legal/static pages. App uses replaceState, so history.back() is unreliable. */

const KEY = 'traverion_product_return_v1';
const LISTING_RETURN_KEY = 'traverion_listing_return_v1';

export const STATIC_CONSUMER_PAGES = new Set([
  'privacy',
  'terms',
  'cookies',
  'legal-notice',
  'about',
  'sitemap',
  'affiliate',
  'content-creator',
  'contact',
]);

export function isStaticConsumerPage(page: string): boolean {
  return STATIC_CONSUMER_PAGES.has(page);
}

function isSafeInternalHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//') && !href.includes('\\');
}

export function rememberProductReturn(page: string, href: string): void {
  if (isStaticConsumerPage(page)) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ page, href, t: Date.now() }));
  } catch {
    /* quota / private mode */
  }
}

export function consumeProductReturn(): { page: string; href: string } | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { page?: string; href?: string };
    if (!v?.page || typeof v.page !== 'string') return null;
    return { page: v.page, href: typeof v.href === 'string' ? v.href : '' };
  } catch {
    return null;
  }
}

export function goProductReturn(onNavigate?: (page: string) => void): void {
  const ret = consumeProductReturn();
  if (ret?.page && onNavigate) {
    if (ret.href && isSafeInternalHref(ret.href)) {
      window.history.replaceState({}, '', ret.href);
    }
    onNavigate(ret.page);
    return;
  }
  onNavigate?.('home');
  window.history.replaceState({}, '', '/');
}

export type ListingReturn = { page: string; href: string; pushed: boolean };

function readListingReturn(raw: string | null): ListingReturn | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { page?: string; href?: string; pushed?: boolean };
    if (!v?.page || typeof v.page !== 'string') return null;
    const href = typeof v.href === 'string' ? v.href : '';
    if (!href.startsWith('/') || href.startsWith('//')) return null;
    return { page: v.page, href, pushed: Boolean(v.pushed) };
  } catch {
    return null;
  }
}

/**
 * URL that represents the page the traveler is on now.
 * If in-app navigation never wrote that path, use the canonical path so Back
 * does not restore an earlier page that happens to share the history entry.
 */
export function listingOriginHref(page: string, pathname: string, search: string): string {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname || '/';
  const current = `${path}${search || ''}`;
  const onPage =
    (page === 'home' && path === '/') ||
    (page === 'packages' && (path === '/packages' || path === '/tours')) ||
    (page === 'stays' && path === '/stays') ||
    (page === 'wishlist' && path === '/wishlist') ||
    (page === 'bookings' && (path === '/bookings' || path === '/trips')) ||
    (page === 'account' && path === '/account') ||
    (page === 'blog' && path === '/blog') ||
    (page === 'contact' && path === '/contact') ||
    (page === 'destination' && path.startsWith('/destinations/')) ||
    (page === 'about' && path === '/about');
  if (onPage) return current;
  const canonical: Record<string, string> = {
    home: '/',
    packages: '/packages',
    stays: '/stays',
    wishlist: '/wishlist',
    bookings: '/bookings',
    account: '/account',
    blog: '/blog',
    contact: '/contact',
    about: '/about',
  };
  return canonical[page] ?? '/';
}

/** Remember browse context before opening a tour/stay PDP (for back label + fallback). */
export function rememberListingReturn(page: string, href: string, pushed = true): void {
  if (page === 'tour-details' || page === 'stay-details' || page === 'booking') return;
  if (!href.startsWith('/') || href.startsWith('//')) return;
  try {
    sessionStorage.setItem(
      LISTING_RETURN_KEY,
      JSON.stringify({ page, href, pushed, t: Date.now() })
    );
  } catch {
    /* quota / private mode */
  }
}

export function peekListingReturn(): ListingReturn | null {
  try {
    return readListingReturn(sessionStorage.getItem(LISTING_RETURN_KEY));
  } catch {
    return null;
  }
}

export function consumeListingReturn(): ListingReturn | null {
  try {
    const raw = sessionStorage.getItem(LISTING_RETURN_KEY);
    if (raw) sessionStorage.removeItem(LISTING_RETURN_KEY);
    return readListingReturn(raw);
  } catch {
    return null;
  }
}

/** Short label for the PDP back control based on where the traveler came from. */
export function listingBackLabel(fallback: 'Tours' | 'Stays'): string {
  const ret = peekListingReturn();
  if (!ret) return fallback;
  switch (ret.page) {
    case 'home':
      return 'Explore';
    case 'packages':
      return 'Tours';
    case 'stays':
      return 'Stays';
    case 'wishlist':
      return 'Saved';
    case 'bookings':
      return 'Trips';
    case 'destination':
      return 'Back';
    case 'account':
      return 'Account';
    default:
      return 'Back';
  }
}

/** History state marker so PDP URL sync can push once, then replace for query tweaks. */
export type TraverionProductDetailState = {
  traverionProductDetail?: string;
};

export function isProductDetailHistoryState(
  state: unknown,
  listingId: string
): state is TraverionProductDetailState {
  return (
    !!state &&
    typeof state === 'object' &&
    (state as TraverionProductDetailState).traverionProductDetail === listingId
  );
}
