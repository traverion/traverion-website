/**
 * Full-page navigation that cannot reload the current URL.
 * `window.location.assign('/signup')` while already on /signup is a reload loop.
 */

export function normalizePathname(pathname: string): string {
  const p = (pathname.split('?')[0] ?? pathname).replace(/\/$/, '') || '/';
  return p.startsWith('/') ? p : `/${p}`;
}

export function pathEquals(a: string, b: string): boolean {
  return normalizePathname(a) === normalizePathname(b);
}

export function assignPathIfChanged(path: string): boolean {
  if (typeof window === 'undefined') return false;
  const next = normalizePathname(path);
  if (pathEquals(window.location.pathname, next)) return false;
  window.location.assign(next);
  return true;
}

export function replacePathIfChanged(path: string): boolean {
  if (typeof window === 'undefined') return false;
  const next = normalizePathname(path);
  if (pathEquals(window.location.pathname, next)) return false;
  window.location.replace(next);
  return true;
}

/** Same-origin href replace that keeps `?query` (session return, booking deep links). */
export function replaceHrefIfChanged(href: string): boolean {
  if (typeof window === 'undefined') return false;
  let url: URL;
  try {
    url = new URL(href, window.location.origin);
  } catch {
    return false;
  }
  if (url.origin !== window.location.origin) return false;
  const next = `${url.pathname}${url.search}`;
  const cur = `${window.location.pathname}${window.location.search}`;
  if (cur === next) return false;
  window.location.replace(next);
  return true;
}
