import { supabase } from '../lib/supabase';

export type ListingDiscount = {
  id: string;
  listing_id: string;
  type: 'percent' | 'fixed';
  value: number;
  code: string | null;
  valid_from: string | null;
  valid_until: string | null;
  /** When set, discount applies only to this booking option id from listing extras; null = all options. */
  booking_option_id: string | null;
  created_at: string;
};

export type ListingDiscountInsert = Omit<ListingDiscount, 'id' | 'created_at'>;

/** Partner UI: percent offers must be within this range (stored as positive numbers, e.g. 15 = 15% off). */
export const SUPPLIER_DISCOUNT_PERCENT_MIN = 5;
export const SUPPLIER_DISCOUNT_PERCENT_MAX = 50;
/** Inclusive calendar days between valid_from and valid_until (partner-created offers). */
export const SUPPLIER_DISCOUNT_MAX_RANGE_DAYS = 30;

function rowToDiscount(row: Record<string, unknown>): ListingDiscount {
  return {
    id: String(row.id),
    listing_id: String(row.listing_id),
    type: row.type === 'fixed' ? 'fixed' : 'percent',
    value: Number(row.value),
    code: row.code != null ? String(row.code) : null,
    valid_from: row.valid_from != null ? String(row.valid_from).slice(0, 10) : null,
    valid_until: row.valid_until != null ? String(row.valid_until).slice(0, 10) : null,
    booking_option_id:
      row.booking_option_id != null && String(row.booking_option_id).trim()
        ? String(row.booking_option_id).trim()
        : null,
    created_at: String(row.created_at),
  };
}

export async function fetchDiscountsByListingId(listingId: string): Promise<ListingDiscount[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('listing_discounts')
    .select('*')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map((r) => rowToDiscount(r as Record<string, unknown>));
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
      booking_option_id: d.booking_option_id?.trim() ? d.booking_option_id.trim() : null,
    })
    .select()
    .single();
  if (error) return null;
  return rowToDiscount(data as Record<string, unknown>);
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
      ...(d.booking_option_id !== undefined && {
        booking_option_id: d.booking_option_id?.trim() ? d.booking_option_id.trim() : null,
      }),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) return null;
  return rowToDiscount(data as Record<string, unknown>);
}

export async function deleteDiscount(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('listing_discounts').delete().eq('id', id);
  return !error;
}

function isDiscountActiveOnDate(d: ListingDiscount, t: string): boolean {
  if (d.valid_from && t < d.valid_from) return false;
  if (d.valid_until && t > d.valid_until) return false;
  return true;
}

/** Check if a listing has a valid discount now (for display price). Legacy: first active row; prefer option-aware APIs on the site. */
export function getValidDiscount(
  discounts: ListingDiscount[],
  at: Date = new Date()
): ListingDiscount | undefined {
  const t = at.toISOString().slice(0, 10);
  return discounts.find((d) => isDiscountActiveOnDate(d, t));
}

/** Active discounts that apply to a booking option (null booking_option_id = all options). */
export function discountsApplicableToOption(
  discounts: ListingDiscount[],
  optionId: string,
  at: Date = new Date()
): ListingDiscount[] {
  const t = at.toISOString().slice(0, 10);
  return discounts.filter((d) => {
    if (!isDiscountActiveOnDate(d, t)) return false;
    const scope = d.booking_option_id?.trim();
    if (!scope) return true;
    return scope === optionId;
  });
}

/** Validate partner offer date range (YYYY-MM-DD). Returns error message or null if OK. */
export function validateSupplierDiscountDateRange(validFrom: string, validUntil: string): string | null {
  const from = validFrom.trim();
  const until = validUntil.trim();
  if (!from || !until) return 'Choose both a start and end date.';
  if (until < from) return 'End date must be on or after the start date.';
  const a = new Date(from + 'T12:00:00');
  const b = new Date(until + 'T12:00:00');
  const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  if (days > SUPPLIER_DISCOUNT_MAX_RANGE_DAYS) {
    return `Offers can run at most ${SUPPLIER_DISCOUNT_MAX_RANGE_DAYS} days (inclusive). This range is ${days} days.`;
  }
  if (days < 1) return 'Invalid date range.';
  return null;
}

/** Fetch discounts for multiple listings in one call (for cards/detail). */
export async function fetchDiscountsByListingIds(listingIds: string[]): Promise<Map<string, ListingDiscount[]>> {
  if (!supabase || listingIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('listing_discounts')
    .select('*')
    .in('listing_id', listingIds);
  if (error) return new Map();
  const list = (data ?? []).map((r) => rowToDiscount(r as Record<string, unknown>));
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
