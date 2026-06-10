/**
 * Supplier: view all reviews for my listings and reply.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Star, MessageSquare, Send, AlertCircle, RefreshCw } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import {
  fetchReviewsForSupplierListings,
  getReviewRepliesByReviewIds,
  submitReviewReply,
  type ReviewDisplay,
  type ReviewReplyRow,
} from '../../data/supabase-reviews';

/** Star-only reviews have no title or comment; suppliers cannot reply and they do not count as “need reply”. */
function reviewHasWrittenFeedback(r: ReviewDisplay & { listing_title?: string }): boolean {
  const title = (r.title ?? '').trim();
  const comment = (r.comment ?? '').trim();
  return title.length > 0 || comment.length > 0;
}

export default function SupplierReviews() {
  const { user, isSupabase } = useSupplierAuth();
  const [reviews, setReviews] = useState<(ReviewDisplay & { listing_title?: string })[]>([]);
  const [replies, setReplies] = useState<Record<string, ReviewReplyRow>>({});
  const [loading, setLoading] = useState(true);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [highlightReviewId, setHighlightReviewId] = useState<string | null>(null);
  const [draftToneByReview, setDraftToneByReview] = useState<Record<string, 'friendly' | 'professional' | 'short'>>({});
  const [filterListingId, setFilterListingId] = useState('');
  const [filterRating, setFilterRating] = useState<number | ''>('');
  const [filterReply, setFilterReply] = useState<'all' | 'unreplied' | 'replied'>('all');

  const load = useCallback(async () => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await fetchReviewsForSupplierListings(uid);
      setReviews(list);
      const ids = list.map((r) => r.id);
      const replyMap = await getReviewRepliesByReviewIds(ids);
      setReplies(replyMap);
      setReplyText(
        list.reduce<Record<string, string>>((acc, r) => {
          acc[r.id] = replyMap[r.id]?.reply_text ?? '';
          return acc;
        }, {})
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, [isSupabase, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const readHighlightFromUrl = useCallback(() => {
    const id = new URLSearchParams(window.location.search).get('highlight');
    setHighlightReviewId(id && id.length > 0 ? id : null);
  }, []);

  useEffect(() => {
    readHighlightFromUrl();
    const onPop = () => readHighlightFromUrl();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [readHighlightFromUrl]);

  const listingOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of reviews) {
      if (r.listing_id) m.set(r.listing_id, (r.listing_title ?? 'Listing').trim() || 'Listing');
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => {
      if (filterListingId && r.listing_id !== filterListingId) return false;
      if (filterRating !== '' && Number(r.rating) !== filterRating) return false;
      if (filterReply === 'unreplied') {
        if (!reviewHasWrittenFeedback(r) || replies[r.id]) return false;
      }
      if (filterReply === 'replied') {
        if (!replies[r.id]) return false;
      }
      return true;
    });
  }, [reviews, filterListingId, filterRating, filterReply, replies]);

  const hasActiveFilters =
    Boolean(filterListingId) || filterRating !== '' || filterReply !== 'all';

  const unrepliedInFiltered = useMemo(
    () => filteredReviews.filter((r) => reviewHasWrittenFeedback(r) && !replies[r.id]).length,
    [filteredReviews, replies]
  );

  useEffect(() => {
    if (!highlightReviewId || loading) return;
    const el = document.getElementById(`supplier-review-card-${highlightReviewId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightReviewId, loading, filteredReviews]);

  const handleSubmitReply = async (reviewId: string) => {
    if (!user) return;
    const text = (replyText[reviewId] ?? '').trim();
    if (!text) return;
    setReplyingId(reviewId);
    setReplyError(null);
    const res = await submitReviewReply(reviewId, user.id, text);
    setReplyingId(null);
    if (res.success) {
      load();
    } else {
      setReplyError(res.error ?? 'Could not save reply. Check that you own this listing.');
    }
  };

  const generateReplyDraft = (
    r: ReviewDisplay & { listing_title?: string },
    tone: 'friendly' | 'professional' | 'short'
  ) => {
    const guest = r.guest_name?.trim() || 'there';
    const listing = r.listing_title || 'your experience';
    if (tone === 'short') {
      return `Hi ${guest}, thank you for your review of ${listing}. We appreciate your feedback and hope to welcome you again soon.`;
    }
    if (tone === 'professional') {
      return `Hello ${guest}, thank you for taking the time to share your feedback about ${listing}. We appreciate your comments and continuously use guest input to improve the experience. We hope to host you again in the future.`;
    }
    return `Hi ${guest}! Thank you so much for the lovely review on ${listing}. We're really happy you joined us, and your feedback means a lot to our team. Hope to see you again soon!`;
  };

  const unrepliedCount = reviews.filter(
    (r) => reviewHasWrittenFeedback(r) && !replies[r.id]
  ).length;

  const clearFilters = () => {
    setFilterListingId('');
    setFilterRating('');
    setFilterReply('all');
  };

  if (!user) return null;

  return (
    <div className="space-y-6 max-w-4xl w-full min-w-0 animate-fade-in-up">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-finland/10 flex items-center justify-center flex-shrink-0">
            <Star className="w-6 h-6 text-finland" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">Reviews</h1>
            <p className="mt-1 text-sm text-gray-600 leading-relaxed">
              See and respond to customer reviews for your listings. Written reviews can get a public reply.
            </p>
          </div>
        </div>

        {!loading && reviews.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-gray-100 pt-5 max-w-xl">
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500 font-medium">Total reviews</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{reviews.length}</p>
            {hasActiveFilters ? (
              <p className="text-xs text-gray-500 mt-1">{filteredReviews.length} match current filters</p>
            ) : null}
          </div>
          <div className="bg-white border border-amber-200 bg-amber-50/40 rounded-2xl p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-amber-800 font-medium">Not replied</p>
            <p className="text-2xl font-semibold text-amber-900 mt-1">
              {hasActiveFilters ? unrepliedInFiltered : unrepliedCount}
            </p>
            <p className="text-xs text-amber-800/80 mt-1">
              {hasActiveFilters
                ? 'Among filtered reviews (written only; star-only excluded).'
                : 'Written reviews only; star-only ratings are excluded.'}
            </p>
          </div>
        </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm flex items-center justify-between gap-4">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</span>
          <button type="button" onClick={() => load()} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-100 text-red-800 font-medium hover:bg-red-200">
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </div>
      )}

      {replyError && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm flex items-center justify-between gap-4">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{replyError}</span>
          <button type="button" onClick={() => setReplyError(null)} className="text-sm font-medium text-red-800 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4 animate-pulse">
          <div className="h-5 w-40 rounded-lg bg-gray-200" />
          <div className="space-y-3">
            <div className="h-28 rounded-2xl bg-gray-100" />
            <div className="h-28 rounded-2xl bg-gray-100" />
            <div className="h-28 rounded-2xl bg-gray-100" />
          </div>
        </div>
      ) : reviews.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <Star className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900">No reviews yet</h2>
          <p className="text-gray-500 mt-1">Reviews from customers will appear here once they leave feedback.</p>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-5">
          <div className="bg-white border border-gray-200 rounded-xl px-3 py-3 sm:px-4 sm:py-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                <div className="flex flex-col gap-1 min-w-[min(100%,12rem)] flex-1 sm:flex-none sm:min-w-[11rem]">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Product</label>
                  <select
                    value={filterListingId}
                    onChange={(e) => setFilterListingId(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white text-sm w-full"
                  >
                    <option value="">All products</option>
                    {listingOptions.map(([id, title]) => (
                      <option key={id} value={id}>
                        {title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1 min-w-[8.5rem]">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Star rating</label>
                  <select
                    value={filterRating === '' ? '' : String(filterRating)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFilterRating(v === '' ? '' : Number(v));
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white text-sm w-full"
                  >
                    <option value="">All ratings</option>
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={String(n)}>
                        {n} star{n === 1 ? '' : 's'} only
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1 min-w-[10rem]">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Reply status</label>
                  <select
                    value={filterReply}
                    onChange={(e) => setFilterReply(e.target.value as typeof filterReply)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white text-sm w-full"
                  >
                    <option value="all">All reviews</option>
                    <option value="unreplied">Needs reply</option>
                    <option value="replied">Replied</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {hasActiveFilters ? (
                  <>
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      Clear filters
                    </button>
                    <span className="text-sm text-gray-500">
                      Showing {filteredReviews.length} of {reviews.length}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-gray-500">Filter by product, stars, or reply status.</span>
                )}
              </div>
            </div>
          </div>

          {filteredReviews.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
              <p className="text-gray-800 font-medium">No reviews match these filters</p>
              <p className="text-sm text-gray-500 mt-1">Try another product, rating, or reply status.</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >
                Clear filters
              </button>
            </div>
          ) : null}

          {filteredReviews.map((r) => (
            <div
              key={r.id}
              id={`supplier-review-card-${r.id}`}
              className={`bg-white border rounded-xl p-4 sm:p-6 transition-shadow ${
                highlightReviewId === r.id
                  ? 'border-finland ring-2 ring-finland/25 shadow-md'
                  : reviewHasWrittenFeedback(r) && !replies[r.id]
                    ? 'border-amber-200 bg-amber-50/20'
                    : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-500 mb-1">
                    {r.listing_title ?? 'Listing'} · {new Date(r.created_at).toLocaleDateString()}
                  </p>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-gray-900">{r.guest_name}</span>
                    {r.verified && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Verified</span>
                    )}
                  </div>
                  <div className="flex gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        size={16}
                        className={i <= r.rating ? 'text-amber-500 fill-amber-500' : 'text-gray-300'}
                      />
                    ))}
                  </div>
                  {r.title && <p className="font-medium text-gray-900 mb-1">{r.title}</p>}
                  {reviewHasWrittenFeedback(r) ? (
                    (r.comment ?? '').trim() ? (
                      <p className="text-gray-700 whitespace-pre-wrap">{r.comment}</p>
                    ) : null
                  ) : (
                    <p className="text-sm text-gray-500 italic">No written review — rating only.</p>
                  )}
                </div>
              </div>

              {replies[r.id] ? (
                <div className="mt-4 pl-4 border-l-2 border-finland/30">
                  <p className="text-sm font-medium text-gray-700 mb-1">Your reply</p>
                  <p className="text-gray-600">{replies[r.id].reply_text}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(replies[r.id].created_at).toLocaleDateString()}
                  </p>
                </div>
              ) : !reviewHasWrittenFeedback(r) ? (
                <p className="mt-4 text-sm text-gray-500">
                  Replies are available when the guest leaves a title or written comment with their rating.
                </p>
              ) : (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <MessageSquare className="w-4 h-4 inline mr-1" />
                    Reply (optional)
                  </label>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {([
                      { id: 'friendly', label: 'Friendly' },
                      { id: 'professional', label: 'Professional' },
                      { id: 'short', label: 'Short' },
                    ] as const).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setDraftToneByReview((prev) => ({ ...prev, [r.id]: t.id }));
                          const draft = generateReplyDraft(r, t.id);
                          setReplyText((prev) => ({ ...prev, [r.id]: draft }));
                        }}
                        className={`px-2.5 py-1 rounded-full text-xs border ${
                          (draftToneByReview[r.id] ?? 'friendly') === t.id
                            ? 'bg-finland/10 text-finland border-finland/30'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {t.label} draft
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const tone = draftToneByReview[r.id] ?? 'friendly';
                        const draft = generateReplyDraft(r, tone);
                        setReplyText((prev) => ({ ...prev, [r.id]: draft }));
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                      Regenerate
                    </button>
                  </div>
                  <textarea
                    value={replyText[r.id] ?? ''}
                    onChange={(e) => setReplyText((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    placeholder="Thank the customer or answer a question..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland text-sm"
                  />
                  <button
                    type="button"
                    disabled={replyingId === r.id || !(replyText[r.id] ?? '').trim()}
                    onClick={() => handleSubmitReply(r.id)}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-finland text-white text-sm font-medium hover:bg-finland-dark disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {replyingId === r.id ? 'Sending…' : 'Send reply'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
