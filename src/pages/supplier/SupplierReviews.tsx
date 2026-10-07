/**
 * Supplier: view all reviews for my listings and reply.
 */
import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { Star, MessageSquare, Check } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import {
  SUPPLIER_PAGE_CLASS,
  SupplierEmptyState,
  SupplierListSkeleton,
  SupplierPageHero,
} from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import StatusChip from '../../components/StatusChip';
import NoticeCallout from '../../components/NoticeCallout';
import PartnerSelect from '../../components/supplier/PartnerSelect';
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
import { PARTNER_APP_BASE, PARTNER_CREATE_PATH } from '../../lib/partnerPortalPaths';
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
  const { role } = useSupplierRole();
  // Phase 1749: finance/viewer read reviews; public replies need editor roles (RLS 1748).
  const canReply = canManageBookings(role);
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
  const loadGenRef = useRef(0);
  const reviewsHubUserIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setLoading(false);
      return;
    }
    const gen = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchReviewsForSupplierListings(uid);
      if (gen !== loadGenRef.current) return;
      try {
        const replyMap = await getReviewRepliesByReviewIds(list.map((r) => r.id));
        if (gen !== loadGenRef.current) return;
        // Phase 1475: commit reviews + replies together — reply failure must not refresh reviews with a stale reply map.
        setReviews(list);
        setReplies(replyMap);
        setReplyText(
          list.reduce<Record<string, string>>((acc, r) => {
            acc[r.id] = replyMap[r.id]?.reply_text ?? '';
            return acc;
          }, {})
        );
        setError(null);
      } catch (replyErr) {
        if (gen !== loadGenRef.current) return;
        setError(userFacingError(replyErr, USER_ERROR.reviews));
      }
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      // Keep prior reviews/replies — load failure ≠ empty Reviews.
      setError(userFacingError(e, USER_ERROR.reviews));
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [isSupabase, user?.id]);

  // Phase 1476 + layout: clear prior partner reviews before paint on account switch (Bookings 1384 parity).
  useLayoutEffect(() => {
    const clearReviewsPartnerWorkspace = () => {
      setReviews([]);
      setReplies({});
      setReplyText({});
      setReplyingId(null);
      setEditingReplyIds(new Set());
      setError(null);
      setReplyError(null);
    };
    if (!user?.id) {
      reviewsHubUserIdRef.current = null;
      loadGenRef.current += 1;
      clearReviewsPartnerWorkspace();
      setLoading(false);
      return;
    }
    if (reviewsHubUserIdRef.current !== user.id) {
      reviewsHubUserIdRef.current = user.id;
      loadGenRef.current += 1;
      clearReviewsPartnerWorkspace();
    }
  }, [user?.id]);

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
    // Phase 1749: role gate before RLS.
    if (!canReply) {
      setReplyError('Your role can view reviews but cannot publish replies.');
      return;
    }
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

      {!canReply ? (
        <NoticeCallout tone="info" className="mb-4">
          Your role can view reviews but cannot publish replies. Ask an owner, manager, or ops teammate.
        </NoticeCallout>
      ) : null}

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
            <div className="flex flex-wrap gap-2">
              {/* Phase 1684: Calendar/Offers dual-CTA parity when reviews are empty. */}
              <button
                type="button"
                className="tv-btn-primary"
                onClick={() => navigateSupplierUrl(PARTNER_CREATE_PATH)}
              >
                New listing
              </button>
              <button
                type="button"
                className="tv-btn-ghost"
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`)}
              >
                Your listings
              </button>
            </div>
          }
        />
      ) : (
        <div className="space-y-4 sm:space-y-5">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3 mb-6">
            <div className="flex flex-col gap-1 min-w-[min(100%,12rem)] flex-1 sm:flex-none sm:min-w-[11rem]">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint" id="reviews-filter-listing-label">
                Listing
              </span>
              <PartnerSelect
                aria-labelledby="reviews-filter-listing-label"
                value={filterListingId}
                onChange={(listingId) => writeFiltersToUrl({ listingId })}
                options={[
                  { value: '', label: 'All listings' },
                  ...listingOptions.map(([id, title]) => ({ value: id, label: title })),
                ]}
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[8.5rem]">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint" id="reviews-filter-type-label">
                Type
              </span>
              <PartnerSelect
                aria-labelledby="reviews-filter-type-label"
                value={filterFamily}
                onChange={(family) => writeFiltersToUrl({ family: family as typeof filterFamily })}
                options={[
                  { value: 'all', label: 'Tour and stay' },
                  { value: 'tour', label: 'Tours only' },
                  { value: 'stay', label: 'Stays only' },
                ]}
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[8.5rem]">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint" id="reviews-filter-rating-label">
                Star rating
              </span>
              <PartnerSelect
                aria-labelledby="reviews-filter-rating-label"
                value={filterRating === '' ? '' : String(filterRating)}
                onChange={(v) => writeFiltersToUrl({ rating: v === '' ? '' : Number(v) })}
                options={[
                  { value: '', label: 'All ratings' },
                  ...[5, 4, 3, 2, 1].map((n) => ({
                    value: String(n),
                    label: `${n} star${n === 1 ? '' : 's'} only`,
                  })),
                ]}
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[10rem]">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint" id="reviews-filter-reply-label">
                Reply status
              </span>
              <PartnerSelect
                aria-labelledby="reviews-filter-reply-label"
                value={filterReply}
                onChange={(v) => syncReplyFilterToUrl(v as typeof filterReply)}
                options={[
                  { value: 'all', label: 'All reviews' },
                  { value: 'unreplied', label: 'Needs reply' },
                  { value: 'replied', label: 'Replied' },
                ]}
              />
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
                    className={`tv-review-card p-3.5 sm:p-4 ${
                      needsReply
                        ? 'border-l-[3px] border-l-amber-500'
                        : replies[r.id]
                          ? 'border-l-[3px] border-l-emerald-500'
                          : r.verified
                            ? 'border-l-[3px] border-l-finland'
                            : 'border-l-[3px] border-l-black/10'
                    } ${isHighlighted ? 'ring-2 ring-finland/25 shadow-soft-lg' : ''} ${
                      needsReply ? 'ring-1 ring-amber-200/80' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="tv-review-card__meta mb-1.5">
                          {kind}
                          {' · '}
                          {formatCreatedAtDisplay(r.created_at)}
                        </p>
                        <h3 className="font-display text-[1.05rem] font-semibold tracking-tight text-ink leading-snug break-words [overflow-wrap:anywhere]">
                          {r.listing_title ?? 'Listing'}
                        </h3>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-ink">{r.guest_name}</span>
                          {r.verified ? <StatusChip tone="good">Verified</StatusChip> : null}
                          {needsReply ? <StatusChip tone="warn">Needs reply</StatusChip> : null}
                          {replies[r.id] ? <StatusChip tone="neutral">Replied</StatusChip> : null}
                        </div>
                        <div className="mt-2.5 flex items-center gap-1" aria-label={`${r.rating} out of 5 stars`}>
                          {[1, 2, 3, 4, 5].map((i) => (
                            <Star
                              key={i}
                              size={18}
                              className={i <= r.rating ? 'text-amber-500 fill-amber-500' : 'text-ink-faint'}
                            />
                          ))}
                          <span className="ml-1.5 text-sm font-semibold tabular-nums text-ink">{r.rating}/5</span>
                        </div>
                        {(r.title || reviewHasWrittenFeedback(r)) && (
                          <div className="mt-3 rounded-lg bg-black/[0.025] px-3 py-2.5 ring-1 ring-black/[0.04]">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint mb-1.5">
                              Guest review
                            </p>
                            {r.title ? (
                              <p className="font-semibold text-ink mb-1 break-words [overflow-wrap:anywhere]">
                                {r.title}
                              </p>
                            ) : null}
                            {reviewHasWrittenFeedback(r) ? (
                              (r.comment ?? '').trim() ? (
                                <p className="text-sm text-ink-muted leading-relaxed break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                                  {r.comment}
                                </p>
                              ) : null
                            ) : (
                              <p className="text-sm text-ink-muted italic">No written review — rating only.</p>
                            )}
                          </div>
                        )}
                        {!r.title && !reviewHasWrittenFeedback(r) ? (
                          <p className="mt-2.5 text-sm text-ink-muted italic">No written review — rating only.</p>
                        ) : null}
                        {r.listing_id ? (
                          <button
                            type="button"
                            className="mt-2.5 text-xs font-semibold text-finland hover:underline"
                            onClick={() => openSupplierListingEditor(r.listing_id)}
                          >
                            Open listing
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {replies[r.id] && !editingReplyIds.has(r.id) ? (
                      <div className="tv-review-card__reply">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-finland">
                            Your response
                          </p>
                          {canReply ? (
                            <button
                              type="button"
                              onClick={() => startEditingReply(r.id)}
                              className="text-xs font-semibold text-finland hover:underline shrink-0"
                            >
                              Edit reply
                            </button>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-sm text-ink leading-snug break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                          {replies[r.id].reply_text}
                        </p>
                        <p className="text-[11px] text-ink-faint mt-1.5">
                          {formatCreatedAtDisplay(replies[r.id].created_at)}
                        </p>
                      </div>
                    ) : !reviewHasWrittenFeedback(r) ? (
                      <p className="mt-3 text-xs text-ink-muted">
                        Replies are available when the guest leaves a title or written comment with their rating.
                      </p>
                    ) : (
                      <div className="mt-3">
                        <label htmlFor={`review-reply-${r.id}`} className="block text-xs font-medium text-ink mb-1">
                          <MessageSquare className="w-3.5 h-3.5 inline mr-1" aria-hidden />
                          Reply
                        </label>
                        <textarea
                          id={`review-reply-${r.id}`}
                          value={replyText[r.id] ?? ''}
                          onChange={(e) =>
                            setReplyText((prev) => ({
                              ...prev,
                              [r.id]: e.target.value.slice(0, 2000),
                            }))
                          }
                          placeholder="Thank the customer or answer a question…"
                          rows={2}
                          maxLength={2000}
                          disabled={!canReply}
                          className="tv-input text-sm disabled:opacity-50"
                          aria-describedby={`review-reply-hint-${r.id}`}
                        />
                        {/* Phase 1697: live length honesty on supplier review replies. */}
                        <p id={`review-reply-hint-${r.id}`} className="mt-1.5 text-xs text-ink-faint">
                          Up to 2000 characters
                          {(replyText[r.id] ?? '').length > 0
                            ? ` · ${(replyText[r.id] ?? '').length} used`
                            : ''}
                          .
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            disabled={!canReply || replyingId === r.id || !(replyText[r.id] ?? '').trim()}
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
