/**
 * Base URL for Supabase email links (confirm signup, reset password, magic link).
 * Always use the real site — never `window.location.origin` — so inboxes never get localhost.
 * Override per deploy with VITE_SITE_URL (e.g. staging preview URL).
 *
 * In Supabase → Authentication → URL configuration, add Redirect URLs including:
 * https://www.traverion.com/log-in**, https://partner.traverion.com/login**, https://partner.traverion.com/email-verified**, https://partner.traverion.com/partner**, https://admin.traverion.com/login**
 * (and apex variants if you use them). Reset links must land on those paths so the app can show “set new password”.
 */
import type { InventoryFamily, InventoryListingSlice } from './inventory';
import { inventoryFamilyFromListing } from './inventory';

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

/** Public stay page: `/stays?stay=<uuid>`. */
export function publicStayListingUrl(listingId: string): string {
  const base = publicSiteBaseUrl();
  return `${base}/stays?stay=${encodeURIComponent(listingId)}`;
}

/** Public rental page: `/rentals/<uuid>` (canonical rental PDP path). */
export function publicRentalListingUrl(listingId: string): string {
  const base = publicSiteBaseUrl();
  return `${base}/rentals/${listingId}`;
}

/**
 * Absolute customer-facing PDP URL for a listing family.
 * Live families only (tour / stay / rental). Never defaults unknown → tour.
 * Returns null when the family has no public product page.
 */
export function publicListingProductUrl(
  listingId: string,
  family: InventoryFamily | string | null | undefined
): string | null {
  const id = String(listingId ?? '').trim();
  if (!id) return null;
  const fam = String(family ?? '')
    .trim()
    .toLowerCase();
  if (fam === 'stay') return publicStayListingUrl(id);
  if (fam === 'rental') return publicRentalListingUrl(id);
  if (fam === 'tour') return publicTourListingUrl(id);
  return null;
}

/** Category-aware public PDP from persisted listing extras / package flag. */
export function publicListingProductUrlFromListing(
  listing: { id: string } & InventoryListingSlice
): string | null {
  return publicListingProductUrl(listing.id, inventoryFamilyFromListing(listing));
}
