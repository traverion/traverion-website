import { listingIsFamily, listingIsOnTravelerCatalog, type InventoryListingSlice } from './inventory';
import { listingHasUpcomingBookableSeason } from './booking-quote';
import { listingDetailVisibleToTraveler } from './product-workflows';

export type PublicListingDeepLinkTarget = {
  page: 'stay-details' | 'tour-details';
  /** Canonical pathname for the detail URL. */
  pathname: '/stays' | '/packages';
  /** Query key that carries the listing id. */
  idParam: 'stay' | 'tour';
};

type DeepLinkListing = InventoryListingSlice & {
  status?: string | null;
  listingExtras?: InventoryListingSlice['listingExtras'];
};

/**
 * Decide traveler PDP route for a listing id opened via a public deep link.
 * Stays must not open TourDetails (tour sticky / departure capacity).
 */
export function resolvePublicListingDeepLinkTarget(
  listing: DeepLinkListing | null | undefined
): PublicListingDeepLinkTarget | null {
  if (!listing) return null;

  if (listingIsFamily(listing, 'stay')) {
    if (
      !listingDetailVisibleToTraveler({
        familyMatches: true,
        status: listing.status,
      })
    ) {
      return null;
    }
    return { page: 'stay-details', pathname: '/stays', idParam: 'stay' };
  }

  if (
    !listingDetailVisibleToTraveler({
      familyMatches: listingIsOnTravelerCatalog(listing),
      status: listing.status,
    }) ||
    !listingHasUpcomingBookableSeason(listing)
  ) {
    return null;
  }

  return { page: 'tour-details', pathname: '/packages', idParam: 'tour' };
}

/** Build canonical detail href, preserving unrelated query params. */
export function buildPublicListingDeepLinkHref(
  target: PublicListingDeepLinkTarget,
  listingId: string,
  currentSearch = ''
): string {
  const params = new URLSearchParams(currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch);
  params.delete('tour');
  params.delete('stay');
  params.set(target.idParam, listingId);
  const qs = params.toString();
  return qs ? `${target.pathname}?${qs}` : `${target.pathname}?${target.idParam}=${encodeURIComponent(listingId)}`;
}
