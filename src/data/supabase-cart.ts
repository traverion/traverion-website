import { supabase } from '../lib/supabase';

export type CartItemRow = {
  id: string;
  user_id: string;
  listing_id: string;
  booking_date: string;
  guests: number;
  created_at: string;
};

export type CartItemWithListing = CartItemRow & {
  listing_title?: string;
  listing_image?: string;
  price_per_person?: number;
  currency?: string;
};

/** Fetch current user's cart items. Throws on Supabase error. */
export async function fetchCartItems(userId: string): Promise<CartItemRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('cart_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CartItemRow[];
}

/** Fetch cart items with listing title (and optional image, price) for display. */
export async function fetchCartWithListings(userId: string): Promise<CartItemWithListing[]> {
  const items = await fetchCartItems(userId);
  if (items.length === 0) return [];
  if (!supabase) return items.map((i) => ({ ...i }));
  const ids = [...new Set(items.map((i) => i.listing_id))];
  const { data: listings } = await supabase
    .from('listings')
    .select('id, title, image, price_starting_from, price_currency')
    .in('id', ids);
  const byId: Record<string, { title?: string; image?: string; price_starting_from?: number; price_currency?: string }> = {};
  (listings ?? []).forEach((l: { id: string; title?: string; image?: string; price_starting_from?: number; price_currency?: string }) => {
    byId[l.id] = l;
  });
  return items.map((item) => ({
    ...item,
    listing_title: byId[item.listing_id]?.title,
    listing_image: byId[item.listing_id]?.image ?? undefined,
    price_per_person: byId[item.listing_id]?.price_starting_from,
    currency: byId[item.listing_id]?.price_currency ?? 'USD',
  }));
}

/** Add item to cart. */
export async function addToCart(
  userId: string,
  listingId: string,
  bookingDate: string,
  guests: number
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { error } = await supabase.from('cart_items').insert({
    user_id: userId,
    listing_id: listingId,
    booking_date: bookingDate,
    guests: guests >= 1 ? guests : 1,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Remove cart item. */
export async function removeFromCart(userId: string, cartItemId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('id', cartItemId)
    .eq('user_id', userId);
  return !error;
}

/** Update cart item (date or guests). */
export async function updateCartItem(
  userId: string,
  cartItemId: string,
  updates: { booking_date?: string; guests?: number }
): Promise<boolean> {
  if (!supabase) return false;
  const payload: { booking_date?: string; guests?: number } = {};
  if (updates.booking_date) payload.booking_date = updates.booking_date;
  if (updates.guests != null && updates.guests >= 1) payload.guests = updates.guests;
  if (Object.keys(payload).length === 0) return true;
  const { error } = await supabase
    .from('cart_items')
    .update(payload)
    .eq('id', cartItemId)
    .eq('user_id', userId);
  return !error;
}

/** Cart items count for header. */
export async function fetchCartCount(userId: string): Promise<number> {
  const items = await fetchCartItems(userId);
  return items.length;
}
