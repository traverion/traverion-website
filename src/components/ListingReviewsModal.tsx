import { useEffect, useMemo, useRef, useState } from 'react';
import { Flag, X } from 'lucide-react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { useAuth } from '../contexts/AuthContext';
import {
  submitReviewContentReport,
  type ContentReportReason,
  type ReviewDisplay,
  type ReviewReplyRow,
} from '../data/supabase-reviews';
import { displayReviewGuestName } from '../lib/review-public-identity';
import PartnerSelect from './supplier/PartnerSelect';
import ReviewCommentClamp from './ReviewCommentClamp';
import StarRatingDisplay from './StarRatingDisplay';

type SortId = 'newest' | 'oldest' | 'highest' | 'lowest';

type Props = {
  open: boolean;
  onClose: () => void;
  reviews: ReviewDisplay[];
  replies: Record<string, ReviewReplyRow>;
  listingTitle: string;
};

const REPORT_REASONS: { id: ContentReportReason; label: string }[] = [
  { id: 'spam', label: 'Spam' },
  { id: 'fake', label: 'Fake or misleading' },
  { id: 'abusive', label: 'Abusive' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'irrelevant', label: 'Irrelevant' },
  { id: 'other', label: 'Other' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'highest', label: 'Highest rating' },
  { value: 'lowest', label: 'Lowest rating' },
] as const;

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

function formatReviewDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function averageRating(reviews: ReviewDisplay[]): number | null {
  if (reviews.length === 0) return null;
  const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
  return Math.round((sum / reviews.length) * 10) / 10;
}

export function ListingReviewsModal({ open, onClose, reviews, replies, listingTitle }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, sheetRef, onClose);
  const { user } = useAuth();
  const [starFilter, setStarFilter] = useState<number | 'all'>('all');
  const [sort, setSort] = useState<SortId>('newest');
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reason, setReason] = useState<ContentReportReason>('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reportedIds, setReportedIds] = useState<Record<string, true>>({});

  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [open]);

  const distribution = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const r of reviews) {
      const i = Math.min(5, Math.max(1, Math.round(r.rating))) - 1;
      counts[i] += 1;
    }
    return counts;
  }, [reviews]);

  const avg = useMemo(() => averageRating(reviews), [reviews]);

  const filtered = useMemo(() => {
    const base = starFilter === 'all' ? reviews : reviews.filter((r) => Math.round(r.rating) === starFilter);
    return sortReviews(base, sort);
  }, [reviews, starFilter, sort]);

  if (!open) return null;

  const submitReport = async (reviewId: string) => {
    if (!user) {
      setFeedback('Sign in to report a review.');
      return;
    }
    setBusy(true);
    setFeedback(null);
    const res = await submitReviewContentReport({
      reviewId,
      reason,
      details,
    });
    setBusy(false);
    if (!res.success) {
      setFeedback(res.error ?? 'Could not submit report.');
      return;
    }
    setReportedIds((prev) => ({ ...prev, [reviewId]: true }));
    setReportingId(null);
    setDetails('');
    setFeedback('Report received. Traverion staff can review it from the admin safety queue.');
  };

  return (
    <div ref={sheetRef} className="tv-reviews-modal-overlay">
      <button
        type="button"
        tabIndex={-1}
        className="tv-reviews-modal-backdrop"
        aria-label="Close reviews"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-reviews-title"
        className="tv-reviews-modal-panel"
      >
        <header className="tv-reviews-modal-header">
          <div className="tv-reviews-modal-header__copy min-w-0">
            <h2 id="listing-reviews-title" className="tv-reviews-modal-title" title={listingTitle}>
              {listingTitle}
            </h2>
            <div className="tv-reviews-modal-meta">
              {avg != null ? (
                <>
                  <span className="tv-reviews-modal-meta__avg tabular-nums">{avg.toFixed(1)}</span>
                  <StarRatingDisplay rating={avg} size={14} />
                  <span className="tv-reviews-modal-meta__sep" aria-hidden>
                    ·
                  </span>
                </>
              ) : null}
              <span className="tabular-nums">
                {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tv-reviews-modal-close lux-tap-target"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        {feedback ? (
          <p className="tv-reviews-modal-feedback" role="status">
            {feedback}
          </p>
        ) : null}

        <div className="tv-reviews-modal-toolbar">
          <div
            className="tv-reviews-modal-filters"
            role="group"
            aria-label="Filter by rating"
          >
            <button
              type="button"
              aria-pressed={starFilter === 'all'}
              onClick={() => setStarFilter('all')}
              className={`tv-reviews-modal-pill ${
                starFilter === 'all' ? 'tv-reviews-modal-pill--active' : ''
              }`}
            >
              All · {reviews.length}
            </button>
            {[5, 4, 3, 2, 1].map((star) => (
              <button
                key={star}
                type="button"
                aria-pressed={starFilter === star}
                onClick={() => setStarFilter(star)}
                className={`tv-reviews-modal-pill tabular-nums ${
                  starFilter === star ? 'tv-reviews-modal-pill--active' : ''
                }`}
              >
                {star}★ · {distribution[star - 1]}
              </button>
            ))}
          </div>
          <div className="tv-reviews-modal-sort">
            <PartnerSelect
              value={sort}
              options={SORT_OPTIONS}
              onChange={(v) => setSort(v as SortId)}
              searchable={false}
              aria-label="Sort reviews"
            />
          </div>
        </div>

        <div className="tv-reviews-modal-body">
          {filtered.length === 0 ? (
            // Phase 1618: star filter empty — offer Reset, do not strand the traveler.
            <div className="tv-reviews-modal-empty">
              <p className="text-sm text-ink-muted">
                {reviews.length > 0
                  ? 'No reviews match this rating filter.'
                  : 'No reviews yet for this listing.'}
              </p>
              {reviews.length > 0 && starFilter !== 'all' ? (
                <button
                  type="button"
                  onClick={() => setStarFilter('all')}
                  className="tv-btn-secondary mt-3"
                >
                  Show all ratings
                </button>
              ) : null}
            </div>
          ) : (
            filtered.map((r) => (
              <article key={r.id} className="tv-reviews-modal-row">
                <div className="tv-reviews-modal-row__head">
                  <p className="tv-reviews-modal-row__name">{displayReviewGuestName(r)}</p>
                  <div className="tv-reviews-modal-row__meta">
                    <StarRatingDisplay rating={r.rating} size={13} />
                    <span className="tv-reviews-modal-row__date">{formatReviewDate(r.created_at)}</span>
                    {r.verified ? <span className="tv-review-verified">Verified</span> : null}
                  </div>
                </div>
                {r.title ? (
                  <p className="tv-reviews-modal-row__title">{r.title}</p>
                ) : null}
                <div className="tv-reviews-modal-row__comment">
                  <ReviewCommentClamp
                    text={r.comment}
                    className="tv-reviews-modal-comment"
                    toggleClassName="tv-reviews-see-more"
                    moreLabel="Show more"
                    lessLabel="Show less"
                  />
                </div>
                {replies[r.id]?.reply_text ? (
                  <div className="tv-public-review-reply">
                    <p className="tv-public-review-reply__label">Response from the operator</p>
                    <p className="mt-1 text-[15px] leading-[1.6] text-ink break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                      {replies[r.id]!.reply_text}
                    </p>
                  </div>
                ) : null}

                <div className="tv-reviews-modal-row__actions">
                  {reportedIds[r.id] ? (
                    <p className="text-xs text-ink-muted">Report submitted</p>
                  ) : reportingId === r.id ? (
                    <div className="tv-reviews-modal-report">
                      <p className="text-[12px] font-semibold text-ink">Report review</p>
                      <label className="block text-sm text-ink-muted">
                        Reason
                        <div className="mt-1">
                          <PartnerSelect
                            value={reason}
                            options={REPORT_REASONS.map((opt) => ({ value: opt.id, label: opt.label }))}
                            onChange={(v) => setReason(v as ContentReportReason)}
                            searchable={false}
                            aria-label="Report reason"
                          />
                        </div>
                      </label>
                      <label className="block text-sm text-ink-muted">
                        Details (optional)
                        <textarea
                          value={details}
                          onChange={(e) => setDetails(e.target.value.slice(0, 2000))}
                          rows={3}
                          className="mt-1 w-full rounded-lg bg-paper-raised px-3 py-2 text-sm text-ink ring-1 ring-black/[0.06]"
                          placeholder="What is wrong with this review?"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void submitReport(r.id)}
                          className="tv-btn-primary text-sm disabled:opacity-50"
                        >
                          {busy ? 'Sending…' : 'Submit report'}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setReportingId(null);
                            setDetails('');
                          }}
                          className="tv-btn-secondary text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setReportingId(r.id);
                        setFeedback(null);
                      }}
                      className="tv-reviews-modal-report-trigger"
                    >
                      <Flag className="h-3.5 w-3.5" aria-hidden />
                      Report
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
