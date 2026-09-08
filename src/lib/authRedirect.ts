import { sanitizeTravelerAuthNext } from './travelerAuthLinks';

/** Same-origin only. Blocks open redirects in Supabase emailRedirectTo. */
export function sanitizeAuthRedirectTo(raw: string | null | undefined, allowedOrigin: string, fallback: string): string {
  const candidate = (raw ?? '').trim();
  if (!candidate) return fallback;
  try {
    const allowed = new URL(allowedOrigin);
    const parsed = new URL(candidate, allowed.origin);
    if (parsed.origin !== allowed.origin) return fallback;
    if (parsed.username || parsed.password) return fallback;
    if (!parsed.pathname.startsWith('/')) return fallback;
    if (parsed.pathname.startsWith('//')) return fallback;
    return `${parsed.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function sanitizeEmailConfirmNext(raw: string | null | undefined): string {
  return sanitizeTravelerAuthNext(raw);
}
