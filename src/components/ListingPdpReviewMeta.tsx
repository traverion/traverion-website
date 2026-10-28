import { Star } from 'lucide-react';

type Props = {
  /** Formatted average from `publicReviewLabel` (null when no reviews). */
  score: string | null;
  count: number;
  /** Element id of the Reviews section (e.g. `tour-reviews`). */
  reviewsSectionId: string;
  className?: string;
};

function reviewCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'review' : 'reviews'}`;
}

/**
 * Title-row rating + review count shared by Tour, Stay, and Rental PDPs.
 * Always shows the count (including 0). Scrolls to Reviews only when count > 0.
 */
export default function ListingPdpReviewMeta({
  score,
  count,
  reviewsSectionId,
  className = '',
}: Props) {
  const hasReviews = count > 0;
  const showScore = Boolean(score);
  const label = hasReviews
    ? showScore
      ? `${score} average from ${reviewCountLabel(count)}. Go to reviews.`
      : `${reviewCountLabel(count)}. Go to reviews.`
    : '0 reviews';

  const inner = hasReviews ? (
    <>
      <Star size={15} className="shrink-0 fill-[#C9A227] text-[#C9A227]" aria-hidden />
      {showScore ? <span className="font-bold tabular-nums text-[#111827]">{score}</span> : null}
      <span className="font-medium text-ink-muted underline decoration-[#E8EBF0] underline-offset-2">
        {reviewCountLabel(count)}
      </span>
    </>
  ) : (
    <>
      <Star size={15} className="shrink-0 text-ink-faint" aria-hidden />
      <span className="font-medium text-ink-muted">0 reviews</span>
    </>
  );

  if (hasReviews) {
    return (
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0758CB] ${className}`.trim()}
        onClick={() => {
          document.getElementById(reviewsSectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        aria-label={label}
      >
        {inner}
      </button>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-ink-muted ${className}`.trim()} aria-label={label}>
      {inner}
    </span>
  );
}
