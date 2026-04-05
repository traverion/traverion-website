/**
 * Sanity-check that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY belong to the same project.
 * A mismatched pair is a common misconfiguration when copying env vars; it does not always
 * produce obvious errors on every endpoint.
 */

function decodeJwtPayloadSegment(segment: string): Record<string, unknown> | null {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  try {
    const json = atob(b64 + pad);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Project ref from hosted URL `https://<ref>.supabase.co`. */
export function supabaseProjectRefFromUrl(url: string): string | null {
  const m = url.trim().match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?/i);
  return m?.[1] ?? null;
}

/** `ref` claim from the anon (or service) JWT. */
export function supabaseProjectRefFromPublishableKey(anonOrServiceJwt: string): string | null {
  const parts = anonOrServiceJwt.split('.');
  if (parts.length < 2) return null;
  const payload = decodeJwtPayloadSegment(parts[1]);
  const ref = payload?.ref;
  return typeof ref === 'string' ? ref : null;
}

/** True when URL looks like a hosted Supabase project and its ref matches the JWT `ref` claim. */
export function isHostedSupabaseUrlAndKeyPaired(url: string | undefined, publishableKey: string | undefined): boolean {
  return hostedSupabaseEnvPairingStatus(url, publishableKey) === 'ok';
}

export type HostedSupabaseEnvPairingStatus = 'ok' | 'mismatch' | 'unknown';

/** Use `mismatch` to show a config warning; `unknown` if URL is not *.supabase.co or key is not a JWT. */
export function hostedSupabaseEnvPairingStatus(
  url: string | undefined,
  publishableKey: string | undefined
): HostedSupabaseEnvPairingStatus {
  if (!url?.trim() || !publishableKey?.trim()) return 'unknown';
  const urlRef = supabaseProjectRefFromUrl(url);
  const keyRef = supabaseProjectRefFromPublishableKey(publishableKey);
  if (!urlRef || !keyRef) return 'unknown';
  return urlRef === keyRef ? 'ok' : 'mismatch';
}
