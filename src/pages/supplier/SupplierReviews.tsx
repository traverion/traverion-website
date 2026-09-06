/**
 * Supplier: view all reviews for my listings and reply.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Star, MessageSquare, Send, AlertCircle, RefreshCw } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import {
  SUPPLIER_PAGE_CLASS,
  SupplierEmptyState,
  SupplierListSkeleton,
  SupplierPageHero,
} from '../../components/supplier/supplierUi';
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

  const clearFilters = () => {
    setFilterListingId('');
    setFilterRating('');
    setFilterReply('all');
  };

  if (!user) return null;

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        title="Reviews"
        description="What guests said about your tours. Reply to written reviews."
      />

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
        <SupplierListSkeleton rows={3} />
      ) : reviews.length === 0 ? (
        <SupplierEmptyState
          title="No reviews yet"
          body="When guests rate a tour, their feedback appears here."
        />
      ) : (
        <div className="space-y-4 sm:space-y-5">
                <div className="flex flex-wrap items-end gap-x-4 gap-y-3 mb-6">
                <div className="flex flex-col gap-1 min-w-[min(100%,12rem)] flex-1 sm:flex-none sm:min-w-[11rem]">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Tour</label>
                  <select
                    value={filterListingId}
                    onChange={(e) => setFilterListingId(e.target.value)}
                    className="tv-input w-full"
                  >
                    <option value="">All tours</option>
                    {listingOptions.map(([id, title]) => (
                      <option key={id} value={id}>
                        {title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1 min-w-[8.5rem]">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Star rating</label>
                  <select
                    value={filterRating === '' ? '' : String(filterRating)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFilterRating(v === '' ? '' : Number(v));
                    }}
                    className="tv-input w-full"
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
                  <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Reply status</label>
                  <select
                    value={filterReply}
                    onChange={(e) => setFilterReply(e.target.value as typeof filterReply)}
                    className="tv-input w-full"
                  >
                    <option value="all">All reviews</option>
                    <option value="unreplied">Needs reply</option>
                    <option value="replied">Replied</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-8">
                {hasActiveFilters ? (
                  <>
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="tv-btn-ghost"
                    >
                      Clear filters
                    </button>
                    <span className="text-sm text-ink-muted">
                      Showing {filteredReviews.length} of {reviews.length}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-ink-muted">Filter by product, stars, or reply status.</span>
                )}
              </div>

          {filteredReviews.length === 0 ? (
            <div className="max-w-md py-8">
              <p className="font-display text-2xl text-ink">No reviews match</p>
              <p className="text-sm text-ink-muted mt-2">Try another listing, rating, or reply status.</p>
              <button
                type="button"
                onClick={clearFilters}
                className="tv-btn-ghost mt-4"
              >
                Clear filters
              </button>
            </div>
          ) : (
          <div className="divide-y divide-black/[0.06]">
          {filteredReviews.map((r) => (
            <article
              key={r.id}
              id={`supplier-review-card-${r.id}`}
              className={`py-5 ${
                highlightReviewId === r.id ? 'bg-paper-raised -mx-2 px-2 rounded-xl' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-muted mb-1">
                    {r.listing_title ?? 'Listing'} · {new Date(r.created_at).toLocaleDateString()}
                  </p>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-ink">{r.guest_name}</span>
                    {r.verified && (
                      <span className="text-xs text-finland font-medium">Verified</span>
                    )}
                    {reviewHasWrittenFeedback(r) && !replies[r.id] ? (
                      <span className="text-xs font-medium text-amber-800">Needs reply</span>
                    ) : null}
                  </div>
                  <div className="flex gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        size={16}
                        className={i <= r.rating ? 'text-amber-500 fill-amber-500' : 'text-ink-faint'}
                      />
                    ))}
                  </div>
                  {r.title && <p className="font-medium text-ink mb-1">{r.title}</p>}
                  {reviewHasWrittenFeedback(r) ? (
                    (r.comment ?? '').trim() ? (
                      <p className="text-ink-muted whitespace-pre-wrap">{r.comment}</p>
                    ) : null
                  ) : (
                    <p className="text-sm text-ink-muted italic">No written review — rating only.</p>
                  )}
                </div>
              </div>

              {replies[r.id] ? (
                <div className="mt-4 pl-4 border-l-2 border-finland/30">
                  <p className="text-sm font-medium text-ink mb-1">Your reply</p>
                  <p className="text-ink-muted">{replies[r.id].reply_text}</p>
                  <p className="text-xs text-ink-faint mt-1">
                    {new Date(replies[r.id].created_at).toLocaleDateString()}
                  </p>
                </div>
              ) : !reviewHasWrittenFeedback(r) ? (
                <p className="mt-4 text-sm text-ink-muted">
                  Replies are available when the guest leaves a title or written comment with their rating.
                </p>
              ) : (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-ink mb-1">
                    <MessageSquare className="w-4 h-4 inline mr-1" />
                    Reply
                  </label>
                  <textarea
                    value={replyText[r.id] ?? ''}
                    onChange={(e) => setReplyText((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    placeholder="Thank the customer or answer a question..."
                    rows={2}
                    className="tv-input"
                  />
                  <button
                    type="button"
                    disabled={replyingId === r.id || !(replyText[r.id] ?? '').trim()}
                    onClick={() => handleSubmitReply(r.id)}
                    className="tv-btn-primary mt-2 inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {replyingId === r.id ? 'Sending…' : 'Send reply'}
                  </button>
                </div>
              )}
            </article>
          ))}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
