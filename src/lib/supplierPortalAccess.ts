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
