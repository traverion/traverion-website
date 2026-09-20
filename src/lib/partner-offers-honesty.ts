import { listingIsFamily } from './inventory';

/** Stay discounts are stored historically but never applied on traveler stay checkout. */
export function partnerOfferListingIsStayUnsupported(listing: {
  listingExtras?: unknown;
}): boolean {
  return listingIsFamily(listing, 'stay');
}

/** New or updated offer rows may only attach to a tour. Stays have no traveler discount quote. */
export function partnerOfferMayBePersistedForListing(listing: {
  listingExtras?: unknown;
}): boolean {
  return !partnerOfferListingIsStayUnsupported(listing);
}

/** “Active now” for Partners: live date window on a tour only — never stay-linked rows. */
export function partnerOfferCountsAsActiveNow(params: {
  listing: { listingExtras?: unknown };
  status: 'upcoming' | 'active' | 'ended';
}): boolean {
  if (partnerOfferListingIsStayUnsupported(params.listing)) return false;
  return params.status === 'active';
}
