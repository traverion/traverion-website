import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Partner portal routes are only for users with a `supplier_profiles` row.
 * Travelers use the main site + `consumer_profiles`; they must not see the supplier shell.
 */
export async function userHasSupplierProfile(client: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await client.from('supplier_profiles').select('id').eq('id', userId).maybeSingle();
  if (error) return false;
  return data != null;
}
