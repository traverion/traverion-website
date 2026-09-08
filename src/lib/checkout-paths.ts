/** Same-origin relative paths only. Used for Stripe success/cancel URLs. */
export function sanitizeCheckoutReturnPath(path: string | undefined, fallback: string): string {
  const raw = (path ?? '').trim();
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  if (raw.startsWith('/\\')) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw.slice(1))) return fallback;
  return raw;
}
