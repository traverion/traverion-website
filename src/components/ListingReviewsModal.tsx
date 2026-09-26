import { useMemo, useRef, useState } from 'react';
import { Star, X } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import type { ReviewDisplay, ReviewReplyRow } from '../../data/supabase-reviews';

type SortId = 'newest' | 'oldest' | 'highest' | 'lowest';

type Props = {
  open: boolean;
  onClose: () => void;
  reviews: ReviewDisplay[];
  replies: Record<string, ReviewReplyRow>;
  listingTitle: string;
};

function sortReviews(list: ReviewDisplay[], sort: SortId): ReviewDisplay[] {
  const next = [...list];
  next.sort((a, b) => {
    if (sort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (sort === 'highest') return b.rating - a.rating || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return a.rating - b.rating || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return next;
}

export function ListingReviewsModal({ open, onClose, reviews, replies, listingTitle }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, sheetRef, onClose);
  const [starFilter, setStarFilter] = useState<number | 'all'>('all');
  const [sort, setSort] = useState<SortId>('newest');

  const distribution = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const r of reviews) {
      const i = Math.min(5, Math.max(1, Math.round(r.rating))) - 1;
      counts[i] += 1;
    }
    return counts;
  }, [reviews]);

  const filtered = useMemo(() => {
    const base = starFilter === 'all' ? reviews : reviews.filter((r) => Math.round(r.rating) === starFilter);
    return sortReviews(base, sort);
  }, [reviews, starFilter, sort]);

  if (!open) return null;

  return (
    <div ref={sheetRef} className="tv-sheet-overlay">
      <button type="button" tabIndex={-1} className="absolute inset-0" aria-label="Close reviews" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-reviews-title"
        className="tv-sheet-panel relative flex max-h-[min(92dvh,44rem)] w-full max-w-2xl flex-col overflow-hidden motion-safe:animate-slide-up sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3 shrink-0">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland">Reviews</p>
            <h2 id="listing-reviews-title" className="font-display text-xl sm:text-2xl text-ink tracking-tight mt-1">
              {listingTitle}
            </h2>
            <p className="mt-1 text-sm text-ink-muted tabular-nums">
              {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="lux-tap-target inline-flex min-h-11 min-w-11 items-center justify-center p-2 -mr-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        <div className="mb-4 shrink-0 space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by rating">
            <button
              type="button"
              aria-pressed={starFilter === 'all'}
              onClick={() => setStarFilter('all')}
              className={`tv-chip min-h-9 px-3 text-[13px] ${
                starFilter === 'all' ? 'bg-finland text-white' : 'bg-paper text-ink ring-1 ring-black/[0.06]'
              }`}
            >
              All
            </button>
            {[5, 4, 3, 2, 1].map((star) => (
              <button
                key={star}
                type="button"
                aria-pressed={starFilter === star}
                onClick={() => setStarFilter(star)}
                className={`tv-chip min-h-9 px-3 text-[13px] tabular-nums ${
                  starFilter === star ? 'bg-finland text-white' : 'bg-paper text-ink ring-1 ring-black/[0.06]'
                }`}
              >
                {star}★ · {distribution[star - 1]}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-ink-muted">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-finland">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortId)}
              className="h-9 rounded-full bg-paper-raised px-3 text-sm font-medium text-ink ring-1 ring-black/[0.06]"
              aria-label="Sort reviews"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="highest">Highest rating</option>
              <option value="lowest">Lowest rating</option>
            </select>
          </label>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-ink-muted py-6">No reviews match this filter.</p>
          ) : (
            filtered.map((r) => (
              <article key={r.id} className="border-b border-black/[0.06] pb-5 last:border-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{r.guest_name}</span>
                  {r.verified ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Verified</span>
                  ) : null}
                  <span className="text-sm text-ink-muted">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <div className="mb-1 flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      size={16}
                      className={i <= r.rating ? 'fill-finland text-finland' : 'text-ink-faint'}
                      aria-hidden
                    />
                  ))}
                </div>
                {r.title ? (
                  <p className="mb-1 font-medium text-ink break-words [overflow-wrap:anywhere]">{r.title}</p>
                ) : null}
                <p className="text-ink break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{r.comment}</p>
                {replies[r.id]?.reply_text ? (
                  <div className="mt-3 rounded-xl bg-finland/[0.04] px-3.5 py-3 ring-1 ring-finland/10">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-finland">
                      Response from the operator
                    </p>
                    <p className="text-sm leading-relaxed text-ink break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                      {replies[r.id]!.reply_text}
                    </p>
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
