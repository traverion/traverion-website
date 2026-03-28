/**
 * Base URL for Supabase email links (confirm signup, reset password, magic link).
 * Always use the real site — never `window.location.origin` — so inboxes never get localhost.
 * Override per deploy with VITE_SITE_URL (e.g. staging preview URL).
 */
export function publicSiteBaseUrl(): string {
  const v = import.meta.env.VITE_SITE_URL as string | undefined;
  if (typeof v === 'string' && v.trim()) return v.replace(/\/$/, '');
  return 'https://www.traverion.com';
}
