import { memo } from 'react';
import { ArrowRight, Clock, MapPin } from 'lucide-react';
import { prefetchTourDetailsPage } from '../lib/routePrefetch';
import type { TourPackage } from '../types/tour';
import type { ListingDiscount } from '../data/supabase-discounts';
import { getDisplayPriceForTour } from '../lib/discount-display';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';
import { listingShowsFreeCancellation } from '../lib/listingTruth';
import { formatTourDurationDisplay, parseListingExtras } from '../types/listingExtras';
import { listingIsFamily } from '../lib/inventory';
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
  /** When stay dates are selected, show nights × total instead of only nightly. */
  stayStayTotal?: { nights: number; total: number; currency: string } | null;
};

/**
 * Customer-facing browse card: hero image, location, title, reviews/rating, duration, from-price.
 */
export const PublicListingBrowseCard = memo(function PublicListingBrowseCard({
  tour,
  index,
  onSelect,
  discountsByListing,
  reviewAggregate,
  tagLabels,
  size = 'default',
  showTagPills = false,
  showViewDetailsHint = false,
  stayStayTotal = null,
}: PublicListingBrowseCardProps) {
  const imgClass = size === 'compact' ? 'h-44' : 'h-56 sm:h-64';
  const padClass = size === 'compact' ? 'p-3' : 'p-4';
  const { price, originalPrice, label } = getDisplayPriceForTour(tour, discountsByListing);
  const hasDiscount = Boolean(label && price < originalPrice);
  const fromAmount = hasDiscount ? price : originalPrice;
  const showStrikethrough = hasDiscount && originalPrice > fromAmount;
  const currency = tour.price?.currency ?? 'USD';
  const isStay = listingIsFamily(tour, 'stay');
  const stay = isStay ? parseListingExtras(tour.listingExtras).stay : undefined;
  const stayNightly = stay?.nightlyPriceUsd && stay.nightlyPriceUsd > 0 ? stay.nightlyPriceUsd : fromAmount;
  const locationLine =
    [tour.city, tour.country].filter(Boolean).join(', ') || tour.destination || 'Various locations';
  const durationLine = isStay
    ? stay?.maxGuests
      ? `Up to ${stay.maxGuests} guests`
      : tour.groupSize || ''
    : formatTourDurationDisplay(tour.duration || '');
  const extraTags =
    tour.tags?.filter((t) => t !== 'free-cancellation' && t !== 'bestseller') ?? [];
  const heroSrc = listingHeroImageSrc(tour.image);

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
      onPointerEnter={prefetchTourDetailsPage}
      className="group relative bg-paper-raised rounded-2xl overflow-hidden cursor-pointer shadow-none hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] motion-safe:animate-fade-in-up focus:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
      style={{ animationDelay: `${Math.min(index * 45, 320)}ms` }}
      aria-label={`View ${tour.title}`}
    >
      <div className={`relative ${imgClass} overflow-hidden bg-black/[0.04]`}>
        {heroSrc ? (
          <img
            src={heroSrc}
            alt={tour.title}
            loading={index < 2 ? 'eager' : 'lazy'}
            fetchPriority={index === 0 ? 'high' : 'low'}
            decoding="async"
            width={800}
            height={640}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        ) : null}
        {heroSrc ? (
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-80"
          aria-hidden
        />
        ) : null}
        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
          {listingShowsFreeCancellation(tour) && !isStay && (
            <span className="bg-white/95 text-ink text-[11px] font-medium px-2 py-0.5 rounded-full">
              Free cancellation
            </span>
          )}
        </div>
        {hasDiscount && label ? (
          <div className="absolute bottom-2.5 right-2.5">
            <span className="pointer-events-none rounded-lg bg-finland px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
              {label}
            </span>
          </div>
        ) : null}
      </div>
      <div className={padClass}>
        <h3
          className={`line-clamp-2 font-semibold leading-snug tracking-tight text-ink transition-colors duration-200 group-hover:text-finland ${
            size === 'compact' ? 'text-base sm:text-lg' : 'text-lg sm:text-xl'
          }`}
        >
          {tour.title}
        </h3>
        <p
          className={`mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums ${size === 'compact' ? 'text-lg' : 'text-xl'}`}
          aria-label={
            isStay
              ? stayStayTotal
                ? `${stayStayTotal.currency} ${stayStayTotal.total} for ${stayStayTotal.nights} nights`
                : `${currency} ${stayNightly} per night`
              : hasDiscount
                ? `From ${currency} ${fromAmount} per person, ${label}`
                : `From ${currency} ${originalPrice} per person`
          }
        >
          {isStay ? null : (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">From</span>
          )}
          {showStrikethrough && !isStay ? (
            <span className="text-sm font-medium text-ink-faint line-through">{currency} {originalPrice.toFixed(0)}</span>
          ) : null}
          <span className={`font-bold tracking-tight ${hasDiscount && !isStay ? 'text-finland' : 'text-ink'}`}>
            {currency} {(isStay ? stayNightly : fromAmount).toFixed(0)}
          </span>
          <span className="text-sm font-medium text-ink-muted">{isStay ? 'per night' : 'per person'}</span>
          {isStay && stayStayTotal ? (
            <span className="w-full text-sm font-medium text-ink">
              {stayStayTotal.nights} night{stayStayTotal.nights === 1 ? '' : 's'} · {stayStayTotal.currency}{' '}
              {stayStayTotal.total.toFixed(0)}
            </span>
          ) : null}
        </p>
        <div className="mt-2 flex min-w-0 items-center gap-1.5 text-sm font-medium text-ink-muted">
          <MapPin className="h-4 w-4 flex-shrink-0 text-ink-faint" aria-hidden />
          <span className="truncate">{locationLine}</span>
        </div>
        {durationLine ? (
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-ink-muted">
            <Clock className="h-4 w-4 flex-shrink-0 text-ink-faint" aria-hidden />
            <span className="truncate">{durationLine}</span>
          </div>
        ) : null}
        <div className="mt-2.5">
          <ListingCardRating tour={tour} aggregate={reviewAggregate} compact={size === 'compact'} />
        </div>
        {showTagPills && extraTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {extraTags.slice(0, 3).map((tagId) => (
              <span
                key={tagId}
                className="rounded-md bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium text-ink-muted"
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
});
