import { memo } from 'react';
import { Heart, MapPin, Users, BedDouble } from 'lucide-react';
import { prefetchListingDetailsPage } from '../lib/routePrefetch';
import type { TourPackage } from '../types/tour';
import type { ListingDiscount } from '../data/supabase-discounts';
import { getDisplayPriceForTour, isSupabaseListingId } from '../lib/discount-display';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';
import { listingShowsFreeCancellation } from '../lib/listingTruth';
import { formatTourDurationDisplay, materializedBookingOptions, parseListingExtras } from '../types/listingExtras';
import { listingHasUpcomingBookableSeason } from '../lib/booking-quote';
import { listingIsFamily } from '../lib/inventory';
import { formatMoney, normalizeCurrency } from '../lib/money';
import { isListingVisibleToTravelers } from '../lib/product-workflows';
import { ListingCardRating } from './ListingCardRating';

export type PublicListingBrowseCardProps = {
  tour: TourPackage;
  index: number;
  onSelect: () => void;
  discountsByListing: Map<string, ListingDiscount[]> | null;
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
  /**
   * Phase 1559: browse has check-in/out selected but quoteStayNights failed —
   * do not invent catalog nightly (StayDetails 1557 / BookingPage 1558).
   */
  stayDatesSelected?: boolean;
  /** Real persisted wishlist. Omit when the listing cannot be saved. */
  wishlist?: {
    saved: boolean;
    busy?: boolean;
    onToggle: () => void;
  } | null;
  /**
   * Search browse date (YYYY-MM-DD). When set, card price uses adult starting
   * price eligible on that day — same offer day as checkout would use.
   */
  browseDateIso?: string;
  /** Traveler/guest count from search — exclude options that cannot fit the party. */
  partySize?: number;
  /**
   * Rental browse uses the option starting rate and category.
   * Skips tour seasons and stay nightly quotes so those prices are not invented.
   */
  rentalBrowse?: {
    badge: string;
    meta: string;
    priceLabel: string | null;
    /** Development fixture. Never a public rating or a live hold. */
    preview?: boolean;
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
  stayDatesSelected = false,
  wishlist = null,
  browseDateIso = '',
  partySize,
  rentalBrowse = null,
}: PublicListingBrowseCardProps) {
  // Defense in depth: unpublished listings must not appear on traveler browse surfaces.
  if (!isListingVisibleToTravelers(tour.status)) return null;
  const isStay = listingIsFamily(tour, 'stay');
  const isRental = rentalBrowse != null;
  // Phase 1276: season-ended tours must not render even if a parent list missed the filter.
  if (!isStay && !isRental && !listingHasUpcomingBookableSeason(tour)) return null;

  // Phase 1107: null map = offers not loaded / load failed — do not invent “no discount”.
  const offersUnknown = discountsByListing == null && isSupabaseListingId(tour.id);
  const discountMap = discountsByListing ?? new Map<string, ListingDiscount[]>();
  const { price, originalPrice, label, qualifier } = getDisplayPriceForTour(tour, discountMap, {
    browseDateIso: browseDateIso || undefined,
    partySize: partySize && partySize > 0 ? partySize : undefined,
  });
  const priceUnavailable = !isStay && !offersUnknown && !(price > 0) && !(originalPrice > 0);
  const hasDiscount = !offersUnknown && !priceUnavailable && Boolean(label && price < originalPrice);
  const fromAmount = hasDiscount ? price : originalPrice;
  const showStrikethrough = hasDiscount && originalPrice > fromAmount;
  const currency = normalizeCurrency(tour.price?.currency);
  const extras = parseListingExtras(tour.listingExtras);
  const stay = isStay ? extras.stay : undefined;
  const stayNightly = stay?.nightlyPriceUsd && stay.nightlyPriceUsd > 0 ? stay.nightlyPriceUsd : fromAmount;
  const unitLabel = isStay ? 'night' : qualifier ? `per ${qualifier}` : 'per person';
  const locationLine =
    [tour.city, tour.country].filter(Boolean).join(', ') || tour.destination || 'Various locations';
  const bookingOpts = isStay ? [] : materializedBookingOptions(extras.bookingOptions);
  const pickupIncluded =
    !isStay &&
    (tour.experienceStartStyle === 'operator_pickup' ||
      bookingOpts.some((o) => (o.pickupPlace ?? '').trim().length > 0));
  const pickupOrMeet = !isStay && !pickupIncluded && tour.experienceStartStyle === 'either_available';
  const meetingOnly =
    !isStay &&
    !pickupIncluded &&
    !pickupOrMeet &&
    tour.experienceStartStyle === 'fixed_meeting_place';
  const privateOnly =
    !isStay && bookingOpts.length > 0 && bookingOpts.every((o) => Boolean(o.isPrivate));
  const propertyType = stay?.propertyType?.trim() || '';
  const guestLabel = stay?.maxGuests
    ? `${stay.maxGuests} guest${stay.maxGuests === 1 ? '' : 's'}`
    : tour.groupSize || null;
  const bedroomLabel =
    typeof stay?.bedrooms === 'number'
      ? `${stay.bedrooms} bedroom${stay.bedrooms === 1 ? '' : 's'}`
      : null;
  const tourBits = isStay
    ? []
    : [
        formatTourDurationDisplay(tour.duration || '') || null,
        pickupIncluded ? 'Pickup included' : pickupOrMeet ? 'Pickup or meet' : meetingOnly ? 'Meeting point' : null,
        privateOnly ? 'Private' : null,
      ].filter(Boolean);
  const metaLine = tourBits.join(' · ');
  const extraTags =
    tour.tags?.filter((t) => t !== 'free-cancellation' && t !== 'bestseller') ?? [];
  const heroSrc = listingHeroImageSrc(tour.image);
  const showWishlist = Boolean(wishlist && isSupabaseListingId(tour.id));
  // Phase 1559: dates selected + no successful stay total → hide catalog nightly.
  const stayQuoteUnavailable = isStay && stayDatesSelected && !stayStayTotal;
  const priceAria = isRental
    ? rentalBrowse?.priceLabel
      ? `From ${rentalBrowse.priceLabel}`
      : 'Price on the listing'
    : offersUnknown
    ? 'Price pending offer check'
    : stayQuoteUnavailable
      ? 'Price unavailable for these dates'
      : isStay
        ? stayStayTotal
          ? `${formatMoney(stayStayTotal.total, stayStayTotal.currency)} total for ${stayStayTotal.nights} nights`
          : `${formatMoney(stayNightly, currency)} per night`
        : hasDiscount
          ? `From ${formatMoney(fromAmount, currency)} ${unitLabel}, ${label}`
          : `From ${formatMoney(originalPrice, currency)} ${unitLabel}`;

  return (
    <article className="tv-browse-card group relative">
      {showWishlist && wishlist ? (
        <button
          type="button"
          className="lux-flat absolute top-2 right-2 z-10 inline-flex min-h-11 min-w-11 items-center justify-center bg-transparent p-0 text-white transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:opacity-60 motion-safe:active:scale-95"
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
            className={`h-[22px] w-[22px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)] transition-[fill,transform] duration-150 ${
              wishlist.saved
                ? 'fill-white motion-safe:animate-[pulse_0.45s_ease-out]'
                : 'fill-transparent'
            }`}
            strokeWidth={wishlist.saved ? 1.75 : 2}
            aria-hidden
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
        onPointerEnter={() => prefetchListingDetailsPage(isRental ? 'rental' : isStay ? 'stay' : 'tour')}
        className="tv-browse-card__surface group lux-flat block w-full overflow-hidden bg-white text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
        style={{ animationDelay: `${Math.min(index * 35, 240)}ms` }}
        aria-label={`View ${tour.title}. ${priceAria}`}
      >
        <div
          className={`tv-browse-card__media relative overflow-hidden bg-black/[0.04] ${
            size === 'compact' ? 'aspect-[5/4]' : 'aspect-[4/3]'
          }`}
        >
          {heroSrc ? (
            <img
              src={heroSrc}
              alt=""
              loading={index < (size === 'compact' ? 4 : 2) ? 'eager' : 'lazy'}
              fetchPriority={index === 0 ? 'high' : 'low'}
              decoding="async"
              width={size === 'compact' ? 640 : 800}
              height={size === 'compact' ? 512 : 600}
              className="h-full w-full object-cover"
            />
          ) : null}
          <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5 pr-12">
            {isRental ? (
              <span className="tv-browse-chip">{rentalBrowse.badge}</span>
            ) : !isStay ? (
              <span className="tv-browse-chip">Tour</span>
            ) : propertyType ? (
              <span className="tv-browse-chip">{propertyType}</span>
            ) : null}
            {isRental && rentalBrowse.preview ? (
              <span className="tv-browse-chip tv-browse-chip--accent">Preview</span>
            ) : null}
            {!isRental && listingShowsFreeCancellation(tour) ? (
              <span className="tv-browse-chip tv-browse-chip--success">Free cancellation</span>
            ) : null}
          </div>
            {!isRental && hasDiscount && label ? (
            <div className="absolute bottom-2.5 left-2.5">
              <span className="tv-browse-chip bg-[var(--tv-discount-bg,#F8EFEA)] text-[var(--tv-discount-fg,#9A3412)] shadow-none ring-0">
                {label}
              </span>
            </div>
          ) : null}
        </div>
        <div className={size === 'compact' ? 'p-3' : 'px-3.5 py-3'}>
          <p className="tv-meta flex items-center gap-1 truncate">
            <MapPin className="h-3 w-3 shrink-0 text-finland/80" aria-hidden strokeWidth={2} />
            <span className="truncate">{locationLine}</span>
          </p>
          <h3 title={tour.title} className="tv-card-title mt-1 line-clamp-2 break-words [overflow-wrap:anywhere]">
            {tour.title}
          </h3>
          <div className="mt-1.5">
            <ListingCardRating tour={tour} aggregate={reviewAggregate} compact />
          </div>
          {isStay && (guestLabel || bedroomLabel) ? (
            <p className="tv-meta mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
              {guestLabel ? (
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3 shrink-0 opacity-70" aria-hidden strokeWidth={2} />
                  {guestLabel}
                </span>
              ) : null}
              {bedroomLabel ? (
                <span className="inline-flex items-center gap-1">
                  <BedDouble className="h-3 w-3 shrink-0 opacity-70" aria-hidden strokeWidth={2} />
                  {bedroomLabel}
                </span>
              ) : null}
            </p>
          ) : isRental && rentalBrowse.meta ? (
            <p className="tv-meta mt-1 truncate">{rentalBrowse.meta}</p>
          ) : metaLine ? (
            <p className="tv-meta mt-1 truncate">{metaLine}</p>
          ) : null}
          {/* Phase 1803: price row — clearer From + amount hierarchy on browse cards. */}
          <p
            className={`mt-2.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 tabular-nums ${
              isStay && stayStayTotal ? 'text-lg' : 'text-[1.0625rem] sm:text-lg'
            }`}
            aria-label={priceAria}
          >
            {isRental ? (
              rentalBrowse.priceLabel ? (
                <>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">From</span>
                  <span className="font-bold tracking-tight text-ink">{rentalBrowse.priceLabel}</span>
                </>
              ) : (
                <span className="font-bold tracking-tight text-ink">—</span>
              )
            ) : offersUnknown ? (
              <span className="text-[13px] font-medium text-ink-faint">Checking offers…</span>
            ) : isStay && stayStayTotal ? (
              <>
                <span className="font-bold tracking-tight text-ink">
                  {formatMoney(stayStayTotal.total, stayStayTotal.currency)}
                </span>
                <span className="text-[13px] font-medium text-ink-muted">
                  total · {stayStayTotal.nights} night{stayStayTotal.nights === 1 ? '' : 's'}
                </span>
                <span className="w-full text-xs font-medium text-ink-faint">
                  {formatMoney(stayNightly, currency)} / night
                </span>
              </>
            ) : stayQuoteUnavailable || priceUnavailable ? (
              <span className="font-bold tracking-tight text-ink">—</span>
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
                <span
                  className={`font-bold tracking-tight tabular-nums ${
                    hasDiscount && !isStay ? 'text-[var(--tv-discount-fg,#9A3412)]' : 'text-ink'
                  }`}
                >
                  {formatMoney(isStay ? stayNightly : fromAmount, currency)}
                </span>
                <span className="text-[13px] font-medium text-ink-muted">
                  {isStay ? `/ ${unitLabel}` : unitLabel}
                </span>
              </>
            )}
          </p>
          {showTagPills && extraTags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {extraTags.slice(0, 3).map((tagId) => (
                <span key={tagId} className="tv-browse-chip tv-browse-chip--tag">
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
