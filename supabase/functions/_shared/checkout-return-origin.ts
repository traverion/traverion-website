/**
 * Resolve Stripe Checkout success/cancel base URL.
 * Prefer an allowlisted client `returnOrigin` (local Vite) over PUBLIC_SITE_URL
 * so sandbox checkouts started on localhost return to localhost, not production.
 * Keep in sync with src/lib/checkout-paths.ts resolveCheckoutSiteUrl.
 */

const DEFAULT_LOCAL_CHECKOUT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
] as const;

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
  if (parsed.pathname !== '/' && parsed.pathname !== '') return fallback;

  const origin = `${parsed.protocol}//${parsed.host}`;
  return allowed.has(origin) ? origin : fallback;
}
