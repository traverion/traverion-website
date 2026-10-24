/**
 * Shared public review card for Tour / Stay listing pages.
 */
import type { ReviewDisplay, ReviewReplyRow } from '../data/supabase-reviews';
import { displayReviewGuestName } from '../lib/review-public-identity';
import ReviewCommentClamp from './ReviewCommentClamp';
import StarRatingDisplay from './StarRatingDisplay';

type Props = {
  review: ReviewDisplay;
  reply?: ReviewReplyRow | null;
  /** Tour: "operator"; Stay: "host" */
  replyFromLabel?: 'operator' | 'host';
};

function formatReviewDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PublicReviewCard({
  review,
  reply,
  replyFromLabel = 'operator',
}: Props) {
  const replyText = (reply?.reply_text ?? '').trim();
  const title = (review.title ?? '').trim();

  return (
    <article className="tv-public-review-card">
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold tracking-tight text-[#111827]">
          {displayReviewGuestName(review)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <StarRatingDisplay rating={review.rating} size={13} />
          <span className="text-xs text-ink-muted">{formatReviewDate(review.created_at)}</span>
          {review.verified ? (
            <span className="tv-review-verified">Verified</span>
          ) : null}
        </div>
      </div>
      {title ? (
        <p className="mt-2 text-sm font-semibold text-[#111827] break-words [overflow-wrap:anywhere]">
          {title}
        </p>
      ) : null}
      <div className={title ? 'mt-1' : 'mt-2'}>
        <ReviewCommentClamp
          text={review.comment}
          className="text-[14px] leading-relaxed text-ink"
          toggleClassName="tv-reviews-see-more"
        />
      </div>
      {replyText ? (
        <div className="tv-public-review-reply">
          <p className="tv-public-review-reply__label">
            Response from the {replyFromLabel}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
            {replyText}
          </p>
        </div>
      ) : null}
    </article>
  );
}
