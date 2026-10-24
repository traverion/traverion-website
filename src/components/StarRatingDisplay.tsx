/**
 * Traverion review stars — warm gold with a soft glow; supports partial averages.
 */
import { Star } from 'lucide-react';

type Props = {
  rating: number;
  size?: number;
  className?: string;
  /** When false, omit the aria-label (parent already announces). */
  labelled?: boolean;
};

function clampRating(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, n));
}

export default function StarRatingDisplay({
  rating,
  size = 14,
  className = '',
  labelled = true,
}: Props) {
  const value = clampRating(Number(rating) || 0);
  const label = Number.isInteger(value)
    ? `${value} out of 5 stars`
    : `${value.toFixed(1)} out of 5 stars`;

  return (
    <span
      className={`tv-star-rating ${className}`.trim()}
      {...(labelled ? { 'aria-label': label } : { 'aria-hidden': true as const })}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        if (fill >= 0.999) {
          return (
            <Star
              key={i}
              size={size}
              className="tv-star-rating__star tv-star-rating__star--filled"
              aria-hidden
            />
          );
        }
        if (fill <= 0.001) {
          return (
            <Star
              key={i}
              size={size}
              className="tv-star-rating__star tv-star-rating__star--empty"
              aria-hidden
            />
          );
        }
        const pct = Math.round(fill * 100);
        return (
          <span
            key={i}
            className="tv-star-rating__partial"
            style={{ width: size, height: size }}
            aria-hidden
          >
            <Star size={size} className="tv-star-rating__star tv-star-rating__star--empty" />
            <span className="tv-star-rating__partial-fill" style={{ width: `${pct}%` }}>
              <Star size={size} className="tv-star-rating__star tv-star-rating__star--filled" />
            </span>
          </span>
        );
      })}
    </span>
  );
}
