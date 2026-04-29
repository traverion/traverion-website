import { supabase } from '../lib/supabase';
import { supplierPortalPublicBaseUrl } from '../lib/partnerHost';
import { notifySupplierEvent } from './supabase-supplier-messaging';

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
  if (error) return [];
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
  if (error || !data?.length) return { rating: 0, count: 0 };
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
    if (error) continue;
    const buckets = new Map<string, number[]>();
    for (const row of data ?? []) {
      const lid = String((row as { listing_id: string }).listing_id);
      const r = Number((row as { rating: number }).rating);
      if (!Number.isFinite(r)) continue;
      if (!buckets.has(lid)) buckets.set(lid, []);
      buckets.get(lid)!.push(r);
    }
    for (const [lid, ratings] of buckets) {
      const { avg, count } = aggregateReviewRatings(ratings);
      out.set(lid, { rating: avg, count });
    }
  }
  return out;
}

/** Submit a review (user must be logged in). Optionally link booking_id for "verified" badge. */
export async function submitReview(params: {
  listingId: string;
  userId: string;
  guestName: string;
  rating: number;
  title?: string;
  comment: string;
  bookingId?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { error } = await supabase.from('reviews').upsert(
    {
      listing_id: params.listingId,
      user_id: params.userId,
      guest_name: params.guestName,
      rating: params.rating,
      title: params.title ?? null,
      comment: params.comment,
      booking_id: params.bookingId ?? null,
    },
    { onConflict: 'listing_id,user_id' }
  );
  if (error) return { success: false, error: error.message };
  const { data: listingData } = await supabase
    .from('listings')
    .select('supplier_id, title')
    .eq('id', params.listingId)
    .maybeSingle();
  if (listingData?.supplier_id) {
    void notifySupplierEvent({
      supplierId: listingData.supplier_id,
      eventType: 'new_review',
      listingId: params.listingId,
      listingTitle: listingData.title ?? undefined,
      reviewRating: params.rating,
      reviewTitle: params.title,
      guestName: params.guestName,
      portalBaseUrl: supplierPortalPublicBaseUrl(),
    });
  }
  return { success: true };
}

/** Check if the current user has a confirmed/completed booking for this listing (for "can leave review"). */
export async function userHasCompletedBookingForListing(
  userEmail: string,
  listingId: string
): Promise<{ canReview: boolean; bookingId?: string }> {
  if (!supabase) return { canReview: false };
  const nowMs = Date.now();
  const toStartMs = (bookingDate: string | null, startTime: string | null): number | null => {
    const date = (bookingDate ?? '').trim();
    if (!date) return null;
    const t = (startTime ?? '').trim();
    const hhmm = /^(\d{1,2}):(\d{2})/.exec(t);
    const hh = hhmm ? hhmm[1].padStart(2, '0') : '23';
    const mm = hhmm ? hhmm[2] : '59';
    const d = new Date(`${date}T${hh}:${mm}:00`);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : null;
  };

  const { data, error } = await supabase
    .from('bookings')
    .select('id, booking_date, start_time')
    .eq('listing_id', listingId)
    .eq('guest_email', userEmail)
    .eq('status', 'confirmed')
    .order('booking_date', { ascending: false })
    .limit(50);
  if (error || !data?.length) return { canReview: false };

  const eligible = data.find((b: { id: string; booking_date: string | null; start_time?: string | null }) => {
    const startMs = toStartMs(b.booking_date, b.start_time ?? null);
    return startMs != null && nowMs > startMs;
  });
  if (!eligible) return { canReview: false };
  return { canReview: true, bookingId: eligible.id };
}

/** Check if the current user has already reviewed this listing. */
export async function userHasReviewedListing(userId: string, listingId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('reviews')
    .select('id')
    .eq('user_id', userId)
    .eq('listing_id', listingId)
    .maybeSingle();
  return !error && !!data;
}

/** Fetch all reviews for a supplier's listings (for supplier portal). Throws on Supabase error. */
export async function fetchReviewsForSupplierListings(supplierId: string): Promise<(ReviewDisplay & { listing_title?: string })[]> {
  if (!supabase) return [];
  const { data: listings, error: listErr } = await supabase.from('listings').select('id, title').eq('supplier_id', supplierId);
  if (listErr) throw new Error(listErr.message);
  const ids = (listings ?? []).map((l: { id: string }) => l.id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .in('listing_id', ids)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const byListingId: Record<string, string> = {};
  (listings ?? []).forEach((l: { id: string; title: string }) => { byListingId[l.id] = l.title; });
  return (data ?? []).map((r: ReviewRow) => ({
    ...r,
    images: Array.isArray(r.images) ? r.images : [],
    verified: !!r.booking_id,
    listing_title: byListingId[r.listing_id],
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
  if (error) return {};
  const out: Record<string, ReviewReplyRow> = {};
  (data ?? []).forEach((r: ReviewReplyRow) => { out[r.review_id] = r; });
  return out;
}

/** Supplier replies to a review (one reply per review). */
export async function submitReviewReply(
  reviewId: string,
  supplierId: string,
  replyText: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { error } = await supabase.from('review_replies').upsert(
    { review_id: reviewId, supplier_id: supplierId, reply_text: replyText },
    { onConflict: 'review_id' }
  );
  if (error) return { success: false, error: error.message };
  return { success: true };
}
