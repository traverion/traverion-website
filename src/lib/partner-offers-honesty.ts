import { listingIsFamily } from './inventory';

/** Stay discounts are stored but never applied on traveler stay checkout. */
export function partnerOfferListingIsStayUnsupported(listing: {
  listingExtras?: unknown;
}): boolean {
  return listingIsFamily(listing, 'stay');
}

/** “Active now” for Partners: live date window on a tour only — never stay-linked rows. */
export function partnerOfferCountsAsActiveNow(params: {
  listing: { listingExtras?: unknown };
  status: 'upcoming' | 'active' | 'ended';
}): boolean {
  if (partnerOfferListingIsStayUnsupported(params.listing)) return false;
  return params.status === 'active';
}
