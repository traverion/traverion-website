import { memo } from 'react';
import { Heart } from 'lucide-react';
import { prefetchTourDetailsPage } from '../lib/routePrefetch';
import type { TourPackage } from '../types/tour';
import type { ListingDiscount } from '../data/supabase-discounts';
import { getDisplayPriceForTour, isSupabaseListingId } from '../lib/discount-display';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';
import { listingShowsFreeCancellation } from '../lib/listingTruth';
import { formatTourDurationDisplay, materializedBookingOptions, parseListingExtras } from '../types/listingExtras';
import { listingIsFamily } from '../lib/inventory';
import { formatMoney, normalizeCurrency } from '../lib/money';
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
  /** Real persisted wishlist. Omit when the listing cannot be saved. */
  wishlist?: {
    saved: boolean;
    busy?: boolean;
    onToggle: () => void;
  } | null;
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
  wishlist = null,
}: PublicListingBrowseCardProps) {
  const { price, originalPrice, label, qualifier, summary } = getDisplayPriceForTour(tour, discountsByListing);
  const hasDiscount = Boolean(label && price < originalPrice);
  const fromAmount = hasDiscount ? price : originalPrice;
  const showStrikethrough = hasDiscount && originalPrice > fromAmount;
  const currency = normalizeCurrency(tour.price?.currency);
  const isStay = listingIsFamily(tour, 'stay');
  const extras = parseListingExtras(tour.listingExtras);
  const stay = isStay ? extras.stay : undefined;
  const stayNightly = stay?.nightlyPriceUsd && stay.nightlyPriceUsd > 0 ? stay.nightlyPriceUsd : fromAmount;
  const unitLabel = isStay ? 'per night' : qualifier ? `per ${qualifier}` : 'per person';
  const locationLine =
    [tour.city, tour.country].filter(Boolean).join(', ') || tour.destination || 'Various locations';
  const bookingOpts = isStay ? [] : materializedBookingOptions(extras.bookingOptions);
  const pickupIncluded =
    !isStay &&
    bookingOpts.some((o) => (o.pickupPlace ?? '').trim().length > 0 || /pickup/i.test(o.name));
  const privateOnly =
    !isStay && bookingOpts.length > 0 && bookingOpts.every((o) => Boolean(o.isPrivate));
  const stayBits = isStay
    ? [
        stay?.maxGuests ? `${stay.maxGuests} guest${stay.maxGuests === 1 ? '' : 's'}` : tour.groupSize || null,
        typeof stay?.bedrooms === 'number' ? `${stay.bedrooms} bedroom${stay.bedrooms === 1 ? '' : 's'}` : null,
        stay?.propertyType?.trim() || null,
      ].filter(Boolean)
    : [];
  const tourBits = isStay
    ? []
    : [
        formatTourDurationDisplay(tour.duration || '') || null,
        pickupIncluded ? 'Pickup included' : null,
        privateOnly ? 'Private' : null,
      ].filter(Boolean);
  const metaLine = (isStay ? stayBits : tourBits).join(' · ');
  const extraTags =
    tour.tags?.filter((t) => t !== 'free-cancellation' && t !== 'bestseller') ?? [];
  const heroSrc = listingHeroImageSrc(tour.image);
  const showWishlist = Boolean(wishlist && isSupabaseListingId(tour.id));
  const priceAria = isStay
    ? stayStayTotal
      ? `${formatMoney(stayStayTotal.total, stayStayTotal.currency)} total for ${stayStayTotal.nights} nights`
      : `${formatMoney(stayNightly, currency)} per night`
    : hasDiscount
      ? `From ${formatMoney(fromAmount, currency)} ${unitLabel}, ${label}`
      : `From ${formatMoney(originalPrice, currency)} ${unitLabel}`;

  return (
    <article className="group relative">
      {showWishlist && wishlist ? (
        <button
          type="button"
          className="lux-flat absolute top-2.5 right-2.5 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/92 text-ink shadow-sm ring-1 ring-black/[0.08] hover:bg-white disabled:opacity-60"
          aria-label={wishlist.saved ? `Remove ${tour.title} from saved` : `Save ${tour.title}`}
          aria-pressed={wishlist.saved}
          disabled={wishlist.busy}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            wishlist.onToggle();
          }}
        >
          <Heart
            className={`h-4 w-4 ${wishlist.saved ? 'fill-finland text-finland' : 'text-ink'}`}
            strokeWidth={2}
          />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        onPointerEnter={prefetchTourDetailsPage}
        className="lux-flat block w-full overflow-hidden rounded-xl bg-paper-raised text-left shadow-soft ring-1 ring-black/[0.06] transition-[box-shadow,ring-color] duration-200 hover:shadow-soft-lg hover:ring-finland/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
        style={{ animationDelay: `${Math.min(index * 35, 240)}ms` }}
        aria-label={`View ${tour.title}. ${priceAria}`}
      >
        <div className={`relative overflow-hidden bg-black/[0.04] ${size === 'compact' ? 'aspect-[4/3]' : 'aspect-[4/3]'}`}>
          {heroSrc ? (
            <img
              src={heroSrc}
              alt=""
              loading={index < 2 ? 'eager' : 'lazy'}
              fetchPriority={index === 0 ? 'high' : 'low'}
              decoding="async"
              width={800}
              height={600}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            />
          ) : null}
          <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5 pr-12">
            <span className="rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-ink ring-1 ring-black/[0.04]">
              {isStay ? 'Stay' : 'Tour'}
            </span>
            {listingShowsFreeCancellation(tour) ? (
              <span className="rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-black/[0.04]">
                Free cancellation
              </span>
            ) : null}
            {isStay && stay?.propertyType?.trim() && !listingShowsFreeCancellation(tour) ? (
              <span className="rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-ink ring-1 ring-black/[0.04]">
                {stay.propertyType.trim()}
              </span>
            ) : null}
          </div>
          {hasDiscount && label ? (
            <div className="absolute bottom-2.5 left-2.5">
              <span className="rounded-md bg-finland px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                {label}
              </span>
            </div>
          ) : null}
        </div>
        <div className={size === 'compact' ? 'p-3' : 'px-3.5 py-3'}>
          <p className="truncate text-[13px] text-ink-muted">{locationLine}</p>
          <h3 className="mt-0.5 line-clamp-2 break-words text-[15px] sm:text-base font-semibold leading-snug tracking-tight text-ink [overflow-wrap:anywhere]">
            {tour.title}
          </h3>
          <div className="mt-1.5">
            <ListingCardRating tour={tour} aggregate={reviewAggregate} compact />
          </div>
          {metaLine ? <p className="mt-1 truncate text-[13px] text-ink-muted">{metaLine}</p> : null}
          <p
            className={`mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 tabular-nums ${
              isStay && stayStayTotal ? 'text-lg' : 'text-base'
            }`}
          >
            {isStay && stayStayTotal ? (
              <>
                <span className="font-bold tracking-tight text-ink">
                  {formatMoney(stayStayTotal.total, stayStayTotal.currency)}
                </span>
                <span className="text-[13px] font-medium text-ink-muted">
                  total · {stayStayTotal.nights} night{stayStayTotal.nights === 1 ? '' : 's'}
                </span>
                <span className="w-full text-xs font-medium text-ink-faint">
                  {formatMoney(stayNightly, currency)} per night
                </span>
              </>
            ) : (
              <>
                {isStay ? null : (
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">From</span>
                )}
                {showStrikethrough && !isStay ? (
                  <span className="text-sm font-medium text-ink-faint line-through">
                    {formatMoney(originalPrice, currency)}
                  </span>
                ) : null}
                <span className={`font-bold tracking-tight ${hasDiscount && !isStay ? 'text-finland' : 'text-ink'}`}>
                  {formatMoney(isStay ? stayNightly : fromAmount, currency)}
                </span>
                <span className="text-[13px] font-medium text-ink-muted">{unitLabel}</span>
                {!isStay && summary ? (
                  <span className="w-full text-xs font-medium text-ink-muted">{summary}</span>
                ) : null}
              </>
            )}
          </p>
          {showTagPills && extraTags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {extraTags.slice(0, 3).map((tagId) => (
                <span
                  key={tagId}
                  className="rounded-md bg-finland/10 px-2 py-0.5 text-[11px] font-medium text-finland ring-1 ring-finland/15"
                >
                  {tagLabels[tagId] ?? tagId}
                </span>
              ))}
            </div>
          ) : null}
          {showViewDetailsHint ? (
            <p className="mt-2 text-sm font-medium text-finland">View details</p>
          ) : null}
        </div>
      </button>
    </article>
  );
});
