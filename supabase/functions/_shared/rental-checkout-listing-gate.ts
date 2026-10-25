/**
 * Rental checkout stays behind RENTAL_CHECKOUT_ENABLED.
 * Migration 282 keeps rental listings unpublished, so a paid Checkout Session
 * for a draft rental must confirm. Tours and stays still require published.
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
