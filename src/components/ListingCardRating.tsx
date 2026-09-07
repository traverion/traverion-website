import { Star, Clock } from 'lucide-react';
import { isSupabaseListingId } from '../lib/discount-display';
import { SHOW_SEED_LISTINGS } from '../data/listings';
import type { TourPackage } from '../types/tour';

type TourRatingFields = Pick<TourPackage, 'id' | 'rating' | 'reviews' | 'duration'>;

type Props = {
  tour: TourRatingFields;
  /** When set for a Supabase listing, overrides listing row defaults for display. */
  aggregate?: { rating: number; count: number } | undefined;
  /** Slightly smaller text for compact grids */
  compact?: boolean;
};

/**
 * Honest ratings on cards: Supabase listings use real review aggregates when available;
 * otherwise "No reviews yet" instead of a placeholder score.
 */
export function ListingCardRating({ tour, aggregate, compact }: Props) {
  const isDb = isSupabaseListingId(tour.id);
  const hasReal = isDb && aggregate && aggregate.count > 0;
  const showSeedRating = SHOW_SEED_LISTINGS && !isDb;
  const textSize = compact ? 'text-xs' : 'text-sm';

  return (
    <div className={`flex items-center font-medium ${textSize} text-ink`}>
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
      ) : (
        <span className={`text-ink-muted ${compact ? 'max-w-[9rem] truncate' : ''}`}>No reviews yet</span>
      )}
      <span className="mx-1.5 text-ink-faint">·</span>
      <Clock className={`mr-0.5 text-ink-muted ${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}`} />
      <span className="text-ink">{tour.duration}</span>
    </div>
  );
}
