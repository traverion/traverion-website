/** Same-origin relative paths only. Used for Stripe success/cancel URLs. */
export function sanitizeCheckoutReturnPath(path: string | undefined, fallback: string): string {
  const raw = (path ?? '').trim();
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  if (raw.startsWith('/\\')) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw.slice(1))) return fallback;
  return raw;
}

const BOOKING_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Ensure Stripe cancel (or success) return paths carry `booking=<uuid>` so Trips
 * can reopen the hold that was abandoned — not an unrelated pending payment.
 */
export function appendCheckoutBookingParam(path: string, bookingId: string | undefined | null): string {
  const id = String(bookingId ?? '').trim();
  if (!id || !BOOKING_UUID_RE.test(id)) return path;
  if (/[?&]booking=/i.test(path)) return path;
  return `${path}${path.includes('?') ? '&' : '?'}booking=${encodeURIComponent(id)}`;
}

const DEFAULT_LOCAL_CHECKOUT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
] as const;

/**
 * Resolve Stripe Checkout success/cancel base URL.
 * Prefer an allowlisted client `returnOrigin` (local Vite) over PUBLIC_SITE_URL
 * so sandbox checkouts started on localhost return to localhost, not production.
 * Rejects arbitrary origins (open-redirect / phishing).
 */
export function resolveCheckoutSiteUrl(opts: {
  publicSiteUrl: string;
  returnOrigin?: string | null;
  extraAllowedOrigins?: string[];
}): string {
  const fallback = String(opts.publicSiteUrl ?? '')
    .trim()
    .replace(/\/$/, '');
  if (!fallback) return 'http://localhost:5173';

  const allowed = new Set<string>([
    fallback,
    ...DEFAULT_LOCAL_CHECKOUT_ORIGINS,
    ...(opts.extraAllowedOrigins ?? [])
      .map((o) => String(o ?? '').trim().replace(/\/$/, ''))
      .filter(Boolean),
  ]);

  const raw = String(opts.returnOrigin ?? '')
    .trim()
    .replace(/\/$/, '');
  if (!raw) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return fallback;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallback;
  if (parsed.username || parsed.password) return fallback;
  if (parsed.search || parsed.hash) return fallback;
  // Origin only — no path other than empty or /
  if (parsed.pathname !== '/' && parsed.pathname !== '') return fallback;

  const origin = `${parsed.protocol}//${parsed.host}`;
  return allowed.has(origin) ? origin : fallback;
}
