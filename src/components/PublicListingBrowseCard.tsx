import { ArrowRight, MapPin } from 'lucide-react';
import type { TourPackage } from '../types/tour';
import type { ListingDiscount } from '../data/supabase-discounts';
import { getDisplayPriceForTour } from '../lib/discount-display';
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
  const { price, originalPrice, label } = getDisplayPriceForTour(tour, discountsByListing);
  const hasDiscount = Boolean(label && price < originalPrice);
  const fromAmount = hasDiscount ? price : originalPrice;
  const showStrikethrough = hasDiscount && originalPrice > fromAmount;
  const currency = tour.price?.currency ?? 'USD';
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
        <div className="absolute bottom-2.5 right-2.5 left-2.5 flex justify-end items-end gap-2">
          {hasDiscount && label && (
            <span className="pointer-events-none shrink-0 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-md ring-2 ring-white/30">
              {label}
            </span>
          )}
          <div className="pointer-events-none max-w-[min(100%,14rem)] rounded-xl bg-white/95 px-3 py-2 shadow-lg ring-1 ring-black/5 backdrop-blur-sm tabular-nums">
            {hasDiscount ? (
              <div className="text-right">
                {showStrikethrough && (
                  <span className="block text-xs font-medium text-gray-400 line-through">
                    {currency} {originalPrice.toFixed(0)}
                  </span>
                )}
                <span className="text-lg font-bold leading-tight text-finland">From {currency} {fromAmount.toFixed(0)}</span>
              </div>
            ) : (
              <span className="text-lg font-bold text-gray-900">From {currency} {originalPrice.toFixed(0)}</span>
            )}
          </div>
        </div>
      </div>
      <div className={padClass}>
        <h3
          className={`line-clamp-2 font-semibold leading-snug tracking-tight text-gray-900 transition-colors duration-200 group-hover:text-finland ${
            size === 'compact' ? 'text-base sm:text-lg' : 'text-lg sm:text-xl'
          }`}
        >
          {tour.title}
        </h3>
        <div
          className={`mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl px-3 py-2.5 tabular-nums ${
            hasDiscount
              ? 'border border-emerald-200/80 bg-gradient-to-r from-finland/[0.08] to-emerald-50 shadow-sm'
              : 'border border-gray-100 bg-gray-50/90'
          } ${size === 'compact' ? 'py-2' : ''}`}
          aria-label={hasDiscount ? `From ${currency} ${fromAmount}, ${label}` : `From ${currency} ${originalPrice}`}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">From</span>
          {showStrikethrough && (
            <span className="text-sm font-medium text-gray-500 line-through">{currency} {originalPrice.toFixed(0)}</span>
          )}
          <span
            className={`font-bold tracking-tight ${hasDiscount ? 'text-finland' : 'text-gray-900'} ${size === 'compact' ? 'text-xl' : 'text-2xl'}`}
          >
            {currency} {fromAmount.toFixed(0)}
          </span>
          {hasDiscount && label && (
            <span className="ml-auto inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm sm:ml-0">
              {label}
            </span>
          )}
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-1.5 text-sm font-medium text-gray-700">
          <MapPin className="h-4 w-4 flex-shrink-0 text-gray-500" aria-hidden />
          <span className="truncate">{locationLine}</span>
        </div>
        <div className="mt-2.5">
          <ListingCardRating tour={tour} aggregate={reviewAggregate} compact={size === 'compact'} />
        </div>
        {showTagPills && extraTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {extraTags.slice(0, 3).map((tagId) => (
              <span
                key={tagId}
                className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700"
              >
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
