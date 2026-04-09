import { ArrowRight, MapPin } from 'lucide-react';
import type { TourPackage } from '../types/tour';
import type { ListingDiscount } from '../data/supabase-discounts';
import { getDisplayPrice } from '../lib/discount-display';
import { ListingCardRating } from './ListingCardRating';

export type PublicListingBrowseCardProps = {
  tour: TourPackage;
  index: number;
  onSelect: () => void;
  discountsByListing: Map<string, ListingDiscount[]>;
  reviewAggregate?: { rating: number; count: number };
  tagLabels: Record<string, string>;
  /** Shorter image for dense rows (e.g. “Recommended”). */
  size?: 'default' | 'compact';
  /** Extra tag chips under the rating (excluding common promo tags). */
  showTagPills?: boolean;
  /** Home search results: small “View details” affordance. */
  showViewDetailsHint?: boolean;
};

/**
 * Customer-facing browse card: hero image, location, title, reviews/rating, duration, from-price.
 */
export function PublicListingBrowseCard({
  tour,
  index,
  onSelect,
  discountsByListing,
  reviewAggregate,
  tagLabels,
  size = 'default',
  showTagPills = true,
  showViewDetailsHint = false,
}: PublicListingBrowseCardProps) {
  const imgClass = size === 'compact' ? 'h-40' : 'h-48';
  const padClass = size === 'compact' ? 'p-3' : 'p-4';
  const { price, originalPrice, label } = getDisplayPrice(tour.id, tour.price.startingFrom, discountsByListing);
  const hasDiscount = Boolean(label && price < originalPrice);
  const fromAmount = hasDiscount ? price : originalPrice;
  const locationLine =
    [tour.city, tour.country].filter(Boolean).join(', ') || tour.destination || 'Various locations';
  const extraTags =
    tour.tags?.filter((t) => t !== 'free-cancellation' && t !== 'bestseller') ?? [];

  return (
    <article
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      onClick={onSelect}
      className="group relative bg-white rounded-2xl overflow-hidden border border-gray-100 cursor-pointer shadow-sm hover:shadow-lg hover:border-finland/15 hover:-translate-y-1 transition-all duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] motion-safe:animate-fade-in-up focus:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
      style={{ animationDelay: `${Math.min(index * 45, 320)}ms` }}
    >
      <div className={`relative ${imgClass} overflow-hidden bg-gray-100`}>
        <img
          src={tour.image}
          alt={tour.title}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-80"
          aria-hidden
        />
        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
          {tour.isPopular && (
            <span className="bg-finland text-white text-[11px] font-semibold px-2 py-0.5 rounded-md shadow-sm">
              Popular
            </span>
          )}
          {tour.tags?.includes('free-cancellation') && (
            <span className="bg-white/95 text-gray-800 text-[11px] font-medium px-2 py-0.5 rounded-md shadow-sm">
              Free cancellation
            </span>
          )}
          {tour.tags?.includes('bestseller') && (
            <span className="bg-amber-500 text-white text-[11px] font-semibold px-2 py-0.5 rounded-md shadow-sm">
              Bestseller
            </span>
          )}
        </div>
        <div className="absolute bottom-2.5 right-2.5 left-2.5 flex justify-end">
          <div className="bg-black/65 backdrop-blur-[2px] text-white text-sm font-semibold px-2.5 py-1 rounded-lg tabular-nums">
            {hasDiscount ? (
              <>
                <span>From ${fromAmount.toFixed(0)}</span>
                <span className="block text-[11px] font-normal text-white/90">{label}</span>
              </>
            ) : (
              `From $${originalPrice}`
            )}
          </div>
        </div>
      </div>
      <div className={padClass}>
        <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-finland transition-colors duration-200 text-[15px] leading-snug">
          {tour.title}
        </h3>
        <div className="flex items-center text-gray-500 text-sm mt-1.5 gap-1 min-w-0">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" aria-hidden />
          <span className="truncate">{locationLine}</span>
        </div>
        <div className="mt-2">
          <ListingCardRating tour={tour} aggregate={reviewAggregate} compact={size === 'compact'} />
        </div>
        {showTagPills && extraTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {extraTags.slice(0, 3).map((tagId) => (
              <span key={tagId} className="text-[11px] text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">
                {tagLabels[tagId] ?? tagId}
              </span>
            ))}
          </div>
        )}
        {showViewDetailsHint && (
          <p className="text-finland font-medium mt-3 flex items-center text-sm group-hover:gap-1 transition-all">
            View details <ArrowRight className="w-4 h-4 ml-1" aria-hidden />
          </p>
        )}
      </div>
    </article>
  );
}
