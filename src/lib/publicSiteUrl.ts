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

/** Public tour page (packages + tour id). Opens TourDetails when the main app loads. */
export function publicTourListingUrl(listingId: string): string {
  const base = publicSiteBaseUrl();
  const q = new URLSearchParams({ tour: listingId });
  return `${base}/packages?${q.toString()}`;
}
