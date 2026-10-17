import { supabase } from '../lib/supabase';
import { localYmd } from '../lib/local-ymd';
import { formatMoney } from '../lib/money';
import { partnerOfferMayBePersistedForListing } from '../lib/partner-offers-honesty';
import { queryRowsOrThrow } from '../lib/query-rows-or-throw';
import { offerApplies, validateOfferDateWindow } from '../lib/offer-eligibility';

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
  /** Booking window. Null on legacy rows, which still use valid_from/valid_until as the departure window. */
  book_from?: string | null;
  book_until?: string | null;
  activity_from?: string | null;
  activity_until?: string | null;
  paused?: boolean;
  booking_limit?: number | null;
  deleted_at?: string | null;
  offer_group_id?: string | null;
  /** Filled by checkout before quoting. Not a database column. */
  redeemed_count?: number | null;
};

export type ListingDiscountInsert = Omit<ListingDiscount, 'id' | 'created_at'>;

/** Partner UI: percent offers must be within this range (stored as positive numbers, e.g. 15 = 15% off). */
export const SUPPLIER_DISCOUNT_PERCENT_MIN = 5;
export const SUPPLIER_DISCOUNT_PERCENT_MAX = 50;
/**
 * Inclusive calendar-day cap for a booking or activity window.
 * Raised from the old 30-day product cap. Enforced before insert; see offer-eligibility.ts.
 */
export const SUPPLIER_DISCOUNT_MAX_RANGE_DAYS = 730;

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
    created_at: String(row.created_at ?? ''),
    book_from: row.book_from != null ? String(row.book_from).slice(0, 10) : null,
    book_until: row.book_until != null ? String(row.book_until).slice(0, 10) : null,
    activity_from: row.activity_from != null ? String(row.activity_from).slice(0, 10) : null,
    activity_until: row.activity_until != null ? String(row.activity_until).slice(0, 10) : null,
    paused: row.paused === true,
    booking_limit:
      row.booking_limit != null && Number(row.booking_limit) > 0 ? Math.floor(Number(row.booking_limit)) : null,
    deleted_at: row.deleted_at != null ? String(row.deleted_at) : null,
    offer_group_id: row.offer_group_id != null ? String(row.offer_group_id) : null,
  };
}

function offerWriteColumns(d: Partial<ListingDiscountInsert>) {
  return {
    ...(d.book_from !== undefined && { book_from: d.book_from }),
    ...(d.book_until !== undefined && { book_until: d.book_until }),
    ...(d.activity_from !== undefined && { activity_from: d.activity_from }),
    ...(d.activity_until !== undefined && { activity_until: d.activity_until }),
    ...(d.paused !== undefined && { paused: d.paused === true }),
    ...(d.booking_limit !== undefined && { booking_limit: d.booking_limit }),
    ...(d.deleted_at !== undefined && { deleted_at: d.deleted_at }),
    ...(d.offer_group_id !== undefined && { offer_group_id: d.offer_group_id }),
  };
}

export async function fetchDiscountsByListingId(listingId: string): Promise<ListingDiscount[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('listing_discounts')
    .select('*')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false });
  // Failure must not look like "no offers" (Phase 1088).
  return queryRowsOrThrow(data, error).map((r) => rowToDiscount(r as Record<string, unknown>));
}

async function listingAllowsPartnerOffer(listingId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('listings')
    .select('listing_extras')
    .eq('id', listingId)
    .maybeSingle();
  if (error || !data) return false;
  return partnerOfferMayBePersistedForListing({ listingExtras: data.listing_extras });
}

export async function insertDiscount(d: ListingDiscountInsert): Promise<ListingDiscount | null> {
  if (!supabase) return null;
  if (!(await listingAllowsPartnerOffer(d.listing_id))) return null;
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
      ...offerWriteColumns(d),
    })
    .select()
    .single();
  if (error) return null;
  return rowToDiscount(data as Record<string, unknown>);
}

export async function updateDiscount(id: string, d: Partial<ListingDiscountInsert>): Promise<ListingDiscount | null> {
  if (!supabase) return null;
  const listingId = d.listing_id?.trim();
  if (listingId) {
    if (!(await listingAllowsPartnerOffer(listingId))) return null;
  } else {
    const { data: existing, error: existingErr } = await supabase
      .from('listing_discounts')
      .select('listing_id')
      .eq('id', id)
      .maybeSingle();
    if (existingErr || !existing?.listing_id) return null;
    if (!(await listingAllowsPartnerOffer(String(existing.listing_id)))) return null;
  }
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
      ...offerWriteColumns(d),
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
  return offerApplies(d, { optionId: d.booking_option_id, activityDay: t, bookingDay: t });
}

/** Check if a listing has a valid discount now (for display price). Legacy: first active row; prefer option-aware APIs on the site. */
export function getValidDiscount(
  discounts: ListingDiscount[],
  at: Date = new Date()
): ListingDiscount | undefined {
  const t = localYmd(at);
  return discounts.find((d) => isDiscountActiveOnDate(d, t));
}

/** Active discounts that apply to a booking option (null booking_option_id = all options). */
export function discountsApplicableToOption(
  discounts: ListingDiscount[],
  optionId: string,
  at: Date | string = new Date(),
  bookingDayIso?: string
): ListingDiscount[] {
  const activityDay =
    typeof at === 'string'
      ? /^\d{4}-\d{2}-\d{2}/.test(at)
        ? at.slice(0, 10)
        : localYmd(new Date())
      : localYmd(at);
  const bookingDay =
    bookingDayIso && /^\d{4}-\d{2}-\d{2}$/.test(bookingDayIso) ? bookingDayIso : activityDay;
  return discounts.filter((d) => offerApplies(d, { optionId, activityDay, bookingDay }));
}

/** Validate a booking or activity window (YYYY-MM-DD). Returns an error message or null. */
export function validateSupplierDiscountDateRange(validFrom: string, validUntil: string): string | null {
  return validateOfferDateWindow(validFrom, validUntil, 'booking period');
}

/** Fetch discounts for multiple listings in one call (for cards/detail). */
export async function fetchDiscountsByListingIds(listingIds: string[]): Promise<Map<string, ListingDiscount[]>> {
  if (!supabase || listingIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('listing_discounts')
    .select('*')
    .in('listing_id', listingIds);
  // Failure must not look like "no offers" (Phase 1088).
  const list = queryRowsOrThrow(data, error).map((r) => rowToDiscount(r as Record<string, unknown>));
  const map = new Map<string, ListingDiscount[]>();
  for (const d of list) {
    const arr = map.get(d.listing_id) ?? [];
    arr.push(d);
    map.set(d.listing_id, arr);
  }
  return map;
}

/**
 * Compute discounted price and optional label (e.g. "20% off").
 * currency only matters for legacy 'fixed' amount discounts (no longer creatable via the
 * partner Offers wizard, but real rows can still be live) so the label shows the listing's
 * real currency instead of assuming USD.
 */
export type SaveSupplierOfferInput = {
  listingId: string;
  existing: ListingDiscount[];
  optionIds: string[];
  listingWide: boolean;
  type: 'percent' | 'fixed';
  value: number;
  bookFrom: string;
  bookUntil: string;
  activityFrom: string | null;
  activityUntil: string | null;
  bookingLimit: number | null;
};

function newOfferGroupId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `offer-${Date.now()}`;
}

/** Create or replace the rows that make up one supplier offer. Soft-deletes options that were removed. */
export async function saveSupplierOffer(
  input: SaveSupplierOfferInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Could not save this offer. Try again.' };
  if (!(await listingAllowsPartnerOffer(input.listingId))) {
    return { ok: false, error: 'Offers can only be saved on a tour listing.' };
  }
  const bookErr = validateOfferDateWindow(input.bookFrom, input.bookUntil, 'booking period');
  if (bookErr) return { ok: false, error: bookErr };
  if (input.activityFrom || input.activityUntil) {
    const actErr = validateOfferDateWindow(input.activityFrom ?? '', input.activityUntil ?? '', 'activity period');
    if (actErr) return { ok: false, error: actErr };
  }
  if (input.type === 'percent') {
    const p = Math.round(input.value);
    if (p < SUPPLIER_DISCOUNT_PERCENT_MIN || p > SUPPLIER_DISCOUNT_PERCENT_MAX) {
      return {
        ok: false,
        error: `Discount must be between ${SUPPLIER_DISCOUNT_PERCENT_MIN}% and ${SUPPLIER_DISCOUNT_PERCENT_MAX}%.`,
      };
    }
  }
  if (input.bookingLimit != null && (!Number.isInteger(input.bookingLimit) || input.bookingLimit < 1)) {
    return { ok: false, error: 'Booking limit must be a positive whole number.' };
  }
  const optionIds = input.listingWide ? [] : input.optionIds.map((id) => id.trim()).filter(Boolean);
  if (!input.listingWide && optionIds.length === 0) {
    return { ok: false, error: 'Choose at least one booking option.' };
  }

  const groupId = input.existing.find((row) => row.offer_group_id)?.offer_group_id ?? newOfferGroupId();
  const liveExisting = input.existing.filter((row) => !row.deleted_at);
  const keepPaused = liveExisting.length > 0 && liveExisting.every((row) => row.paused === true);
  const shared = {
    listing_id: input.listingId,
    type: input.type,
    value: input.type === 'percent' ? Math.round(input.value) : input.value,
    code: null,
    valid_from: input.bookFrom,
    valid_until: input.bookUntil,
    book_from: input.bookFrom,
    book_until: input.bookUntil,
    activity_from: input.activityFrom,
    activity_until: input.activityUntil,
    paused: keepPaused,
    booking_limit: input.bookingLimit,
    deleted_at: null,
    offer_group_id: groupId,
  };

  const targets = input.listingWide ? [null] : optionIds;
  const used = new Set<string>();
  for (const optionId of targets) {
    const match = input.existing.find((row) => {
      if (used.has(row.id) || row.deleted_at) return false;
      const scope = row.booking_option_id?.trim() || null;
      return scope === optionId;
    });
    if (match) {
      used.add(match.id);
      const updated = await updateDiscount(match.id, { ...shared, booking_option_id: optionId });
      if (!updated) return { ok: false, error: 'Could not update this offer. Refresh and try again.' };
    } else {
      const inserted = await insertDiscount({ ...shared, booking_option_id: optionId });
      if (!inserted) return { ok: false, error: 'Could not create this offer. Check your connection and try again.' };
    }
  }
  for (const row of input.existing) {
    if (used.has(row.id) || row.deleted_at) continue;
    const removed = await updateDiscount(row.id, { deleted_at: new Date().toISOString(), paused: true });
    if (!removed) return { ok: false, error: 'Could not update this offer. Refresh and try again.' };
  }
  return { ok: true };
}

export async function setOfferPaused(ids: string[], paused: boolean): Promise<boolean> {
  if (!supabase || ids.length === 0) return false;
  const { error } = await supabase.from('listing_discounts').update({ paused }).in('id', ids);
  return !error;
}

export async function softDeleteOffers(ids: string[]): Promise<boolean> {
  if (!supabase || ids.length === 0) return false;
  const { error } = await supabase
    .from('listing_discounts')
    .update({ deleted_at: new Date().toISOString(), paused: true })
    .in('id', ids);
  return !error;
}

export type OfferRedemptionStats = {
  available: boolean;
  bookings: number;
  guests: number;
  supplierNetMinor: number | null;
};

/** Confirmed paid bookings that stored this offer id. Earnings stay null when snapshots cannot be read. */
export async function fetchOfferRedemptionStats(
  discountIds: string[]
): Promise<Map<string, OfferRedemptionStats>> {
  const map = new Map<string, OfferRedemptionStats>();
  if (!supabase || discountIds.length === 0) return map;
  const { data, error } = await supabase
    .from('bookings')
    .select('id, applied_discount_id, guests, payment_status, status')
    .in('applied_discount_id', discountIds);
  if (error) return map;
  const bookingIds: string[] = [];
  const bookingToOffer = new Map<string, string>();
  for (const row of data ?? []) {
    const offerId = row.applied_discount_id ? String(row.applied_discount_id) : '';
    if (!offerId) continue;
    const current = map.get(offerId) ?? { available: true, bookings: 0, guests: 0, supplierNetMinor: null };
    current.available = true;
    const paid = String(row.payment_status ?? '') === 'paid' && String(row.status ?? '') !== 'cancelled';
    if (paid) {
      current.bookings += 1;
      current.guests += Math.max(0, Math.floor(Number(row.guests) || 0));
      const bookingId = String(row.id);
      bookingIds.push(bookingId);
      bookingToOffer.set(bookingId, offerId);
    }
    map.set(offerId, current);
  }
  if (bookingIds.length === 0) return map;
  const snaps = await supabase
    .from('booking_commercial_snapshots')
    .select('booking_id, remaining_supplier_minor')
    .in('booking_id', bookingIds);
  if (snaps.error) return map;
  for (const snap of snaps.data ?? []) {
    const offerId = bookingToOffer.get(String(snap.booking_id));
    if (!offerId) continue;
    const current = map.get(offerId);
    if (!current) continue;
    const net = Number(snap.remaining_supplier_minor);
    if (!Number.isFinite(net)) continue;
    current.supplierNetMinor = (current.supplierNetMinor ?? 0) + Math.round(net);
  }
  return map;
}

export function applyDiscount(
  price: number,
  discount: ListingDiscount,
  currency: string = 'USD'
): { price: number; label: string } {
  if (discount.type === 'percent') {
    const p = Math.round(price * (1 - discount.value / 100) * 100) / 100;
    return { price: p, label: `${discount.value}% off` };
  }
  const p = Math.max(0, Math.round((price - discount.value) * 100) / 100);
  return { price: p, label: `${formatMoney(discount.value, currency)} off` };
}
