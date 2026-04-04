import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

/** Set on the user in Supabase (SQL): raw_app_meta_data includes `"role":"admin"`. */
export function isTraverionAdminUser(user: User | null | undefined): boolean {
  const role = user?.app_metadata && (user.app_metadata as Record<string, unknown>).role;
  return role === 'admin';
}

/**
 * Panel access: JWT must have role admin and email must match `public.admin` (see migration 037).
 */
export async function verifyTraverionPanelAccess(
  client: SupabaseClient,
  user: User | null | undefined
): Promise<boolean> {
  if (!user || !isTraverionAdminUser(user)) return false;
  const { data, error } = await client.rpc('is_traverion_panel_admin');
  if (error || data !== true) return false;
  return true;
}
