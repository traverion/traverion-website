import { supabase } from '../lib/supabase';

/** Fetch listing IDs in the current user's wishlist. Throws on Supabase error. */
export async function fetchWishlistListingIds(userId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('wishlist')
    .select('listing_id')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { listing_id: string }) => r.listing_id);
}

/** Add listing to wishlist. */
export async function addToWishlist(userId: string, listingId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('wishlist').insert({ user_id: userId, listing_id: listingId });
  return !error;
}

/** Remove listing from wishlist. */
export async function removeFromWishlist(userId: string, listingId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('wishlist')
    .delete()
    .eq('user_id', userId)
    .eq('listing_id', listingId);
  return !error;
}

/** Toggle: if in wishlist remove, else add. Returns new state (true = in wishlist). */
export async function toggleWishlist(userId: string, listingId: string): Promise<{ inWishlist: boolean; error?: string }> {
  const ids = await fetchWishlistListingIds(userId);
  const isIn = ids.includes(listingId);
  if (isIn) {
    const ok = await removeFromWishlist(userId, listingId);
    return ok ? { inWishlist: false } : { inWishlist: true, error: 'Failed to remove' };
  } else {
    const ok = await addToWishlist(userId, listingId);
    return ok ? { inWishlist: true } : { inWishlist: false, error: 'Failed to add' };
  }
}
