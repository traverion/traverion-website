import { Star } from 'lucide-react';
import { isSupabaseListingId } from '../lib/discount-display';
import { SHOW_SEED_LISTINGS } from '../data/listings';
import type { TourPackage } from '../types/tour';

type TourRatingFields = Pick<TourPackage, 'id' | 'rating' | 'reviews'>;

type Props = {
  tour: TourRatingFields;
  /**
   * When set for a Supabase listing, overrides listing row defaults for display.
   * `undefined` = not loaded / load failed (Phase 1097: do not invent “No reviews yet”).
   * `{ count: 0 }` = loaded and truly empty.
   */
  aggregate?: { rating: number; count: number } | undefined;
  /** Slightly smaller text for compact grids */
  compact?: boolean;
};

/**
 * Honest ratings on cards: Supabase listings use real review aggregates when available;
 * otherwise "No reviews yet" instead of a placeholder score.
 * Duration lives on the browse card meta line — do not duplicate it here.
 */
export function ListingCardRating({ tour, aggregate, compact }: Props) {
  const isDb = isSupabaseListingId(tour.id);
  const hasReal = isDb && aggregate && aggregate.count > 0;
  const knownEmpty = isDb && aggregate && aggregate.count === 0;
  const showSeedRating = SHOW_SEED_LISTINGS && !isDb;
  const textSize = compact ? 'text-xs' : 'text-sm';

  if (isDb && aggregate === undefined) {
    return null;
  }

  return (
    <div
      className={`flex items-center font-medium ${textSize} text-ink`}
      aria-label={
        hasReal
          ? `${aggregate.rating} out of 5 from ${aggregate.count} review${aggregate.count === 1 ? '' : 's'}`
          : showSeedRating
            ? `${tour.rating} out of 5 from ${tour.reviews} review${tour.reviews === 1 ? '' : 's'}`
            : knownEmpty
              ? 'No reviews yet'
              : undefined
      }
    >
      {hasReal ? (
        <>
          <Star className={`mr-0.5 fill-finland text-finland ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
          <strong className="text-ink">{aggregate.rating}</strong>
          <span className="ml-1 text-ink-muted">({aggregate.count})</span>
        </>
      ) : showSeedRating ? (
        <>
          <Star className={`mr-0.5 fill-finland text-finland ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
          <strong className="text-ink">{tour.rating}</strong>
          <span className="ml-1 text-ink-muted">({tour.reviews})</span>
        </>
      ) : knownEmpty ? (
        <span className={`text-ink-faint ${compact ? 'max-w-[9rem] truncate' : ''}`}>No reviews yet</span>
      ) : null}
    </div>
  );
}
