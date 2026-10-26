/**
 * Cross-environment Stripe isolation.
 *
 * Staging and production historically shared one Stripe TEST account, so every
 * Checkout Session event was delivered to every enabled webhook endpoint.
 * Production then mutated (often refunded) staging PaymentIntents when the
 * booking_id was absent from the production DB.
 *
 * Defense in depth:
 * 1. Prefer separate Stripe test accounts per Supabase project (ops).
 * 2. Stamp Checkout / PaymentIntent metadata with traverion_supabase_project_ref.
 * 3. Fail closed in webhooks when project ref mismatches or the booking is absent.
 * Never refund or promote when ownership is ambiguous or foreign.
 */

export const TRAVERION_SUPABASE_PROJECT_REF_META = 'traverion_supabase_project_ref';

export type StripeEventOwnershipDecision =
  | { action: 'accept'; reason: 'owned' }
  | { action: 'ignore'; reason: 'foreign_project_ref' }
  | { action: 'ignore'; reason: 'booking_not_in_this_environment' }
  | { action: 'ignore'; reason: 'ambiguous_ownership' };

/** Extract project ref from https://<ref>.supabase.co (or similar). */
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

/**
 * Expected project ref for this runtime.
 * Prefer explicit TRAVERION_SUPABASE_PROJECT_REF; else parse SUPABASE_URL.
 */
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

/**
 * Decide whether this environment may mutate payment state for the event.
 * Fail closed: ignore (never refund/promote) when foreign or ambiguous.
 */
export function stripeEventOwnershipDecision(params: {
  expectedProjectRef: string | null | undefined;
  metadataProjectRef: string | null | undefined;
  bookingFound: boolean;
  /** When true, missing metadata + missing booking is ambiguous (ignore). */
  requireOwnershipEvidence?: boolean;
}): StripeEventOwnershipDecision {
  const expected = String(params.expectedProjectRef ?? '').trim();
  const stamped = String(params.metadataProjectRef ?? '').trim();

  if (stamped && expected && stamped !== expected) {
    return { action: 'ignore', reason: 'foreign_project_ref' };
  }

  if (!params.bookingFound) {
    // Stamped for this env but row missing → still ignore (fail closed).
    // Unstamped missing booking → foreign shared-account event or corrupt id.
    return { action: 'ignore', reason: 'booking_not_in_this_environment' };
  }

  if (!stamped && !expected && params.requireOwnershipEvidence) {
    return { action: 'ignore', reason: 'ambiguous_ownership' };
  }

  // Booking exists here. Legacy sessions without stamp are accepted when the
  // row is present (same-DB ownership). Prefer stamped metadata going forward.
  return { action: 'accept', reason: 'owned' };
}
