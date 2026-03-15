import type { ListingDiscount } from '../data/supabase-discounts';
import { getValidDiscount, applyDiscount } from '../data/supabase-discounts';

export function isSupabaseListingId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** Get display price and optional discount label for a listing. */
export function getDisplayPrice(
  listingId: string,
  originalPrice: number,
  discountsByListing: Map<string, ListingDiscount[]>,
  at: Date = new Date()
): { price: number; originalPrice: number; label?: string } {
  const discounts = discountsByListing.get(listingId) ?? [];
  const valid = getValidDiscount(discounts, at);
  if (!valid) {
    return { price: originalPrice, originalPrice };
  }
  const { price, label } = applyDiscount(originalPrice, valid);
  return { price, originalPrice, label };
}
