import { useMemo, useState, useEffect } from 'react';
import { ArrowLeft, MapPin } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { SkeletonCardGrid, Skeleton } from '../components/ui/Skeleton';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { getAllListings } from '../data/listings';
import { isSupabaseConfigured } from '../lib/supabase';
import { usePublishedSupplierListings } from '../hooks/usePublishedSupplierListings';
import { setPageMetaWithOg } from '../lib/seo';
import { TourPackage } from '../types/tour';
import { getReviewAggregatesForListingIds } from '../data/supabase-reviews';
import { fetchDiscountsByListingIds } from '../data/supabase-discounts';
import { isSupabaseListingId } from '../lib/discount-display';
import {
  filterCatalogByFamily,
  inventoryFamilyFromListing,
  listingIsOnTravelerCatalog,
} from '../lib/inventory';
import { isListingVisibleToTravelers } from '../lib/product-workflows';
import { listingHasUpcomingBookableSeason } from '../lib/booking-quote';
import { PublicListingBrowseCard } from '../components/PublicListingBrowseCard';
import { MARKETPLACE_GRID_CLASS } from '../lib/marketplaceBrowse';
import { useTravelerWishlist } from '../hooks/useTravelerWishlist';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';
import { HERO_IMG } from '../lib/heroImages';

const TAG_LABELS: Record<string, string> = {
  'free-cancellation': 'Free cancellation',
  'small-group': 'Small group',
  'pickup-available': 'Pickup available',
  'mobile-ticket': 'Mobile ticket',
};

function slugToLabel(slug: string): string {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

interface DestinationPageProps {
  slug: string | null;
  onTourSelect: (tour: TourPackage) => void;
  onBack: () => void;
  onNavigate?: (page: string) => void;
}

export default function DestinationPage({ slug, onTourSelect, onBack, onNavigate }: DestinationPageProps) {
  const { listings: supplierListings, error: listingsError, reload: reloadCatalog } = usePublishedSupplierListings({
    emptyOnFirstError: false,
  });
  const catalogLoading = isSupabaseConfigured() && supplierListings === null && !listingsError;
  const wishlist = useTravelerWishlist();
  const [reviewAggregates, setReviewAggregates] = useState<Map<string, { rating: number; count: number }>>(
    () => new Map()
  );
  const [discountsByListing, setDiscountsByListing] = useState<
    Map<string, import('../data/supabase-discounts').ListingDiscount[]> | null
  >(null);
  const allListings = useMemo(() => {
    if (isSupabaseConfigured()) {
      // Phase 1356: never invent Destination catalog from localStorage when live fetch is null/failed.
      if (supplierListings !== null) return [...supplierListings];
      return [];
    }
    return getAllListings({ includeSeed: false, includeHolidayPackages: false });
  }, [supplierListings]);

  const { label, listings } = useMemo(() => {
    if (!slug) return { label: '', listings: [] as TourPackage[] };
    const labelFromSlug = slugToLabel(slug);
    const list = allListings.filter(t => {
      if (!isListingVisibleToTravelers(t.status)) return false;
      // Layer B: experience/package rows must not inflate hero counts while rendering zero sections.
      if (!listingIsOnTravelerCatalog(t)) return false;
      // Phase 1263: hide season-ended tours (Packages/sitemap 1260/1261 parity).
      if (
        inventoryFamilyFromListing(t) !== 'stay' &&
        !listingHasUpcomingBookableSeason(t)
      ) {
        return false;
      }
      const countryMatch = (t.country ?? '').toLowerCase().replace(/\s+/g, '-') === slug;
      const cityMatch = (t.city ?? '').toLowerCase().replace(/\s+/g, '-') === slug;
      return countryMatch || cityMatch;
    });
    const label = list[0]?.country === labelFromSlug ? labelFromSlug : (list[0]?.city ?? labelFromSlug);
    return { label: label || labelFromSlug, listings: list };
  }, [slug, allListings]);

  const tourListings = useMemo(() => filterCatalogByFamily(listings, 'tour'), [listings]);
  const stayListings = useMemo(() => filterCatalogByFamily(listings, 'stay'), [listings]);

  const listingIdsForReviews = useMemo(
    () => listings.map((t) => t.id).filter(isSupabaseListingId),
    [listings]
  );
  const listingIdsForReviewsKey = useMemo(() => listingIdsForReviews.join(','), [listingIdsForReviews]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !listingIdsForReviewsKey) {
      setReviewAggregates(new Map());
      setDiscountsByListing(null);
      return;
    }
    const ids = listingIdsForReviewsKey.split(',');
    let cancelled = false;
    // Phase 1193: decouple offers vs reviews — one RPC failure must not block the other.
    void fetchDiscountsByListingIds(ids)
      .then((discounts) => {
        if (!cancelled) setDiscountsByListing(discounts);
      })
      .catch(() => {
        // Phase 1151: empty map → honest list From (not endless "Checking offers…").
        if (!cancelled) setDiscountsByListing(new Map());
      });
    void getReviewAggregatesForListingIds(ids)
      .then((reviews) => {
        if (!cancelled) setReviewAggregates(reviews);
      })
      .catch(() => {
        // Keep prior map — review load failure must not invent empty ratings.
      });
    return () => {
      cancelled = true;
    };
  }, [listingIdsForReviewsKey]);

  useEffect(() => {
    if (!label) return;
    setPageMetaWithOg(
      label,
      `Tours and stays in ${label}. ${tourListings.length} tour${tourListings.length !== 1 ? 's' : ''}${
        stayListings.length > 0
          ? `, ${stayListings.length} stay${stayListings.length !== 1 ? 's' : ''}`
          : ''
      }.`
    );
  }, [label, tourListings.length, stayListings.length]);

  const heroSrc = useMemo(() => {
    const first = listings[0];
    return listingHeroImageSrc(first?.image) ?? HERO_IMG.vacation;
  }, [listings]);

  const countLine = useMemo(() => {
    return [
      tourListings.length > 0
        ? `${tourListings.length} ${tourListings.length === 1 ? 'tour' : 'tours'}`
        : null,
      stayListings.length > 0
        ? `${stayListings.length} ${stayListings.length === 1 ? 'stay' : 'stays'}`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }, [tourListings.length, stayListings.length]);

  if (!slug) {
    if (onNavigate) onNavigate('packages');
    return null;
  }

  return (
    <div className="min-h-screen bg-paper tv-page">
      <section className="relative text-white min-h-[min(42dvh,22rem)] sm:min-h-[min(48dvh,26rem)] flex flex-col justify-end overflow-hidden">
        <div className="page-hero-media" aria-hidden>
          <img src={heroSrc} alt="" decoding="async" width={1600} height={900} className="object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20" aria-hidden />
        <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 sm:pb-8 pt-14">
          <nav
            aria-label="Breadcrumb"
            className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-white/90"
          >
            <button
              type="button"
              onClick={onBack}
              className="lux-flat lux-tap-target inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 ring-1 ring-white/20 backdrop-blur-sm hover:bg-white/25"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden />
              Home
            </button>
            {onNavigate ? (
              <>
                <span className="text-white/50" aria-hidden>
                  /
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('packages')}
                  className="lux-flat lux-tap-target inline-flex min-h-11 items-center rounded-full bg-white/15 px-3 py-1.5 ring-1 ring-white/20 backdrop-blur-sm hover:bg-white/25"
                >
                  Tours
                </button>
                <span className="text-white/50" aria-hidden>
                  /
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('stays')}
                  className="lux-flat lux-tap-target inline-flex min-h-11 items-center rounded-full bg-white/15 px-3 py-1.5 ring-1 ring-white/20 backdrop-blur-sm hover:bg-white/25"
                >
                  Stays
                </button>
                <span className="text-white/50" aria-hidden>
                  /
                </span>
                <span className="rounded-full px-2 py-1 font-medium text-white" aria-current="page">
                  {label}
                </span>
              </>
            ) : (
              <>
                <span className="text-white/50" aria-hidden>
                  /
                </span>
                <span className="rounded-full px-2 py-1 font-medium text-white" aria-current="page">
                  {label}
                </span>
              </>
            )}
          </nav>
          <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80 mb-2">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            Destination
          </p>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl tracking-tight leading-[1.05] break-words [overflow-wrap:anywhere]">{label}</h1>
          {catalogLoading ? (
            <Skeleton className="mt-3 h-4 w-40 bg-white/20" />
          ) : listings.length > 0 ? (
            <p className="mt-3 text-base text-white/85">{countLine}</p>
          ) : (
            <p className="mt-3 text-base text-white/85">Browse when operators publish here.</p>
          )}
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 pb-12 motion-safe:animate-fade-in">
        {listingsError ? (
          <ErrorState
            className="mb-6 py-6"
            title="Destination unavailable"
            body={userFacingError(listingsError, USER_ERROR.listings)}
            retry={{ onClick: () => reloadCatalog() }}
            back={{ onClick: onBack, label: 'Back to home' }}
            extra={
              onNavigate ? (
                <button type="button" onClick={() => onNavigate('contact')} className="tv-btn-ghost">
                  Contact support
                </button>
              ) : (
                <a href="/contact" className="tv-btn-ghost inline-flex">
                  Contact support
                </a>
              )
            }
          />
        ) : null}
        {catalogLoading && listings.length === 0 ? (
          <div aria-busy="true" aria-label="Loading destination">
            <SkeletonCardGrid count={6} />
          </div>
        ) : listings.length === 0 && !listingsError ? (
          <EmptyState
            className="py-10 sm:py-12 max-w-lg"
            icon={MapPin}
            title="Nothing published here yet"
            body={`Nothing is live in ${label} right now. That is normal until an operator lists a tour or stay for this place.`}
            action={
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onBack} className="tv-btn-primary">
                  Browse tours and stays
                </button>
                {onNavigate ? (
                  <button type="button" onClick={() => onNavigate('stays')} className="tv-btn-ghost">
                    Browse stays
                  </button>
                ) : null}
              </div>
            }
          />
        ) : listings.length > 0 ? (
          <div className="space-y-12">
            {tourListings.length > 0 ? (
              <section aria-labelledby="destination-tours-heading">
                <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
                  <h2 id="destination-tours-heading" className="font-display text-2xl sm:text-3xl text-ink tracking-tight">
                    Tours
                  </h2>
                  <p className="text-sm text-ink-muted">
                    {tourListings.length} {tourListings.length === 1 ? 'experience' : 'experiences'} in {label}
                  </p>
                </div>
                <div className={MARKETPLACE_GRID_CLASS}>
                  {tourListings.map((tour, index) => (
                    <PublicListingBrowseCard
                      key={tour.id}
                      tour={tour}
                      index={index}
                      onSelect={() => onTourSelect(tour)}
                      discountsByListing={discountsByListing}
                      reviewAggregate={reviewAggregates.get(tour.id)}
                      tagLabels={TAG_LABELS}
                      size="default"
                      showTagPills={false}
                      wishlist={
                        wishlist.enabled && wishlist.heartsKnown
                          ? {
                              saved: wishlist.isSaved(tour.id),
                              busy: wishlist.busyId === tour.id,
                              onToggle: () => wishlist.toggle(tour.id),
                            }
                          : null
                      }
                    />
                  ))}
                </div>
              </section>
            ) : null}
            {stayListings.length > 0 ? (
              <section aria-labelledby="destination-stays-heading">
                <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
                  <h2 id="destination-stays-heading" className="font-display text-2xl sm:text-3xl text-ink tracking-tight">
                    Stays
                  </h2>
                  <p className="text-sm text-ink-muted">
                    {stayListings.length} {stayListings.length === 1 ? 'place' : 'places'} to stay
                  </p>
                </div>
                <div className={MARKETPLACE_GRID_CLASS}>
                  {stayListings.map((stay, index) => (
                    <PublicListingBrowseCard
                      key={stay.id}
                      tour={stay}
                      index={index}
                      onSelect={() => onTourSelect(stay)}
                      discountsByListing={discountsByListing}
                      reviewAggregate={reviewAggregates.get(stay.id)}
                      tagLabels={TAG_LABELS}
                      size="default"
                      showTagPills={false}
                      wishlist={
                        wishlist.enabled && wishlist.heartsKnown
                          ? {
                              saved: wishlist.isSaved(stay.id),
                              busy: wishlist.busyId === stay.id,
                              onToggle: () => wishlist.toggle(stay.id),
                            }
                          : null
                      }
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
