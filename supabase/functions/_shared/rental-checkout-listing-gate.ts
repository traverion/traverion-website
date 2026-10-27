/**
 * Rental checkout stays behind RENTAL_CHECKOUT_ENABLED.
 * Published rentals book like tours/stays. Draft rental checkout remains allowed
 * only when the capability flag is on (cert / pilot paths).
 */

export function rentalDraftCheckoutAllowed(input: {
  inventoryFamily: string | null | undefined;
  listingStatus: string;
  rentalCheckoutEnabled: boolean;
}): boolean {
  return (
    input.rentalCheckoutEnabled === true &&
    input.inventoryFamily === 'rental' &&
    input.listingStatus.trim() === 'draft'
  );
}

export function paidPromotionListingStillBookable(input: {
  inventoryFamily: string;
  listingStatus: string;
  seasonBookable: boolean;
}): boolean {
  if (!input.seasonBookable) return false;
  const status = input.listingStatus.trim();
  if (input.inventoryFamily === 'rental') {
    return status === 'draft' || status === 'published';
  }
  return status === 'published';
}
