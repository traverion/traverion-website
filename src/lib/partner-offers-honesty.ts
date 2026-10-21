import { inventoryFamilyFromListing, listingIsFamily } from './inventory';

/**
 * @deprecated Stay Offers now apply on traveler checkout. Always false.
 * Kept so older call sites compile until they drop the helper.
 */
export function partnerOfferListingIsStayUnsupported(_listing: {
  listingExtras?: unknown;
}): boolean {
  return false;
}

/** Tours and stays may persist Offers. Experience/package (and future rentals) cannot. */
export function partnerOfferMayBePersistedForListing(listing: {
  listingExtras?: unknown;
  isHolidayPackage?: boolean;
}): boolean {
  const family = inventoryFamilyFromListing(listing);
  return family === 'tour' || family === 'stay';
}

/** “Active now” for Partners: live Discount period on a tour or stay. */
export function partnerOfferCountsAsActiveNow(params: {
  listing: { listingExtras?: unknown };
  status: 'upcoming' | 'active' | 'ended';
}): boolean {
  if (listingIsFamily(params.listing, 'experience') || listingIsFamily(params.listing, 'package')) {
    return false;
  }
  return params.status === 'active';
}
