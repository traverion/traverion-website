/**
 * Base URL for Supabase email links (confirm signup, reset password, magic link).
 * Always use the real site — never `window.location.origin` — so inboxes never get localhost.
 * Override per deploy with VITE_SITE_URL (e.g. staging preview URL).
 *
 * In Supabase → Authentication → URL configuration, add Redirect URLs including:
 * https://www.traverion.com/log-in**, https://partner.traverion.com/login**, https://partner.traverion.com/email-verified**, https://partner.traverion.com/partner**, https://admin.traverion.com/login**
 * (and apex variants if you use them). Reset links must land on those paths so the app can show “set new password”.
 */
export function publicSiteBaseUrl(): string {
  const v = import.meta.env.VITE_SITE_URL as string | undefined;
  if (typeof v === 'string' && v.trim()) return v.replace(/\/$/, '');
  return 'https://www.traverion.com';
}

/** Public tour page: `/tour/<uuid>` (rewrites to `/packages?tour=` on load). Opens TourDetails in the main app. */
export function publicTourListingUrl(listingId: string): string {
  const base = publicSiteBaseUrl();
  return `${base}/tour/${listingId}`;
}
