import { supabase } from '../lib/supabase';

export type ListingDiscount = {
  id: string;
  listing_id: string;
  type: 'percent' | 'fixed';
  value: number;
  code: string | null;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
};

export type ListingDiscountInsert = Omit<ListingDiscount, 'id' | 'created_at'>;

export async function fetchDiscountsByListingId(listingId: string): Promise<ListingDiscount[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('listing_discounts')
    .select('*')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as ListingDiscount[];
}

export async function insertDiscount(d: ListingDiscountInsert): Promise<ListingDiscount | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('listing_discounts')
    .insert({
      listing_id: d.listing_id,
      type: d.type,
      value: d.value,
      code: d.code ?? null,
      valid_from: d.valid_from ?? null,
      valid_until: d.valid_until ?? null,
    })
    .select()
    .single();
  if (error) return null;
  return data as ListingDiscount;
}

export async function updateDiscount(id: string, d: Partial<ListingDiscountInsert>): Promise<ListingDiscount | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('listing_discounts')
    .update({
      ...(d.type != null && { type: d.type }),
      ...(d.value != null && { value: d.value }),
      ...(d.code !== undefined && { code: d.code }),
      ...(d.valid_from !== undefined && { valid_from: d.valid_from }),
      ...(d.valid_until !== undefined && { valid_until: d.valid_until }),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) return null;
  return data as ListingDiscount;
}

export async function deleteDiscount(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('listing_discounts').delete().eq('id', id);
  return !error;
}

/** Check if a listing has a valid discount now (for display price). */
export function getValidDiscount(
  discounts: ListingDiscount[],
  at: Date = new Date()
): ListingDiscount | undefined {
  const t = at.toISOString().slice(0, 10);
  return discounts.find((d) => {
    if (d.valid_from && t < d.valid_from) return false;
    if (d.valid_until && t > d.valid_until) return false;
    return true;
  });
}

/** Fetch discounts for multiple listings in one call (for cards/detail). */
export async function fetchDiscountsByListingIds(listingIds: string[]): Promise<Map<string, ListingDiscount[]>> {
  if (!supabase || listingIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('listing_discounts')
    .select('*')
    .in('listing_id', listingIds);
  if (error) return new Map();
  const list = (data ?? []) as ListingDiscount[];
  const map = new Map<string, ListingDiscount[]>();
  for (const d of list) {
    const arr = map.get(d.listing_id) ?? [];
    arr.push(d);
    map.set(d.listing_id, arr);
  }
  return map;
}

/** Compute discounted price and optional label (e.g. "20% off"). */
export function applyDiscount(
  price: number,
  discount: ListingDiscount
): { price: number; label: string } {
  if (discount.type === 'percent') {
    const p = Math.round(price * (1 - discount.value / 100) * 100) / 100;
    return { price: p, label: `${discount.value}% off` };
  }
  const p = Math.max(0, Math.round((price - discount.value) * 100) / 100);
  return { price: p, label: `$${discount.value} off` };
}
