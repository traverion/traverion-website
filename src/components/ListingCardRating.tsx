import { Star, Clock } from 'lucide-react';
import { isSupabaseListingId } from '../lib/discount-display';
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
  const placeholder = isDb && (!aggregate || aggregate.count === 0);
  const textSize = compact ? 'text-xs' : 'text-sm';

  return (
    <div className={`flex items-center ${textSize} text-gray-600`}>
      {hasReal ? (
        <>
          <Star className={`text-finland fill-finland mr-0.5 ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
          <strong className="text-gray-900">{aggregate.rating}</strong>
          <span className="ml-1">({aggregate.count})</span>
        </>
      ) : placeholder ? (
        <span className={`text-gray-500 ${compact ? 'max-w-[9rem] truncate' : ''}`}>No reviews yet</span>
      ) : (
        <>
          <Star className={`text-finland fill-finland mr-0.5 ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
          <strong className="text-gray-900">{tour.rating}</strong>
          <span className="ml-1">({tour.reviews})</span>
        </>
      )}
      <span className="mx-1.5 text-gray-300">·</span>
      <Clock className={`mr-0.5 text-gray-400 ${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
      {tour.duration}
    </div>
  );
}
