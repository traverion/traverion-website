import type { User } from '@supabase/supabase-js';

/** Set on the user in Supabase (SQL): raw_app_meta_data includes `"role":"admin"`. */
export function isTraverionAdminUser(user: User | null | undefined): boolean {
  const role = user?.app_metadata && (user.app_metadata as Record<string, unknown>).role;
  return role === 'admin';
}

/** Parsed `VITE_TRAVERION_ADMIN_EMAILS` (comma-separated, lowercased). */
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

/**
 * Use for /admin gate and post–sign-in checks.
 * In production builds, `VITE_TRAVERION_ADMIN_EMAILS` must be a non-empty comma-separated list;
 * only those emails (with role admin) may access staff UI — not just any `role: admin` in Supabase.
 */
export function canAccessTraverionAdmin(user: User | null | undefined): boolean {
  if (!isTraverionAdminUser(user)) return false;
  const allow = adminEmailAllowlist();
  if (import.meta.env.PROD && (!allow || allow.size === 0)) {
    return false;
  }
  if (!allow) return true;
  const email = user?.email?.trim().toLowerCase();
  return !!email && allow.has(email);
}
