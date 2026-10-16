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
    currency: byId[item.listing_id]?.price_currency ?? 'EUR',
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

export type AccountCartSelection = {
  listingId: string;
  bookingDate: string;
  guests: number;
  optionId?: string | null;
  startTime?: string | null;
  participantMix?: Record<string, number> | null;
  currency?: string | null;
};

/**
 * Remember the latest selection for this listing. Does not hold seats or freeze a price.
 * Falls back to date + guests if the selection columns are not migrated yet.
 */
export async function rememberAccountCart(userId: string, item: AccountCartSelection): Promise<void> {
  if (!supabase || !userId || !item.listingId || !item.bookingDate) return;
  const guests = item.guests >= 1 ? Math.min(99, Math.floor(item.guests)) : 1;
  const rich = {
    booking_date: item.bookingDate,
    guests,
    option_id: item.optionId || null,
    start_time: item.startTime || null,
    participant_mix: item.participantMix && Object.keys(item.participantMix).length > 0 ? item.participantMix : null,
    currency: item.currency || null,
  };
  const basic = { booking_date: item.bookingDate, guests };
  const { data } = await supabase
    .from('cart_items')
    .select('id')
    .eq('user_id', userId)
    .eq('listing_id', item.listingId)
    .order('created_at', { ascending: false })
    .limit(1);
  const existingId = (data?.[0] as { id?: string } | undefined)?.id;
  if (existingId) {
    const updated = await supabase.from('cart_items').update(rich).eq('id', existingId).eq('user_id', userId);
    if (updated.error) {
      await supabase.from('cart_items').update(basic).eq('id', existingId).eq('user_id', userId);
    }
    return;
  }
  const inserted = await supabase.from('cart_items').insert({
    user_id: userId,
    listing_id: item.listingId,
    ...rich,
  });
  if (inserted.error) {
    await supabase.from('cart_items').insert({
      user_id: userId,
      listing_id: item.listingId,
      ...basic,
    });
  }
}

export async function loadAccountCartForListing(
  userId: string,
  listingId: string
): Promise<(CartItemRow & {
  option_id?: string | null;
  start_time?: string | null;
  participant_mix?: Record<string, number> | null;
  currency?: string | null;
}) | null> {
  if (!supabase || !userId || !listingId) return null;
  const { data, error } = await supabase
    .from('cart_items')
    .select('*')
    .eq('user_id', userId)
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error || !data?.[0]) return null;
  return data[0] as CartItemRow & {
    option_id?: string | null;
    start_time?: string | null;
    participant_mix?: Record<string, number> | null;
  };
}

/** Cart items count for header. */
export async function fetchCartCount(userId: string): Promise<number> {
  const items = await fetchCartItems(userId);
  return items.length;
}
