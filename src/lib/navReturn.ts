/** Product-context return for legal/static pages. App uses replaceState, so history.back() is unreliable. */

const KEY = 'traverion_product_return_v1';

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
