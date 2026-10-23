/**
 * Supplier: view all reviews for my listings and reply.
 */
import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { Star, MessageSquare, Check, Search } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import { SUPPLIER_PAGE_CLASS, SupplierListSkeleton } from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import NoticeCallout from '../../components/NoticeCallout';
import PartnerSelect from '../../components/supplier/PartnerSelect';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import {
  aggregateReviewRatings,
  fetchReviewsForSupplierListings,
  getReviewRepliesByReviewIds,
  submitReviewReply,
  type ReviewDisplay,
  type ReviewReplyRow,
} from '../../data/supabase-reviews';
import { fetchMyListings } from '../../data/supabase-listings';
import type { InventoryFamily } from '../../lib/inventory';
import { inventoryFamilyFromListing } from '../../lib/inventory';
import { openSupplierListingEditor } from '../../lib/supplierPortalNavigation';
import { reviewHasWrittenFeedback, reviewNeedsSupplierReply } from '../../lib/review-feedback';

function familyLabel(family: InventoryFamily | undefined): 'Stay' | 'Tour' {
  return family === 'stay' ? 'Stay' : 'Tour';
}

function formatCreatedAtDisplay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

type SupplierReviewRow = ReviewDisplay & {
  listing_title?: string;
  listing_family?: InventoryFamily;
};

type SortKey = 'newest' | 'oldest' | 'highest' | 'lowest';

const PAGE_SIZE = 20;
const COMMENT_PREVIEW = 280;

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={i <= rating ? 'fill-amber-500 text-amber-500' : 'text-[#d4d4d8]'}
          aria-hidden
        />
      ))}
    </span>
  );
}

export default function SupplierReviews() {
  const { user, isSupabase } = useSupplierAuth();
  const { role } = useSupplierRole();
  // Phase 1749: finance/viewer read reviews; public replies need editor roles (RLS 1748).
  const canReply = canManageBookings(role);
  const [reviews, setReviews] = useState<SupplierReviewRow[]>([]);
  const [listings, setListings] = useState<{ id: string; title: string; family: InventoryFamily }[]>([]);
  const [replies, setReplies] = useState<Record<string, ReviewReplyRow>>({});
  const [loading, setLoading] = useState(true);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replySuccessId, setReplySuccessId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [highlightReviewId, setHighlightReviewId] = useState<string | null>(null);
  const [filterListingId, setFilterListingId] = useState('');
  const [filterRating, setFilterRating] = useState<number | ''>('');
  const [filterReply, setFilterReply] = useState<'all' | 'unreplied' | 'replied'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingReplyIds, setEditingReplyIds] = useState<Set<string>>(new Set());
  const loadGenRef = useRef(0);
  const reviewsHubUserIdRef = useRef<string | null>(null);
  const submitLockRef = useRef<Set<string>>(new Set());

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
      const [list, myListings] = await Promise.all([
        fetchReviewsForSupplierListings(uid),
        fetchMyListings(uid).catch(() => [] as Awaited<ReturnType<typeof fetchMyListings>>),
      ]);
      if (gen !== loadGenRef.current) return;
      try {
        const replyMap = await getReviewRepliesByReviewIds(list.map((r) => r.id));
        if (gen !== loadGenRef.current) return;
        // Phase 1475: commit reviews + replies together — reply failure must not refresh reviews with a stale reply map.
        setReviews(list);
        setListings(
          myListings.map((l) => ({
            id: l.id,
            title: (l.title ?? '').trim() || 'Untitled listing',
            family: inventoryFamilyFromListing(l) === 'stay' ? 'stay' : 'tour',
          }))
        );
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
      setListings([]);
      setReplies({});
      setReplyText({});
      setReplyingId(null);
      setEditingReplyIds(new Set());
      setError(null);
      setReplyError(null);
      setReplySuccessId(null);
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
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchQuery(searchInput.trim().toLowerCase()), 220);
    return () => window.clearTimeout(t);
  }, [searchInput]);

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
    const ratingRaw = params.get('rating');
    const ratingNum = ratingRaw ? Number(ratingRaw) : NaN;
    setFilterRating(
      ratingNum === 1 || ratingNum === 2 || ratingNum === 3 || ratingNum === 4 || ratingNum === 5 ? ratingNum : ''
    );
    const sort = params.get('sort');
    if (sort === 'oldest' || sort === 'highest' || sort === 'lowest' || sort === 'newest') {
      setSortKey(sort);
    }
    const q = (params.get('q') ?? '').trim();
    setSearchInput(q);
    setSearchQuery(q.toLowerCase());
    const pageRaw = Number(params.get('page') ?? '1');
    setPage(Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) - 1 : 0);
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
      rating?: number | '';
      reply?: 'all' | 'unreplied' | 'replied';
      sort?: SortKey;
      q?: string;
      pageIndex?: number;
    }) => {
      const listingId = next.listingId !== undefined ? next.listingId : filterListingId;
      const rating = next.rating !== undefined ? next.rating : filterRating;
      const reply = next.reply !== undefined ? next.reply : filterReply;
      const sort = next.sort !== undefined ? next.sort : sortKey;
      const q = next.q !== undefined ? next.q : searchInput;
      const pageIndex = next.pageIndex !== undefined ? next.pageIndex : page;
      if (next.listingId !== undefined) setFilterListingId(next.listingId);
      if (next.rating !== undefined) setFilterRating(next.rating);
      if (next.reply !== undefined) setFilterReply(next.reply);
      if (next.sort !== undefined) setSortKey(next.sort);
      if (next.q !== undefined) setSearchInput(next.q);
      if (next.pageIndex !== undefined) setPage(next.pageIndex);
      const url = new URL(window.location.href);
      if (!listingId) url.searchParams.delete('listing');
      else url.searchParams.set('listing', listingId);
      url.searchParams.delete('family');
      if (rating === '') url.searchParams.delete('rating');
      else url.searchParams.set('rating', String(rating));
      if (reply === 'all') url.searchParams.delete('reply');
      else url.searchParams.set('reply', reply);
      if (sort === 'newest') url.searchParams.delete('sort');
      else url.searchParams.set('sort', sort);
      const trimmedQ = q.trim();
      if (!trimmedQ) url.searchParams.delete('q');
      else url.searchParams.set('q', trimmedQ);
      if (pageIndex <= 0) url.searchParams.delete('page');
      else url.searchParams.set('page', String(pageIndex + 1));
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    },
    [filterListingId, filterRating, filterReply, sortKey, searchInput, page]
  );

  const listingOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of listings) m.set(l.id, l.title);
    for (const r of reviews) {
      if (r.listing_id && !m.has(r.listing_id)) {
        m.set(r.listing_id, (r.listing_title ?? 'Listing').trim() || 'Listing');
      }
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [listings, reviews]);

  const summary = useMemo(() => {
    const { avg, count } = aggregateReviewRatings(reviews.map((r) => r.rating));
    const written = reviews.filter(reviewHasWrittenFeedback);
    const awaiting = written.filter((r) => reviewNeedsSupplierReply(r, replies)).length;
    const replied = written.filter((r) => Boolean(replies[r.id])).length;
    const responseRate = written.length > 0 ? Math.round((replied / written.length) * 100) : null;
    const dist = [0, 0, 0, 0, 0];
    for (const r of reviews) {
      const star = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 0)));
      dist[star - 1] += 1;
    }
    return { avg, count, awaiting, responseRate, dist, writtenCount: written.length };
  }, [reviews, replies]);

  const filteredReviews = useMemo(() => {
    const list = reviews.filter((r) => {
      if (filterListingId && r.listing_id !== filterListingId) return false;
      if (filterRating !== '' && Number(r.rating) !== filterRating) return false;
      if (filterReply === 'unreplied' && !reviewNeedsSupplierReply(r, replies)) return false;
      if (filterReply === 'replied' && !replies[r.id]) return false;
      if (searchQuery) {
        const hay = `${r.guest_name} ${r.listing_title ?? ''} ${r.title ?? ''} ${r.comment ?? ''}`.toLowerCase();
        if (!hay.includes(searchQuery)) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      if (sortKey === 'oldest') return a.created_at.localeCompare(b.created_at);
      if (sortKey === 'highest') return Number(b.rating) - Number(a.rating) || b.created_at.localeCompare(a.created_at);
      if (sortKey === 'lowest') return Number(a.rating) - Number(b.rating) || b.created_at.localeCompare(a.created_at);
      return b.created_at.localeCompare(a.created_at);
    });
    return list;
  }, [reviews, filterListingId, filterRating, filterReply, replies, searchQuery, sortKey]);

  const pageCount = Math.max(1, Math.ceil(filteredReviews.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filteredReviews.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    if (page !== safePage) {
      setPage(safePage);
      writeFiltersToUrl({ pageIndex: safePage });
    }
  }, [page, safePage, writeFiltersToUrl]);

  const hasActiveFilters =
    Boolean(filterListingId) ||
    filterRating !== '' ||
    filterReply !== 'all' ||
    Boolean(searchQuery) ||
    sortKey !== 'newest';

  useEffect(() => {
    if (!highlightReviewId || loading) return;
    const inFiltered = filteredReviews.some((r) => r.id === highlightReviewId);
    const inAll = reviews.some((r) => r.id === highlightReviewId);
    if (!inFiltered && inAll) {
      writeFiltersToUrl({ listingId: '', rating: '', reply: 'all', q: '', pageIndex: 0 });
      return;
    }
    const el = document.getElementById(`supplier-review-card-${highlightReviewId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightReviewId, loading, filteredReviews, reviews, writeFiltersToUrl]);

  const handleSubmitReply = async (reviewId: string) => {
    if (!user) return;
    if (!canReply) {
      setReplyError('Your role can view reviews but cannot publish replies.');
      return;
    }
    const text = (replyText[reviewId] ?? '').trim();
    if (!text) return;
    if (submitLockRef.current.has(reviewId) || replyingId === reviewId) return;
    submitLockRef.current.add(reviewId);
    setReplyingId(reviewId);
    setReplyError(null);
    setReplySuccessId(null);
    const res = await submitReviewReply(reviewId, user.id, text);
    setReplyingId(null);
    submitLockRef.current.delete(reviewId);
    if (res.success) {
      setEditingReplyIds((prev) => {
        if (!prev.has(reviewId)) return prev;
        const next = new Set(prev);
        next.delete(reviewId);
        return next;
      });
      setReplySuccessId(reviewId);
      await load();
    } else {
      setReplyError(userFacingError(res.error, 'Could not save that reply. Try again.'));
    }
  };

  const startEditingReply = (reviewId: string) => {
    setEditingReplyIds((prev) => new Set(prev).add(reviewId));
    setReplySuccessId(null);
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
    setSearchInput('');
    setSearchQuery('');
    writeFiltersToUrl({ listingId: '', rating: '', reply: 'all', sort: 'newest', q: '', pageIndex: 0 });
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!user) return null;

  const filtersToolbar = (
    <div className="tv-reviews-filters" data-testid="reviews-filters-toolbar">
      <div className="tv-reviews-field tv-reviews-field--search">
        <span id="reviews-filter-search-label">Search</span>
        <span className="tv-reviews-search">
          <Search className="h-4 w-4 shrink-0 text-[#a1a1aa]" aria-hidden />
          <input
            type="search"
            className="tv-reviews-search__input"
            placeholder="Review text, listing, or guest"
            value={searchInput}
            aria-labelledby="reviews-filter-search-label"
            onChange={(e) => {
              setSearchInput(e.target.value);
              writeFiltersToUrl({ q: e.target.value, pageIndex: 0 });
            }}
          />
          {searchInput ? (
            <button
              type="button"
              className="text-[12px] font-semibold text-[#073b83]"
              onClick={() => {
                setSearchInput('');
                setSearchQuery('');
                writeFiltersToUrl({ q: '', pageIndex: 0 });
              }}
            >
              Clear
            </button>
          ) : null}
        </span>
      </div>
      <div className="tv-reviews-field">
        <span id="reviews-filter-listing-label">Listing</span>
        <PartnerSelect
          aria-labelledby="reviews-filter-listing-label"
          value={filterListingId}
          searchable="auto"
          options={[
            { value: '', label: 'All listings' },
            ...listingOptions.map(([id, title]) => ({ value: id, label: title })),
          ]}
          onChange={(listingId) => writeFiltersToUrl({ listingId, pageIndex: 0 })}
        />
      </div>
      <div className="tv-reviews-field">
        <span id="reviews-filter-rating-label">Rating</span>
        <PartnerSelect
          aria-labelledby="reviews-filter-rating-label"
          value={filterRating === '' ? '' : String(filterRating)}
          options={[
            { value: '', label: 'All ratings' },
            ...[5, 4, 3, 2, 1].map((n) => ({
              value: String(n),
              label: `${n} star${n === 1 ? '' : 's'}`,
            })),
          ]}
          onChange={(v) => writeFiltersToUrl({ rating: v === '' ? '' : Number(v), pageIndex: 0 })}
        />
      </div>
      <div className="tv-reviews-field">
        <span id="reviews-filter-reply-label">Reply status</span>
        <PartnerSelect
          aria-labelledby="reviews-filter-reply-label"
          value={filterReply}
          options={[
            { value: 'all', label: 'All reviews' },
            { value: 'unreplied', label: 'Awaiting reply' },
            { value: 'replied', label: 'Replied' },
          ]}
          onChange={(v) => writeFiltersToUrl({ reply: v as typeof filterReply, pageIndex: 0 })}
        />
      </div>
      <div className="tv-reviews-field">
        <span id="reviews-filter-sort-label">Sort</span>
        <PartnerSelect
          aria-labelledby="reviews-filter-sort-label"
          value={sortKey}
          options={[
            { value: 'newest', label: 'Newest first' },
            { value: 'oldest', label: 'Oldest first' },
            { value: 'highest', label: 'Highest rated' },
            { value: 'lowest', label: 'Lowest rated' },
          ]}
          onChange={(v) => writeFiltersToUrl({ sort: v as SortKey, pageIndex: 0 })}
        />
      </div>
    </div>
  );

  return (
    <div className={`${SUPPLIER_PAGE_CLASS} tv-reviews`}>
      <div className="min-w-0">
        {/* Use non-h1 so global Fraunces heading rules cannot win. */}
        <p className="tv-reviews-title" role="heading" aria-level={1}>
          Reviews
        </p>
      </div>

      {!canReply ? (
        <NoticeCallout tone="info">
          Your role can view reviews but cannot publish replies. Ask an owner, manager, or ops teammate.
        </NoticeCallout>
      ) : null}

      {error ? (
        <ErrorState
          className="py-6"
          title="Reviews unavailable"
          body={userFacingError(error, USER_ERROR.reviews)}
          retry={{ onClick: () => void load() }}
        />
      ) : null}

      {replyError ? (
        <ErrorState
          className="py-4"
          title="Reply not saved"
          body={userFacingError(replyError, 'Could not save that reply. Try again.')}
          back={{ onClick: () => setReplyError(null), label: 'Dismiss' }}
        />
      ) : null}

      {/* Toolbar is outside loading / empty conditionals so it always renders. */}
      <div className="mx-auto w-full max-w-[1180px] space-y-3">
        {filtersToolbar}

        {loading ? (
          <SupplierListSkeleton rows={3} />
        ) : error ? null : reviews.length === 0 ? (
          <div className="tv-reviews-empty" data-testid="reviews-empty-zero">
            <div className="tv-reviews-empty__icon">
              <Star className="h-5 w-5" aria-hidden />
            </div>
            <p className="tv-reviews-empty__title" role="heading" aria-level={2}>
              No reviews yet
            </p>
            <p className="mt-1 max-w-md text-[13px] leading-relaxed text-[#71717a]">
              Your guest reviews will appear here once customers start sharing their experiences.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <div className="tv-reviews-metric">
                <p className="tv-reviews-metric__label">Average rating</p>
                <p className="tv-reviews-metric__value">
                  {summary.count > 0 ? `${summary.avg.toFixed(1)}` : '—'}
                  <span className="tv-reviews-metric__suffix"> / 5</span>
                </p>
              </div>
              <div className="tv-reviews-metric">
                <p className="tv-reviews-metric__label">Total reviews</p>
                <p className="tv-reviews-metric__value">{summary.count}</p>
              </div>
              <div className="tv-reviews-metric">
                <p className="tv-reviews-metric__label">Awaiting reply</p>
                <p className="tv-reviews-metric__value">{summary.awaiting}</p>
              </div>
              <div className="tv-reviews-metric">
                <p className="tv-reviews-metric__label">Response rate</p>
                <p className="tv-reviews-metric__value">
                  {summary.responseRate == null ? '—' : `${summary.responseRate}%`}
                </p>
              </div>
            </div>

            {summary.count >= 3 ? (
              <div className="tv-reviews-panel">
                <p className="tv-reviews-panel__title" role="heading" aria-level={2}>
                  Rating distribution
                </p>
                <ul className="tv-reviews-dist mt-2">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = summary.dist[star - 1];
                    const width = summary.count > 0 ? (count / summary.count) * 100 : 0;
                    return (
                      <li key={star}>
                        <span className="tv-reviews-dist__label">{star}★</span>
                        <div className="tv-reviews-dist__track" aria-hidden>
                          <div className="tv-reviews-dist__fill" style={{ width: `${width}%` }} />
                        </div>
                        <span className="tv-reviews-dist__count tabular-nums">{count}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#71717a]">
              <span>
                Showing {pageRows.length === 0 ? 0 : safePage * PAGE_SIZE + 1}–
                {Math.min((safePage + 1) * PAGE_SIZE, filteredReviews.length)} of {filteredReviews.length}
              </span>
              {hasActiveFilters ? (
                <button type="button" className="font-semibold text-[#073b83]" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null}
              {summary.awaiting > 0 && filterReply !== 'unreplied' ? (
                <button
                  type="button"
                  className="font-semibold text-[#073b83]"
                  onClick={() => writeFiltersToUrl({ reply: 'unreplied', pageIndex: 0 })}
                >
                  Awaiting reply · {summary.awaiting}
                </button>
              ) : null}
            </div>

            {filteredReviews.length === 0 ? (
              <div className="tv-reviews-empty">
                <div className="tv-reviews-empty__icon">
                  <Star className="h-5 w-5" aria-hidden />
                </div>
                <p className="tv-reviews-empty__title" role="heading" aria-level={2}>
                  No matching reviews
                </p>
                <p className="mt-1 max-w-sm text-[13px] text-[#71717a]">Try adjusting your search or filters.</p>
                <button type="button" className="tv-btn-secondary mt-3 h-9 px-3 text-[13px]" onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            ) : (
              <>
              <ul className="space-y-2.5">
                {pageRows.map((r) => {
                  const needsReply = reviewNeedsSupplierReply(r, replies);
                  const isHighlighted = highlightReviewId === r.id;
                  const kind = familyLabel(r.listing_family);
                  const comment = (r.comment ?? '').trim();
                  const expanded = expandedIds.has(r.id);
                  const long = comment.length > COMMENT_PREVIEW;
                  const shownComment =
                    !long || expanded ? comment : `${comment.slice(0, COMMENT_PREVIEW).trimEnd()}…`;
                  return (
                    <li key={r.id}>
                      <article
                        id={`supplier-review-card-${r.id}`}
                        className={`tv-reviews-card ${isHighlighted ? 'tv-reviews-card--highlight' : ''} ${
                          needsReply ? 'tv-reviews-card--needs-reply' : ''
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="tv-reviews-card__meta">
                              {r.guest_name || 'Guest'}
                              {' · '}
                              {formatCreatedAtDisplay(r.created_at)}
                              {' · '}
                              {kind}
                            </p>
                            <p className="mt-0.5 text-[13px] font-semibold text-[#18181b]" title={r.listing_title}>
                              {r.listing_title ?? 'Listing'}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <StarRow rating={Number(r.rating) || 0} />
                            <span className="text-[12px] font-semibold tabular-nums text-[#18181b]">
                              {r.rating}/5
                            </span>
                            {needsReply ? <span className="tv-reviews-chip tv-reviews-chip--warn">Awaiting reply</span> : null}
                            {replies[r.id] ? <span className="tv-reviews-chip tv-reviews-chip--ok">Replied</span> : null}
                            {r.verified ? <span className="tv-reviews-chip">Verified</span> : null}
                          </div>
                        </div>

                        {r.title || reviewHasWrittenFeedback(r) ? (
                          <div className="mt-2.5">
                            {r.title ? (
                              <p className="text-[13px] font-semibold text-[#18181b] break-words">{r.title}</p>
                            ) : null}
                            {comment ? (
                              <>
                                <p className="mt-1 text-[13px] leading-relaxed text-[#3f3f46] whitespace-pre-wrap break-words">
                                  {shownComment}
                                </p>
                                {long ? (
                                  <button
                                    type="button"
                                    className="mt-1 text-[12px] font-semibold text-[#073b83]"
                                    onClick={() => toggleExpanded(r.id)}
                                  >
                                    {expanded ? 'Show less' : 'Read more'}
                                  </button>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-2 text-[12px] italic text-[#71717a]">Rating only — no written feedback.</p>
                        )}

                        {r.listing_id ? (
                          <button
                            type="button"
                            className="mt-2 text-[12px] font-semibold text-[#073b83]"
                            onClick={() => openSupplierListingEditor(r.listing_id)}
                          >
                            Open listing
                          </button>
                        ) : null}

                        {replies[r.id] && !editingReplyIds.has(r.id) ? (
                          <div className="tv-reviews-reply">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#073b83]">
                                Your response
                              </p>
                              {canReply ? (
                                <button
                                  type="button"
                                  onClick={() => startEditingReply(r.id)}
                                  className="text-[12px] font-semibold text-[#073b83]"
                                >
                                  Edit reply
                                </button>
                              ) : null}
                            </div>
                            <p className="mt-1.5 text-[13px] leading-snug text-[#18181b] whitespace-pre-wrap break-words">
                              {replies[r.id].reply_text}
                            </p>
                            <p className="mt-1 text-[11px] text-[#a1a1aa]">
                              {formatCreatedAtDisplay(replies[r.id].created_at)}
                            </p>
                            {replySuccessId === r.id ? (
                              <p className="mt-1 text-[12px] font-semibold text-[#047857]" role="status">
                                Reply saved.
                              </p>
                            ) : null}
                          </div>
                        ) : !reviewHasWrittenFeedback(r) ? (
                          <p className="mt-2.5 text-[12px] text-[#71717a]">
                            Replies are available when the guest leaves a title or written comment.
                          </p>
                        ) : (
                          <div className="mt-3">
                            <label htmlFor={`review-reply-${r.id}`} className="mb-1 block text-[12px] font-semibold text-[#18181b]">
                              <MessageSquare className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                              {replies[r.id] ? 'Edit reply' : 'Reply'}
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
                              rows={3}
                              maxLength={2000}
                              disabled={!canReply || replyingId === r.id}
                              className="tv-input text-[13px] disabled:opacity-50"
                              aria-describedby={`review-reply-hint-${r.id}`}
                            />
                            {/* Phase 1697: live length honesty on supplier review replies. */}
                            <p id={`review-reply-hint-${r.id}`} className="mt-1 text-[11px] text-[#a1a1aa]">
                              Up to 2000 characters
                              {(replyText[r.id] ?? '').length > 0 ? ` · ${(replyText[r.id] ?? '').length} used` : ''}.
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={!canReply || replyingId === r.id || !(replyText[r.id] ?? '').trim()}
                                onClick={() => void handleSubmitReply(r.id)}
                                className="tv-btn-primary inline-flex h-9 items-center gap-1.5 px-3 text-[13px] disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" aria-hidden />
                                {replyingId === r.id ? 'Saving…' : replies[r.id] ? 'Save changes' : 'Save reply'}
                              </button>
                              {replies[r.id] && editingReplyIds.has(r.id) ? (
                                <button
                                  type="button"
                                  disabled={replyingId === r.id}
                                  onClick={() => cancelEditingReply(r.id)}
                                  className="tv-btn-ghost h-9 px-3 text-[13px] disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </article>
                    </li>
                  );
                })}
              </ul>

              {pageCount > 1 ? (
                <div className="flex items-center justify-between text-[13px]">
                  <button
                    type="button"
                    className="tv-btn-secondary h-9 px-3"
                    disabled={safePage === 0}
                    onClick={() => writeFiltersToUrl({ pageIndex: Math.max(0, safePage - 1) })}
                  >
                    Previous
                  </button>
                  <span className="text-[#71717a]">
                    {safePage + 1} / {pageCount}
                  </span>
                  <button
                    type="button"
                    className="tv-btn-secondary h-9 px-3"
                    disabled={safePage + 1 >= pageCount}
                    onClick={() => writeFiltersToUrl({ pageIndex: safePage + 1 })}
                  >
                    Next
                  </button>
                </div>
              ) : null}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
