import { supabase } from '../lib/supabase';
import { supplierPortalPublicBaseUrl } from '../lib/partnerHost';
import { bookingEligibleForReview } from '../lib/review-eligibility';
import { redactUnpaidStayCheckInAddress } from '../lib/purchase-snapshot';
import { notifySupplierEvent } from './supabase-supplier-messaging';
import { resolveSupplierId } from './supabase-supplier-team';
import { inventoryFamilyFromListing, type InventoryFamily } from '../lib/inventory';
import { parseListingExtras } from '../types/listingExtras';
import { reviewHasWrittenFeedback } from '../lib/review-feedback';

export type ReviewRow = {
  id: string;
  listing_id: string;
  user_id: string;
  booking_id: string | null;
  guest_name: string;
  rating: number;
  title: string | null;
  comment: string;
  images: string[];
  created_at: string;
};

export type ReviewDisplay = ReviewRow & { verified: boolean };

/** Fetch reviews for a listing (newest first). */
export async function fetchReviewsByListingId(listingId: string): Promise<ReviewDisplay[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: ReviewRow) => ({
    ...r,
    images: Array.isArray(r.images) ? r.images : [],
    verified: !!r.booking_id,
  }));
}

/**
 * Mean of finite numeric ratings, rounded to one decimal. Count is the number of valid ratings used.
 */
export function aggregateReviewRatings(ratings: Array<number | string | null | undefined>): { avg: number; count: number } {
  const nums = ratings.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return { avg: 0, count: 0 };
  const sum = nums.reduce((a, b) => a + b, 0);
  return { avg: Math.round((sum / nums.length) * 10) / 10, count: nums.length };
}

/** Aggregate rating and count for a listing from reviews table. */
export async function getReviewAggregateForListing(listingId: string): Promise<{ rating: number; count: number }> {
  if (!supabase) return { rating: 0, count: 0 };
  const { data, error } = await supabase
    .from('reviews')
    .select('rating')
    .eq('listing_id', listingId);
  // Phase 1097: query failure ≠ zero reviews.
  if (error) throw new Error(error.message);
  if (!data?.length) return { rating: 0, count: 0 };
  const { avg, count } = aggregateReviewRatings(data.map((r: { rating: number }) => r.rating));
  return { rating: avg, count };
}

/** Batch aggregates for listing cards (packages, home, destinations). One round-trip per chunk. */
export async function getReviewAggregatesForListingIds(
  listingIds: string[]
): Promise<Map<string, { rating: number; count: number }>> {
  const out = new Map<string, { rating: number; count: number }>();
  if (!supabase || listingIds.length === 0) return out;
  const unique = [...new Set(listingIds)];
  const chunkSize = 120;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase.from('reviews').select('listing_id, rating').in('listing_id', chunk);
    // Phase 1097: chunk failure must not silently omit ratings (looks like “no reviews”).
    if (error) throw new Error(error.message);
    const buckets = new Map<string, number[]>();
    for (const row of data ?? []) {
      const lid = String((row as { listing_id: string }).listing_id);
      const r = Number((row as { rating: number }).rating);
      if (!Number.isFinite(r)) continue;
      if (!buckets.has(lid)) buckets.set(lid, []);
      buckets.get(lid)!.push(r);
    }
    for (const lid of chunk) {
      const ratings = buckets.get(lid);
      if (ratings?.length) {
        const { avg, count } = aggregateReviewRatings(ratings);
        out.set(lid, { rating: avg, count });
      } else {
        out.set(lid, { rating: 0, count: 0 });
      }
    }
  }
  return out;
}

/** Submit a review (user must be logged in). Requires a paid completed booking id (RLS 117/118). */
export async function submitReview(params: {
  listingId: string;
  userId: string;
  guestName: string;
  rating: number;
  title?: string;
  comment: string;
  bookingId: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const bookingId = (params.bookingId ?? '').trim();
  if (!bookingId) {
    return { success: false, error: 'A completed booking is required to leave a review.' };
  }
  // Phase 579: capture the real row id so notify-supplier-event can re-derive
  // rating/title/guest name from the actual reviews row instead of trusting
  // this call's params verbatim (see supabase/functions/_shared/notify-supplier-event-guard.ts).
  const { data: savedReview, error } = await supabase
    .from('reviews')
    .upsert(
      {
        listing_id: params.listingId,
        user_id: params.userId,
        guest_name: params.guestName,
        rating: params.rating,
        title: params.title ?? null,
        comment: params.comment,
        booking_id: bookingId,
      },
      { onConflict: 'listing_id,user_id' }
    )
    .select('id')
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  const { data: listingData } = await supabase
    .from('listings')
    .select('supplier_id, title')
    .eq('id', params.listingId)
    .maybeSingle();
  if (listingData?.supplier_id && savedReview?.id) {
    void notifySupplierEvent({
      supplierId: listingData.supplier_id,
      eventType: 'new_review',
      listingId: params.listingId,
      listingTitle: listingData.title ?? undefined,
      reviewId: savedReview.id,
      reviewRating: params.rating,
      reviewTitle: params.title,
      guestName: params.guestName,
      portalBaseUrl: supplierPortalPublicBaseUrl(),
    });
  }
  return { success: true };
}

/** Check if the current user has a confirmed/completed booking for this listing (for "can leave review").
 * Phase 1160: match guest_user_id or guest_email (parity with booking RLS). */
export async function userHasCompletedBookingForListing(
  userId: string,
  userEmail: string,
  listingId: string
): Promise<{ canReview: boolean; bookingId?: string }> {
  if (!supabase) return { canReview: false };
  const nowMs = Date.now();
  const uid = (userId ?? '').trim();
  const email = (userEmail ?? '').trim().toLowerCase();
  if (!uid && !email) return { canReview: false };

  let q = supabase
    .from('bookings')
    .select(
      'id, status, payment_status, booking_date, start_time, check_out, nights, special_requests, purchase_snapshot'
    )
    .eq('listing_id', listingId)
    .eq('status', 'confirmed')
    .order('booking_date', { ascending: false })
    .limit(50);
  if (uid && email) {
    // Phase 1352: email match only when guest_user_id is unbound (booking_traveler_owns parity).
    q = q.or(`guest_user_id.eq.${uid},and(guest_user_id.is.null,guest_email.eq.${email})`);
  } else if (uid) {
    q = q.eq('guest_user_id', uid);
  } else {
    // Unbound email-only path — RLS also requires guest_user_id IS NULL.
    q = q.is('guest_user_id', null).eq('guest_email', email);
  }
  const listingExtrasQuery = supabase
    .from('listings')
    .select('listing_extras')
    .eq('id', listingId)
    .maybeSingle();
  const [{ data, error }, { data: listingRow, error: listingErr }] = await Promise.all([q, listingExtrasQuery]);
  // Phase 1310: query failure ≠ “no completed booking” — throw so callers fail closed.
  if (error) throw new Error(error.message);
  if (listingErr) throw new Error(listingErr.message);
  if (!data?.length) return { canReview: false };

  const listingDepartureTz =
    parseListingExtras(listingRow?.listing_extras)?.departureTimezone?.trim() || null;

  // Phase 1359: same unpaid checkInAddress strip as Trips fetches (1358).
  const rows = (data as Array<{
    id: string;
    payment_status?: string | null;
    purchase_snapshot?: unknown;
    [key: string]: unknown;
  }>).map((row) => redactUnpaidStayCheckInAddress(row));

  const eligible = rows.find((b) =>
    bookingEligibleForReview({ ...b, departureTimezone: listingDepartureTz }, nowMs)
  );
  if (!eligible) return { canReview: false };
  return { canReview: true, bookingId: eligible.id };
}

/**
 * Check if the current user has already reviewed this listing.
 * Phase 1303: throw on Supabase error — callers must not treat infrastructure
 * failure as “not reviewed” (would invent a Leave review CTA).
 */
export async function userHasReviewedListing(userId: string, listingId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('reviews')
    .select('id')
    .eq('user_id', userId)
    .eq('listing_id', listingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

/** Fetch all reviews for a supplier's listings (for supplier portal). Throws on Supabase error.
 * Phase 1157: resolve team JWT → owner supplier_id. */
export async function fetchReviewsForSupplierListings(
  supplierId: string
): Promise<(ReviewDisplay & { listing_title?: string; listing_family?: InventoryFamily })[]> {
  if (!supabase) return [];
  const ownerSupplierId = await resolveSupplierId(supplierId);
  const { data: listings, error: listErr } = await supabase
    .from('listings')
    .select('id, title, listing_extras')
    .eq('supplier_id', ownerSupplierId);
  if (listErr) throw new Error(listErr.message);
  const ids = (listings ?? []).map((l: { id: string }) => l.id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .in('listing_id', ids)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const byListingId: Record<string, { title: string; family: InventoryFamily }> = {};
  (listings ?? []).forEach((l: { id: string; title: string; listing_extras?: unknown }) => {
    byListingId[l.id] = {
      title: l.title,
      family: inventoryFamilyFromListing({ listingExtras: parseListingExtras(l.listing_extras) }),
    };
  });
  return (data ?? []).map((r: ReviewRow) => ({
    ...r,
    images: Array.isArray(r.images) ? r.images : [],
    verified: !!r.booking_id,
    listing_title: byListingId[r.listing_id]?.title,
    listing_family: byListingId[r.listing_id]?.family ?? 'tour',
  }));
}

export type ReviewReplyRow = {
  id: string;
  review_id: string;
  supplier_id: string;
  reply_text: string;
  created_at: string;
};

/** Get replies for given review IDs. Returns review_id -> reply. */
export async function getReviewRepliesByReviewIds(reviewIds: string[]): Promise<Record<string, ReviewReplyRow>> {
  if (!supabase || reviewIds.length === 0) return {};
  const { data, error } = await supabase
    .from('review_replies')
    .select('*')
    .in('review_id', reviewIds);
  // Phase 1094: query failure ≠ empty replies. Callers must not invent “all replied”.
  if (error) throw new Error(error.message);
  const out: Record<string, ReviewReplyRow> = {};
  (data ?? []).forEach((r: ReviewReplyRow) => { out[r.review_id] = r; });
  return out;
}

/** Count written reviews that still need a supplier reply (Today attention). */
export async function countUnrepliedWrittenReviewsForSupplier(supplierId: string): Promise<number> {
  const list = await fetchReviewsForSupplierListings(supplierId);
  const written = list.filter(reviewHasWrittenFeedback);
  if (written.length === 0) return 0;
  const replies = await getReviewRepliesByReviewIds(written.map((r) => r.id));
  return written.filter((r) => !replies[r.id]).length;
}

/** Supplier replies to a review (one reply per review). Phase 1157: team writes under owner supplier_id. */
export async function submitReviewReply(
  reviewId: string,
  supplierId: string,
  replyText: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const ownerSupplierId = await resolveSupplierId(supplierId);
  const { error } = await supabase.from('review_replies').upsert(
    { review_id: reviewId, supplier_id: ownerSupplierId, reply_text: replyText },
    { onConflict: 'review_id' }
  );
  if (error) return { success: false, error: error.message };
  return { success: true };
}
