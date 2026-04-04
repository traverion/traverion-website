import type { User } from '@supabase/supabase-js';

/** Set on the user in Supabase (SQL): raw_app_meta_data includes `"role":"admin"`. */
export function isTraverionAdminUser(user: User | null | undefined): boolean {
  const role = user?.app_metadata && (user.app_metadata as Record<string, unknown>).role;
  return role === 'admin';
}
