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
