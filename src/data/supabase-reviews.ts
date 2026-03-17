import { supabase } from '../lib/supabase';

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

/** Aggregate rating and count for a listing from reviews table. */
export async function getReviewAggregateForListing(listingId: string): Promise<{ rating: number; count: number }> {
  if (!supabase) return { rating: 4.5, count: 0 };
  const { data, error } = await supabase
    .from('reviews')
    .select('rating')
    .eq('listing_id', listingId);
  if (error || !data?.length) return { rating: 4.5, count: 0 };
  const count = data.length;
  const sum = data.reduce((acc: number, r: { rating: number }) => acc + Number(r.rating), 0);
  return { rating: Math.round((sum / count) * 10) / 10, count };
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
  return { success: true };
}

/** Check if the current user has a confirmed/completed booking for this listing (for "can leave review"). */
export async function userHasCompletedBookingForListing(
  userEmail: string,
  listingId: string
): Promise<{ canReview: boolean; bookingId?: string }> {
  if (!supabase) return { canReview: false };
  const { data, error } = await supabase
    .from('bookings')
    .select('id')
    .eq('listing_id', listingId)
    .eq('guest_email', userEmail)
    .eq('status', 'confirmed')
    .limit(1)
    .maybeSingle();
  if (error || !data) return { canReview: false };
  return { canReview: true, bookingId: data.id };
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
