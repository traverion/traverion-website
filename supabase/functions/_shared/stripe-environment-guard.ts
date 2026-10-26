/**
 * Mirror of src/lib/stripe-environment-guard.ts for Deno edge runtime.
 * Keep in sync — unit tests live against the src/ copy.
 */

export const TRAVERION_SUPABASE_PROJECT_REF_META = 'traverion_supabase_project_ref';

export type StripeEventOwnershipDecision =
  | { action: 'accept'; reason: 'owned' }
  | { action: 'ignore'; reason: 'foreign_project_ref' }
  | { action: 'ignore'; reason: 'booking_not_in_this_environment' }
  | { action: 'ignore'; reason: 'ambiguous_ownership' };

export function projectRefFromSupabaseUrl(supabaseUrl: string | null | undefined): string | null {
  const raw = String(supabaseUrl ?? '').trim();
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    const m = /^([a-z0-9]+)\.supabase\.co$/i.exec(host);
    if (m?.[1]) return m[1];
  } catch {
    /* fall through */
  }
  const loose = /https?:\/\/([a-z0-9]+)\.supabase\.co/i.exec(raw);
  return loose?.[1] ?? null;
}

export function resolveExpectedTraverionProjectRef(env: {
  traverionSupabaseProjectRef?: string | null;
  supabaseUrl?: string | null;
}): string | null {
  const explicit = String(env.traverionSupabaseProjectRef ?? '').trim();
  if (explicit) return explicit;
  return projectRefFromSupabaseUrl(env.supabaseUrl);
}

export function checkoutEnvironmentMetadata(projectRef: string | null | undefined): Record<string, string> {
  const ref = String(projectRef ?? '').trim();
  if (!ref) return {};
  return { [TRAVERION_SUPABASE_PROJECT_REF_META]: ref };
}

export function metadataProjectRef(
  metadata: Record<string, string | null | undefined> | null | undefined
): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const v = String(metadata[TRAVERION_SUPABASE_PROJECT_REF_META] ?? '').trim();
  return v || null;
}

export function stripeEventOwnershipDecision(params: {
  expectedProjectRef: string | null | undefined;
  metadataProjectRef: string | null | undefined;
  bookingFound: boolean;
  requireOwnershipEvidence?: boolean;
}): StripeEventOwnershipDecision {
  const expected = String(params.expectedProjectRef ?? '').trim();
  const stamped = String(params.metadataProjectRef ?? '').trim();

  if (stamped && expected && stamped !== expected) {
    return { action: 'ignore', reason: 'foreign_project_ref' };
  }

  if (!params.bookingFound) {
    return { action: 'ignore', reason: 'booking_not_in_this_environment' };
  }

  if (!stamped && !expected && params.requireOwnershipEvidence) {
    return { action: 'ignore', reason: 'ambiguous_ownership' };
  }

  return { action: 'accept', reason: 'owned' };
}
