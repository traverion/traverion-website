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
    <div className={`flex items-center font-medium ${textSize} text-gray-700`}>
      {hasReal ? (
        <>
          <Star className={`mr-0.5 fill-finland text-finland ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
          <strong className="text-gray-900">{aggregate.rating}</strong>
          <span className="ml-1 text-gray-600">({aggregate.count})</span>
        </>
      ) : placeholder ? (
        <span className={`text-gray-600 ${compact ? 'max-w-[9rem] truncate' : ''}`}>No reviews yet</span>
      ) : (
        <>
          <Star className={`mr-0.5 fill-finland text-finland ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
          <strong className="text-gray-900">{tour.rating}</strong>
          <span className="ml-1 text-gray-600">({tour.reviews})</span>
        </>
      )}
      <span className="mx-1.5 text-gray-400">·</span>
      <Clock className={`mr-0.5 text-gray-500 ${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}`} />
      <span className="text-gray-800">{tour.duration}</span>
    </div>
  );
}
