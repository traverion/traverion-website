import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Partner portal routes are only for users with a `supplier_profiles` row.
 * Travelers use the main site + `consumer_profiles`; they must not see the supplier shell.
 *
 * @returns `true` / `false` when the query succeeds; `null` on error (do not treat as “no profile”).
 */
export async function userHasSupplierProfile(client: SupabaseClient, userId: string): Promise<boolean | null> {
  const { data, error } = await client.from('supplier_profiles').select('id').eq('id', userId).maybeSingle();
  if (error) return null;
  return data != null;
}

/**
 * Phase 1201: true when this JWT is on a supplier_team_members row (owner or invited teammate).
 * RLS (014) allows members to SELECT their supplier's team rows.
 */
export async function userIsSupplierTeamMember(
  client: SupabaseClient,
  userId: string
): Promise<boolean | null> {
  const { data, error } = await client
    .from('supplier_team_members')
    .select('supplier_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data != null;
}

/**
 * Phase 1201: partner shell access — own supplier_profiles OR team membership on an owner account.
 * Do not invent a supplier_profiles row for team-only JWTs (that would fork a second supplier).
 */
export async function userCanAccessPartnerPortal(
  client: SupabaseClient,
  userId: string
): Promise<boolean | null> {
  const profile = await userHasSupplierProfile(client, userId);
  if (profile === true) return true;
  if (profile === null) return null;
  return userIsSupplierTeamMember(client, userId);
}

/** True if this user already has at least one listing as supplier (RLS: own rows). Used to repair a missing `supplier_profiles` row. */
export async function supplierOwnsAnyListing(client: SupabaseClient, userId: string): Promise<boolean | null> {
  const { data, error } = await client.from('listings').select('id').eq('supplier_id', userId).limit(1).maybeSingle();
  if (error) return null;
  return data != null;
}
