import type { User } from '@supabase/supabase-js';

/** Set on the user in Supabase (SQL): raw_app_meta_data includes `"role":"admin"`. */
export function isTraverionAdminUser(user: User | null | undefined): boolean {
  const role = user?.app_metadata && (user.app_metadata as Record<string, unknown>).role;
  return role === 'admin';
}

/**
 * Optional extra lock: set `VITE_TRAVERION_ADMIN_EMAILS` to a comma-separated list (e.g. one work email).
 * Then only those emails may use /admin, and only if they also have role=admin.
 * If unset, any user with role=admin may access (still protected on the Edge Function if you set the secret there).
 */
function adminEmailAllowlist(): Set<string> | null {
  const raw = (import.meta.env.VITE_TRAVERION_ADMIN_EMAILS as string | undefined)?.trim();
  if (!raw) return null;
  const set = new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return set.size > 0 ? set : null;
}

export function isEmailOnAdminAllowlist(user: User | null | undefined): boolean {
  const allow = adminEmailAllowlist();
  if (!allow) return true;
  const email = user?.email?.trim().toLowerCase();
  if (!email) return false;
  return allow.has(email);
}

/** Use this for /admin gate and post–sign-in checks. */
export function canAccessTraverionAdmin(user: User | null | undefined): boolean {
  return isTraverionAdminUser(user) && isEmailOnAdminAllowlist(user);
}
