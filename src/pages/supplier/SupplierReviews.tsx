/**
 * Supplier: view all reviews for my listings and reply.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Star, MessageSquare, Check } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import {
  SUPPLIER_PAGE_CLASS,
  SupplierEmptyState,
  SupplierListSkeleton,
  SupplierPageHero,
} from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import StatusChip from '../../components/StatusChip';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import {
  fetchReviewsForSupplierListings,
  getReviewRepliesByReviewIds,
  submitReviewReply,
  type ReviewDisplay,
  type ReviewReplyRow,
} from '../../data/supabase-reviews';
import type { InventoryFamily } from '../../lib/inventory';
import { openSupplierListingEditor } from '../../lib/supplierPortalNavigation';
import { reviewHasWrittenFeedback, reviewNeedsSupplierReply } from '../../lib/review-feedback';

function familyLabel(family: InventoryFamily | undefined): 'Stay' | 'Tour' {
  return family === 'stay' ? 'Stay' : 'Tour';
}

type SupplierReviewRow = ReviewDisplay & {
  listing_title?: string;
  listing_family?: InventoryFamily;
};

export default function SupplierReviews() {
  const { user, isSupabase } = useSupplierAuth();
  const [reviews, setReviews] = useState<SupplierReviewRow[]>([]);
  const [replies, setReplies] = useState<Record<string, ReviewReplyRow>>({});
  const [loading, setLoading] = useState(true);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [highlightReviewId, setHighlightReviewId] = useState<string | null>(null);
  const [filterListingId, setFilterListingId] = useState('');
  const [filterFamily, setFilterFamily] = useState<'all' | 'tour' | 'stay'>('all');
  const [filterRating, setFilterRating] = useState<number | ''>('');
  const [filterReply, setFilterReply] = useState<'all' | 'unreplied' | 'replied'>('all');
  const [editingReplyIds, setEditingReplyIds] = useState<Set<string>>(new Set());

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
      setError(userFacingError(e, USER_ERROR.reviews));
    } finally {
      setLoading(false);
    }
  }, [isSupabase, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const readFiltersFromUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('highlight');
    setHighlightReviewId(id && id.length > 0 ? id : null);
    const reply = params.get('reply');
    if (reply === 'unreplied' || reply === 'replied' || reply === 'all') {
      setFilterReply(reply);
    }
  }, []);

  useEffect(() => {
    readFiltersFromUrl();
    const onPop = () => readFiltersFromUrl();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [readFiltersFromUrl]);

  const syncReplyFilterToUrl = useCallback((next: 'all' | 'unreplied' | 'replied') => {
    setFilterReply(next);
    const url = new URL(window.location.href);
    if (next === 'all') url.searchParams.delete('reply');
    else url.searchParams.set('reply', next);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, []);

  const listingOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of reviews) {
      if (r.listing_id) m.set(r.listing_id, (r.listing_title ?? 'Listing').trim() || 'Listing');
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [reviews]);

  const unrepliedWrittenCount = useMemo(
    () => reviews.filter((r) => reviewNeedsSupplierReply(r, replies)).length,
    [reviews, replies]
  );

  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => {
      if (filterListingId && r.listing_id !== filterListingId) return false;
      if (filterFamily === 'stay' && r.listing_family !== 'stay') return false;
      if (filterFamily === 'tour' && r.listing_family === 'stay') return false;
      if (filterRating !== '' && Number(r.rating) !== filterRating) return false;
      if (filterReply === 'unreplied') {
        if (!reviewNeedsSupplierReply(r, replies)) return false;
      }
      if (filterReply === 'replied') {
        if (!replies[r.id]) return false;
      }
      return true;
    });
  }, [reviews, filterListingId, filterFamily, filterRating, filterReply, replies]);

  const hasActiveFilters =
    Boolean(filterListingId) || filterFamily !== 'all' || filterRating !== '' || filterReply !== 'all';

  useEffect(() => {
    if (!highlightReviewId || loading) return;
    const inFiltered = filteredReviews.some((r) => r.id === highlightReviewId);
    const inAll = reviews.some((r) => r.id === highlightReviewId);
    if (!inFiltered && inAll) {
      setFilterListingId('');
      setFilterFamily('all');
      setFilterRating('');
      syncReplyFilterToUrl('all');
      return;
    }
    const el = document.getElementById(`supplier-review-card-${highlightReviewId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightReviewId, loading, filteredReviews, reviews, syncReplyFilterToUrl]);

  const handleSubmitReply = async (reviewId: string) => {
    if (!user) return;
    const text = (replyText[reviewId] ?? '').trim();
    if (!text) return;
    setReplyingId(reviewId);
    setReplyError(null);
    const res = await submitReviewReply(reviewId, user.id, text);
    setReplyingId(null);
    if (res.success) {
      setEditingReplyIds((prev) => {
        if (!prev.has(reviewId)) return prev;
        const next = new Set(prev);
        next.delete(reviewId);
        return next;
      });
      load();
    } else {
      setReplyError(userFacingError(res.error, 'Could not save that reply. Try again.'));
    }
  };

  const startEditingReply = (reviewId: string) => {
    setEditingReplyIds((prev) => new Set(prev).add(reviewId));
  };

  const cancelEditingReply = (reviewId: string) => {
    setEditingReplyIds((prev) => {
      if (!prev.has(reviewId)) return prev;
      const next = new Set(prev);
      next.delete(reviewId);
      return next;
    });
    setReplyText((prev) => ({ ...prev, [reviewId]: replies[reviewId]?.reply_text ?? '' }));
  };

  const clearFilters = () => {
    setFilterListingId('');
    setFilterFamily('all');
    setFilterRating('');
    syncReplyFilterToUrl('all');
  };

  if (!user) return null;

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        badge="Operations"
        title="Reviews"
        description={
          unrepliedWrittenCount > 0
            ? `${unrepliedWrittenCount} written review${unrepliedWrittenCount === 1 ? '' : 's'} need a reply.`
            : 'What guests said about your tours and stays. Reply to written reviews.'
        }
      />

      {error && (
        <ErrorState
          className="py-6"
          title="Reviews unavailable"
          body={userFacingError(error, USER_ERROR.reviews)}
          retry={{ onClick: () => void load() }}
        />
      )}

      {replyError && (
        <ErrorState
          className="py-4"
          title="Reply not saved"
          body={userFacingError(replyError, 'Could not save that reply. Try again.')}
          back={{ onClick: () => setReplyError(null), label: 'Dismiss' }}
        />
      )}

      {loading ? (
        <SupplierListSkeleton rows={3} />
      ) : reviews.length === 0 ? (
        <SupplierEmptyState
          icon={Star}
          title="No reviews yet"
          body="Guests have not rated a tour or stay yet. That is normal for new products. Feedback appears here after a trip."
        />
      ) : (
        <div className="space-y-4 sm:space-y-5">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3 mb-6">
            <div className="flex flex-col gap-1 min-w-[min(100%,12rem)] flex-1 sm:flex-none sm:min-w-[11rem]">
              <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Listing</label>
              <select
                value={filterListingId}
                onChange={(e) => setFilterListingId(e.target.value)}
                className="tv-input w-full"
              >
                <option value="">All listings</option>
                {listingOptions.map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-[8.5rem]">
              <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Type</label>
              <select
                value={filterFamily}
                onChange={(e) => setFilterFamily(e.target.value as typeof filterFamily)}
                className="tv-input w-full"
              >
                <option value="all">Tour and stay</option>
                <option value="tour">Tours only</option>
                <option value="stay">Stays only</option>
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
                onChange={(e) => syncReplyFilterToUrl(e.target.value as typeof filterReply)}
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
                <button type="button" onClick={clearFilters} className="tv-btn-ghost">
                  Clear filters
                </button>
                <span className="text-sm text-ink-muted">
                  Showing {filteredReviews.length} of {reviews.length}
                </span>
              </>
            ) : (
              <span className="text-sm text-ink-muted">Filter by product, type, stars, or reply status.</span>
            )}
          </div>

          {filteredReviews.length === 0 ? (
            <SupplierEmptyState
              icon={Star}
              className="py-8"
              title="No reviews match"
              body="You have reviews, but none match this listing, type, rating, or reply filter. Clear filters to see all of them."
              action={
                <button type="button" onClick={clearFilters} className="tv-btn-primary">
                  Clear filters
                </button>
              }
            />
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {filteredReviews.map((r) => {
                const needsReply = reviewNeedsSupplierReply(r, replies);
                const isHighlighted = highlightReviewId === r.id;
                const kind = familyLabel(r.listing_family);
                return (
                  <article
                    key={r.id}
                    id={`supplier-review-card-${r.id}`}
                    className={`overflow-hidden rounded-2xl bg-paper-raised p-4 sm:p-5 shadow-soft ring-1 ring-black/[0.06] ${
                      needsReply
                        ? 'border-l-[3px] border-l-amber-500'
                        : replies[r.id]
                          ? 'border-l-[3px] border-l-emerald-500'
                          : r.verified
                            ? 'border-l-[3px] border-l-finland'
                            : 'border-l-[3px] border-l-black/10'
                    } ${isHighlighted ? 'ring-finland/30 shadow-soft-lg' : ''} ${
                      needsReply ? 'ring-amber-200/80' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink-muted mb-1">
                          <span className="font-medium text-ink-muted">{kind}</span>
                          {' · '}
                          {r.listing_title ?? 'Listing'} · {new Date(r.created_at).toLocaleDateString()}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="font-semibold text-ink">{r.guest_name}</span>
                          {r.verified ? <StatusChip tone="good">Verified</StatusChip> : null}
                          {needsReply ? <StatusChip tone="warn">Needs reply</StatusChip> : null}
                          {replies[r.id] ? <StatusChip tone="neutral">Replied</StatusChip> : null}
                        </div>
                        <div className="flex gap-1 mb-2" aria-label={`${r.rating} out of 5 stars`}>
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
                        {r.listing_id ? (
                          <button
                            type="button"
                            className="mt-2 text-xs font-semibold text-finland hover:underline"
                            onClick={() => openSupplierListingEditor(r.listing_id)}
                          >
                            Open listing
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {replies[r.id] && !editingReplyIds.has(r.id) ? (
                      <div className="mt-4 rounded-xl bg-finland/8 px-4 py-3 ring-1 ring-finland/15">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-ink mb-1">Your reply</p>
                          <button
                            type="button"
                            onClick={() => startEditingReply(r.id)}
                            className="text-xs font-semibold text-finland hover:underline shrink-0"
                          >
                            Edit reply
                          </button>
                        </div>
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
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            disabled={replyingId === r.id || !(replyText[r.id] ?? '').trim()}
                            onClick={() => handleSubmitReply(r.id)}
                            className="tv-btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {replyingId === r.id ? 'Saving…' : replies[r.id] ? 'Save changes' : 'Save reply'}
                          </button>
                          {replies[r.id] && editingReplyIds.has(r.id) ? (
                            <button
                              type="button"
                              disabled={replyingId === r.id}
                              onClick={() => cancelEditingReply(r.id)}
                              className="tv-btn-ghost disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
