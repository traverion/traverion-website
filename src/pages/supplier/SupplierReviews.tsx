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
import { openSupplierListingEditor, navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { reviewHasWrittenFeedback, reviewNeedsSupplierReply } from '../../lib/review-feedback';

function familyLabel(family: InventoryFamily | undefined): 'Stay' | 'Tour' {
  return family === 'stay' ? 'Stay' : 'Tour';
}

/** Same locale shape as admin booking created_at chips. */
function formatCreatedAtDisplay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
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
    } else if (reply == null) {
      setFilterReply('all');
    }
    const listing = (params.get('listing') ?? '').trim();
    setFilterListingId(listing);
    const family = params.get('family');
    setFilterFamily(family === 'tour' || family === 'stay' ? family : 'all');
    const ratingRaw = params.get('rating');
    const ratingNum = ratingRaw ? Number(ratingRaw) : NaN;
    setFilterRating(
      ratingNum === 1 || ratingNum === 2 || ratingNum === 3 || ratingNum === 4 || ratingNum === 5 ? ratingNum : ''
    );
  }, []);

  useEffect(() => {
    readFiltersFromUrl();
    const onPop = () => readFiltersFromUrl();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [readFiltersFromUrl]);

  const writeFiltersToUrl = useCallback(
    (next: {
      listingId?: string;
      family?: 'all' | 'tour' | 'stay';
      rating?: number | '';
      reply?: 'all' | 'unreplied' | 'replied';
    }) => {
      const listingId = next.listingId !== undefined ? next.listingId : filterListingId;
      const family = next.family !== undefined ? next.family : filterFamily;
      const rating = next.rating !== undefined ? next.rating : filterRating;
      const reply = next.reply !== undefined ? next.reply : filterReply;
      if (next.listingId !== undefined) setFilterListingId(next.listingId);
      if (next.family !== undefined) setFilterFamily(next.family);
      if (next.rating !== undefined) setFilterRating(next.rating);
      if (next.reply !== undefined) setFilterReply(next.reply);
      const url = new URL(window.location.href);
      if (!listingId) url.searchParams.delete('listing');
      else url.searchParams.set('listing', listingId);
      if (family === 'all') url.searchParams.delete('family');
      else url.searchParams.set('family', family);
      if (rating === '') url.searchParams.delete('rating');
      else url.searchParams.set('rating', String(rating));
      if (reply === 'all') url.searchParams.delete('reply');
      else url.searchParams.set('reply', reply);
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    },
    [filterListingId, filterFamily, filterRating, filterReply]
  );

  const syncReplyFilterToUrl = useCallback(
    (next: 'all' | 'unreplied' | 'replied') => {
      writeFiltersToUrl({ reply: next });
    },
    [writeFiltersToUrl]
  );

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
      writeFiltersToUrl({ listingId: '', family: 'all', rating: '', reply: 'all' });
      return;
    }
    const el = document.getElementById(`supplier-review-card-${highlightReviewId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightReviewId, loading, filteredReviews, reviews, writeFiltersToUrl]);

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
    writeFiltersToUrl({ listingId: '', family: 'all', rating: '', reply: 'all' });
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
        actions={
          unrepliedWrittenCount > 0 ? (
            <button
              type="button"
              onClick={() => writeFiltersToUrl({ reply: 'unreplied' })}
              className="tv-btn-secondary text-sm"
            >
              Needs reply · {unrepliedWrittenCount}
            </button>
          ) : undefined
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
      ) : error ? null : reviews.length === 0 ? (
        <SupplierEmptyState
          icon={Star}
          title="No reviews yet"
          body="Guests have not rated a tour or stay yet. That is normal for new products. Feedback appears here after a trip."
          action={
            <button
              type="button"
              className="tv-btn-secondary"
              onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`)}
            >
              Open listings
            </button>
          }
        />
      ) : (
        <div className="space-y-4 sm:space-y-5">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3 mb-6">
            <div className="flex flex-col gap-1 min-w-[min(100%,12rem)] flex-1 sm:flex-none sm:min-w-[11rem]">
              <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Listing</label>
              <select
                value={filterListingId}
                onChange={(e) => writeFiltersToUrl({ listingId: e.target.value })}
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
                onChange={(e) => writeFiltersToUrl({ family: e.target.value as typeof filterFamily })}
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
                  writeFiltersToUrl({ rating: v === '' ? '' : Number(v) });
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
          <div className="flex flex-wrap items-center gap-2 mb-4">
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
              body={
                filterFamily === 'stay'
                  ? 'No stay reviews match these filters. Clear filters or switch to Tours.'
                  : filterFamily === 'tour'
                    ? 'No tour reviews match these filters. Clear filters or switch to Stays.'
                    : 'You have reviews, but none match this listing, type, rating, or reply filter. Clear filters to see all of them.'
              }
              action={
                <button type="button" onClick={clearFilters} className="tv-btn-primary">
                  Clear filters
                </button>
              }
            />
          ) : (
            <div className="space-y-2.5 sm:space-y-3">
              {filteredReviews.map((r) => {
                const needsReply = reviewNeedsSupplierReply(r, replies);
                const isHighlighted = highlightReviewId === r.id;
                const kind = familyLabel(r.listing_family);
                return (
                  <article
                    key={r.id}
                    id={`supplier-review-card-${r.id}`}
                    className={`overflow-hidden rounded-xl bg-paper-raised p-3.5 sm:p-4 shadow-soft ring-1 ring-black/[0.06] ${
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
                          {r.listing_title ?? 'Listing'} · {formatCreatedAtDisplay(r.created_at)}
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
                        {r.title && (
                          <p className="font-medium text-ink mb-1 break-words [overflow-wrap:anywhere]">{r.title}</p>
                        )}
                        {reviewHasWrittenFeedback(r) ? (
                          (r.comment ?? '').trim() ? (
                            <p className="text-ink-muted break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{r.comment}</p>
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
                      <div className="mt-3 rounded-lg border border-finland/15 border-l-[3px] border-l-finland bg-finland/[0.04] px-3 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-xs font-semibold text-ink">Your reply</p>
                          <button
                            type="button"
                            onClick={() => startEditingReply(r.id)}
                            className="text-xs font-semibold text-finland hover:underline shrink-0"
                          >
                            Edit reply
                          </button>
                        </div>
                        <p className="mt-0.5 text-sm text-ink-muted leading-snug break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{replies[r.id].reply_text}</p>
                        <p className="text-[11px] text-ink-faint mt-1">
                          {formatCreatedAtDisplay(replies[r.id].created_at)}
                        </p>
                      </div>
                    ) : !reviewHasWrittenFeedback(r) ? (
                      <p className="mt-3 text-xs text-ink-muted">
                        Replies are available when the guest leaves a title or written comment with their rating.
                      </p>
                    ) : (
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-ink mb-1">
                          <MessageSquare className="w-3.5 h-3.5 inline mr-1" />
                          Reply
                        </label>
                        <textarea
                          value={replyText[r.id] ?? ''}
                          onChange={(e) => setReplyText((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          placeholder="Thank the customer or answer a question..."
                          rows={2}
                          className="tv-input text-sm"
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
