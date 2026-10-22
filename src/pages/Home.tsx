import { ArrowRight, CalendarCheck, Compass, MapPin, Search, ShieldCheck } from 'lucide-react';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getAllListings } from '../data/listings';
import { filterCatalogByFamily, listingIsFamily } from '../lib/inventory';
import { getDestinationsFromListings } from '../data/catalogMeta';
import { isSupabaseConfigured } from '../lib/supabase';
import { usePublishedSupplierListings } from '../hooks/usePublishedSupplierListings';
import { TourPackage } from '../types/tour';
import { fetchDiscountsByListingIds } from '../data/supabase-discounts';
import { getReviewAggregatesForListingIds } from '../data/supabase-reviews';
import { isSupabaseListingId } from '../lib/discount-display';
import { PublicListingBrowseCard } from '../components/PublicListingBrowseCard';
import {
  MarketplaceSearchFields,
  MarketplaceSearchStack,
} from '../components/marketplace/MarketplaceSearchBar';
import {
  failCloseOrphanStayCheckout,
  HOME_DISCOVERY_GRID_CLASS,
  matchesDestination,
} from '../lib/marketplaceBrowse';
import { listingHasUpcomingBookableSeason } from '../lib/booking-quote';
import { useTravelerWishlist } from '../hooks/useTravelerWishlist';
import { supplierPortalLandingHref } from '../lib/partnerHost';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { SkeletonCardGrid, SkeletonPlaceGrid } from '../components/ui/Skeleton';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { HERO_IMG } from '../lib/heroImages';
import { destinationCoverSrc } from '../lib/destinationCover';
import { prefetchPackagesPage, prefetchStaysPage } from '../lib/routePrefetch';
import { addCalendarDays } from '../lib/stayOccupancy';
import {
  recordTravelerInterest,
  readTravelerInterestSignals,
  scoreListingFromInterest,
  sortListingsByInterest,
  topDestinationInterestLabel,
  type TravelerInterestSignal,
} from '../lib/traveler-interest';

const TAG_LABELS: Record<string, string> = {
  'free-cancellation': 'Free cancellation',
  'small-group': 'Small group',
  'pickup-available': 'Pickup',
  'mobile-ticket': 'Mobile ticket',
};

const MAX_RESULTS_HOME = 12;

interface HomeProps {
  onTourSelect: (tour: TourPackage) => void;
  onNavigate?: (page: string) => void;
}

export default function Home({ onTourSelect, onNavigate }: HomeProps) {
  const { listings: supplierListings, error: listingsError, reload: reloadCatalog } = usePublishedSupplierListings({
    emptyOnFirstError: false,
  });
  const catalogLoading = isSupabaseConfigured() && supplierListings === null && !listingsError;
  const [searchTerm, setSearchTerm] = useState('');
  const [when, setWhen] = useState('');
  const [checkout, setCheckout] = useState('');
  const [who, setWho] = useState('');
  const [discountsByListing, setDiscountsByListing] = useState<Map<
    string,
    import('../data/supabase-discounts').ListingDiscount[]
  > | null>(null);
  const [discountsLoadedForKey, setDiscountsLoadedForKey] = useState<string | null>(null);
  const discountsLoadGenRef = useRef(0);
  const [reviewAggregates, setReviewAggregates] = useState<Map<string, { rating: number; count: number }>>(
    () => new Map()
  );

  const catalogBase = useMemo(() => {
    if (isSupabaseConfigured()) {
      // Phase 1356: never invent Home catalog from localStorage when live fetch is null/failed.
      if (supplierListings !== null) return [...supplierListings];
      return [];
    }
    return getAllListings({ includeSeed: false, includeHolidayPackages: false });
  }, [supplierListings]);

  const allListings = useMemo(
    () =>
      filterCatalogByFamily(catalogBase, 'tour').filter((t) =>
        // Phase 1264: hide season-ended tours (Packages/destination 1260/1263 parity).
        listingHasUpcomingBookableSeason(t)
      ),
    [catalogBase]
  );
  const stayListings = useMemo(() => filterCatalogByFamily(catalogBase, 'stay'), [catalogBase]);
  const [searchFamily, setSearchFamily] = useState<'tours' | 'stays'>('tours');
  const wishlist = useTravelerWishlist();

  const placeChips = useMemo(() => {
    return getDestinationsFromListings([...allListings, ...stayListings])
      .filter((d) => d.type === 'city' || d.type === 'region')
      .slice(0, 8);
  }, [allListings, stayListings]);

  const [interestSignals, setInterestSignals] = useState<TravelerInterestSignal[]>([]);
  useEffect(() => {
    setInterestSignals(readTravelerInterestSignals());
  }, []);

  const openListing = useCallback(
    (tour: TourPackage) => {
      const family = listingIsFamily(tour, 'stay') ? 'stay' : 'tour';
      recordTravelerInterest({ kind: 'listing_view', key: tour.id, family });
      if (tour.city) {
        recordTravelerInterest({ kind: 'destination_view', key: tour.city, family: 'destination' });
      }
      void import('../lib/listing-traffic').then(({ trackListingTraffic }) => {
        trackListingTraffic(tour.id, 'impression');
      });
      setInterestSignals(readTravelerInterestSignals());
      onTourSelect(tour);
    },
    [onTourSelect]
  );

  const displayedListings = useMemo(() => {
    const ranked = sortListingsByInterest(allListings, (item) =>
      scoreListingFromInterest({
        listingId: item.id,
        city: item.city,
        country: item.country,
        destination: item.destination,
        family: 'tour',
        signals: interestSignals,
      })
    );
    return ranked.slice(0, MAX_RESULTS_HOME);
  }, [allListings, interestSignals]);
  const interestPlace = useMemo(() => topDestinationInterestLabel(interestSignals), [interestSignals]);
  const toursSectionTitle = interestPlace
    ? `Continue exploring ${interestPlace}`
    : 'Find your next extraordinary experience';
  const toursSectionEyebrow = interestPlace ? 'Inspired by you' : 'Experiences';
  const toursSectionSubtitle = interestPlace
    ? 'Experiences you might love next.'
    : 'Tours published by operators on Traverion.';
  const displayedStayListings = useMemo(() => {
    const ranked = sortListingsByInterest(stayListings, (item) =>
      scoreListingFromInterest({
        listingId: item.id,
        city: item.city,
        country: item.country,
        destination: item.destination,
        family: 'stay',
        signals: interestSignals,
      })
    );
    return ranked.slice(0, 8);
  }, [stayListings, interestSignals]);
  const staysSectionTitle = interestPlace ? `Stays near ${interestPlace}` : 'Places to stay';
  const staysSectionEyebrow = interestPlace ? 'Inspired by you' : 'Stays';
  const staysSectionSubtitle = interestPlace
    ? 'Places to stay near your recent discoveries.'
    : 'Nights from operators — separate from tour departures.';

  const displayedIds = useMemo(() => {
    const tourIds = displayedListings.map((t) => t.id).filter(isSupabaseListingId);
    const stayIds = displayedStayListings.map((t) => t.id).filter(isSupabaseListingId);
    return [...new Set([...tourIds, ...stayIds])];
  }, [displayedListings, displayedStayListings]);
  const displayedIdsKey = useMemo(() => displayedIds.join(','), [displayedIds]);
  const discountsForDisplayedCatalog =
    discountsLoadedForKey === displayedIdsKey ? discountsByListing : null;

  useEffect(() => {
    if (!isSupabaseConfigured() || !displayedIdsKey) {
      setDiscountsByListing(null);
      setDiscountsLoadedForKey(null);
      setReviewAggregates(new Map());
      return;
    }
    const ids = displayedIdsKey.split(',');
    const keyAtStart = displayedIdsKey;
    const gen = ++discountsLoadGenRef.current;
    setDiscountsByListing(null);
    setDiscountsLoadedForKey(null);
    let cancelled = false;
    // Phase 1193: decouple offers vs reviews — one RPC failure must not block the other.
    void fetchDiscountsByListingIds(ids)
      .then((discounts) => {
        if (cancelled || gen !== discountsLoadGenRef.current) return;
        setDiscountsByListing(discounts);
        setDiscountsLoadedForKey(keyAtStart);
      })
      .catch(() => {
        // Phase 1151: empty map → honest list From (not endless "Checking offers…").
        if (cancelled || gen !== discountsLoadGenRef.current) return;
        setDiscountsByListing(new Map());
        setDiscountsLoadedForKey(keyAtStart);
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
  }, [displayedIdsKey]);

  const goToPackages = (extra?: { q?: string; destination?: string; date?: string; guests?: string }) => {
    if (!onNavigate) return;
    const params = new URLSearchParams();
    const q = (extra?.q ?? searchTerm).trim();
    const destText = extra?.destination?.trim();
    const date = (extra?.date ?? when).trim();
    const guests = (extra?.guests ?? who).trim();
    if (destText) {
      const match = placeChips.find(
        (p) => p.id === destText || p.label.toLowerCase() === destText.toLowerCase()
      );
      if (match) params.set('destination', match.id);
      else params.set('q', destText);
    } else if (q) {
      params.set('q', q);
    }
    if (date) params.set('date', date);
    if (guests) params.set('guests', guests);
    const query = params.toString();
    window.history.pushState({}, '', query ? `/packages?${query}` : '/packages');
    onNavigate('packages');
  };

  const goToStays = (extra?: { q?: string; date?: string; checkout?: string; guests?: string }) => {
    if (!onNavigate) return;
    const params = new URLSearchParams();
    const q = (extra?.q ?? searchTerm).trim();
    const normalized = failCloseOrphanStayCheckout(extra?.date ?? when, extra?.checkout ?? checkout);
    const date = normalized.checkIn;
    const out = normalized.checkOut;
    const guests = (extra?.guests ?? who).trim();
    if (!date && checkout.trim()) setCheckout('');
    if (q) params.set('q', q);
    if (date) {
      params.set('date', date);
      const nightOut = out && out > date ? out : addCalendarDays(date, 1);
      params.set('checkout', nightOut);
    }
    if (guests) params.set('guests', guests);
    const query = params.toString();
    window.history.pushState({}, '', query ? `/stays?${query}` : '/stays');
    onNavigate('stays');
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchTerm.trim();
    if (q) {
      recordTravelerInterest({
        kind: 'search',
        key: q,
        family: searchFamily === 'stays' ? 'stay' : 'tour',
      });
      setInterestSignals(readTravelerInterestSignals());
    }
    if (searchFamily === 'stays') goToStays();
    else goToPackages();
  };

  const familyTabs = (
    <div
      className="flex w-fit gap-1 rounded-full bg-white/15 p-1 ring-1 ring-white/20 backdrop-blur-sm"
      role="tablist"
      aria-label="What to search"
    >
      <button
        type="button"
        role="tab"
        aria-selected={searchFamily === 'tours'}
        onClick={() => setSearchFamily('tours')}
        className={`lux-flat min-h-10 flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
          searchFamily === 'tours'
            ? 'bg-white text-ink shadow-sm ring-2 ring-white'
            : 'text-white/80 hover:bg-white/10 hover:text-white'
        }`}
      >
        Tours
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={searchFamily === 'stays'}
        onClick={() => setSearchFamily('stays')}
        className={`lux-flat min-h-10 flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
          searchFamily === 'stays'
            ? 'bg-white text-ink shadow-sm ring-2 ring-white'
            : 'text-white/80 hover:bg-white/10 hover:text-white'
        }`}
      >
        Stays
      </button>
    </div>
  );

  const searchValues = useMemo(
    () => ({ where: searchTerm, date: when, checkout, guests: who }),
    [searchTerm, when, checkout, who]
  );

  const searchFields = (idPrefix: string, stacked = false) => (
    <MarketplaceSearchFields
      family={searchFamily}
      values={searchValues}
      onChange={(patch) => {
        if (patch.where !== undefined) setSearchTerm(patch.where);
        if (patch.date !== undefined) setWhen(patch.date);
        if (patch.checkout !== undefined) setCheckout(patch.checkout);
        if (patch.guests !== undefined) setWho(patch.guests);
      }}
      idPrefix={idPrefix}
      stacked={stacked}
    />
  );

  return (
    <div className="min-h-screen bg-paper">
      <section className="relative flex min-h-[min(68dvh,38rem)] flex-col justify-end overflow-hidden bg-ink text-white tv-page sm:min-h-[min(62dvh,36rem)]">
        <div className="page-hero-media" aria-hidden>
          <img src={HERO_IMG.vacation} alt="" fetchPriority="high" decoding="async" width={1600} height={1067} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/55 to-black/35" aria-hidden />
        {/* Phase 1801: left vignette keeps brand/headline legible on bright coastal heroes. */}
        <div
          className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/15 to-transparent"
          aria-hidden
        />
        <div className="tv-rise relative z-10 w-full tv-shell px-4 pb-6 page-hero-content sm:px-6 sm:pb-12 lg:px-8 lg:pb-14">
          {/* Phase 1801: brand dominates first viewport — headline must not overpower TRAVERION. */}
          <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-white/80 sm:mb-3">TRAVERION</p>
          <h1 className="page-hero-title mb-2 max-w-2xl font-sans text-3xl font-bold leading-[1.08] tracking-tight sm:mb-3 sm:text-4xl lg:text-[2.65rem]">
            Discover remarkable experiences and stays.
          </h1>
          <p className="page-hero-subtitle mb-5 max-w-md text-sm font-normal leading-relaxed text-white/90 sm:mb-7 sm:text-base">
            Book tours and nights directly with the people who run them.
          </p>

          {/* Mobile: vertical floating search card on the hero */}
          <div className="mx-auto w-full max-w-lg sm:hidden">
            <div className="mb-3 flex justify-center">{familyTabs}</div>
            <div id="home-mobile-search-dialog">
              <MarketplaceSearchStack
                family={searchFamily}
                values={searchValues}
                onChange={(patch) => {
                  if (patch.where !== undefined) setSearchTerm(patch.where);
                  if (patch.date !== undefined) setWhen(patch.date);
                  if (patch.checkout !== undefined) setCheckout(patch.checkout);
                  if (patch.guests !== undefined) setWho(patch.guests);
                }}
                idPrefix="home-mobile"
                onSubmit={submitSearch}
                submitLabel="Search"
                ariaLabel={searchFamily === 'stays' ? 'Search stays' : 'Search tours'}
                className="text-ink"
              />
            </div>
          </div>

          {/* Desktop: floating pill across the lower hero */}
          <div
            className="mx-auto hidden w-full max-w-5xl space-y-3 sm:block"
            onPointerEnter={() => (searchFamily === 'stays' ? prefetchStaysPage() : prefetchPackagesPage())}
          >
            {familyTabs}
            <form
              onSubmit={submitSearch}
              className={`grid items-center gap-0 overflow-visible rounded-full bg-white p-1.5 text-ink shadow-[0_16px_48px_-14px_rgba(7,26,58,0.35),0_6px_18px_-8px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.04] ${
                searchFamily === 'stays'
                  ? 'grid-cols-[minmax(0,1.2fr)_auto_minmax(0,0.95fr)_auto_minmax(0,0.95fr)_auto_minmax(0,0.85fr)_auto]'
                  : 'grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1.05fr)_auto_minmax(0,0.95fr)_auto]'
              }`}
              aria-label={searchFamily === 'stays' ? 'Search stays' : 'Search tours'}
            >
              {searchFields('home')}
              <button
                type="submit"
                className="mx-1 flex h-14 items-center justify-center gap-2 self-center rounded-full bg-finland px-7 text-[15px] font-semibold text-white shadow-sm hover:bg-finland-dark"
              >
                <Search className="h-4 w-4" aria-hidden />
                Search
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="py-4 bg-paper">
        <div className="tv-shell px-4 sm:px-6 lg:px-8">
          <p className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-muted">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-finland" aria-hidden />
              Cancellation terms on each listing
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-finland" aria-hidden />
              Secure checkout · manage everything in Trips
            </span>
          </p>
        </div>
      </section>

      <section className="tv-section">
        <div className="tv-content">
          <div className="mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">Destinations</p>
            <h2 className="font-sans text-2xl font-bold tracking-tight text-[#111827] sm:text-3xl">Explore somewhere unforgettable</h2>
            <p className="mt-2 text-sm text-ink-muted max-w-lg">
              Places with published tours and stays on Traverion.
            </p>
          </div>
          {catalogLoading ? (
            <SkeletonPlaceGrid count={6} />
          ) : placeChips.length > 0 ? (
            <div className="tv-dest-grid">
              {placeChips.slice(0, 12).map((p) => {
                const matches = [...allListings, ...stayListings].filter((t) =>
                  matchesDestination(t, p.id, [p])
                );
                const img = destinationCoverSrc(p.id);
                const tourCount = matches.filter((t) => listingIsFamily(t, 'tour')).length;
                const stayCount = matches.filter((t) => listingIsFamily(t, 'stay')).length;
                const countLabel =
                  tourCount > 0 && stayCount > 0
                    ? `${tourCount} ${tourCount === 1 ? 'tour' : 'tours'} · ${stayCount} ${
                        stayCount === 1 ? 'stay' : 'stays'
                      }`
                    : tourCount > 0
                      ? `${tourCount} ${tourCount === 1 ? 'tour' : 'tours'}`
                      : stayCount > 0
                        ? `${stayCount} ${stayCount === 1 ? 'stay' : 'stays'}`
                        : null;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-label={countLabel ? `${p.label}, ${countLabel}` : p.label}
                    onClick={() => {
                      recordTravelerInterest({
                        kind: 'destination_view',
                        key: p.label,
                        family: 'destination',
                      });
                      setInterestSignals(readTravelerInterestSignals());
                      if (onNavigate) onNavigate(`destinations/${p.id}`);
                      else goToPackages({ destination: p.id });
                    }}
                    className="tv-dest-tile lux-flat focus-visible:ring-2 focus-visible:ring-finland focus-visible:ring-offset-2"
                  >
                    <img src={img} alt="" loading="lazy" decoding="async" />
                    <span className="tv-dest-tile-label">
                      <span className="block font-display text-base sm:text-lg leading-tight">{p.label}</span>
                      {countLabel ? (
                        <span className="mt-0.5 block text-[11px] text-white/80" aria-hidden>
                          {countLabel}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="relative h-64 rounded-2xl overflow-hidden shadow-soft ring-1 ring-black/[0.06] bg-ink">
                <img src={HERO_IMG.vacation} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6 text-white">
                  <p className="font-display text-2xl mb-2">Operators are listing now</p>
                  <p className="text-sm text-white/80 mb-4">
                    When a tour is published, destination discovery appears here.
                  </p>
                  <a href={supplierPortalLandingHref()} className="tv-btn-primary bg-white text-ink hover:bg-paper">
                    List your tours and stays
                  </a>
                </div>
              </div>
              <div className="relative h-64 rounded-2xl overflow-hidden bg-ink">
                <img src={HERO_IMG.beach} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6 text-white">
                  <p className="font-display text-2xl mb-2">Browse anyway</p>
                  <p className="text-sm text-white/80 mb-4">Explore tours and stays as soon as inventory is live.</p>
                  <button
                    type="button"
                    onClick={() => goToPackages()}
                    onPointerEnter={prefetchPackagesPage}
                    className="tv-btn-secondary"
                  >
                    Browse tours
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="tv-section tv-section-muted tv-section-divider">
        <div className="tv-content">
          <div className="flex items-end justify-between gap-3 mb-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">{toursSectionEyebrow}</p>
              <h2 className="font-sans text-2xl font-bold tracking-tight text-[#111827] sm:text-3xl">{toursSectionTitle}</h2>
              <p className="mt-2 text-sm text-ink-muted">{toursSectionSubtitle}</p>
            </div>
            {!catalogLoading && allListings.length > 0 ? (
              <button
                type="button"
                onClick={() => goToPackages()}
                onPointerEnter={prefetchPackagesPage}
                className="tv-section-cta lux-flat"
              >
                All tours <ArrowRight className="w-4 h-4" aria-hidden />
              </button>
            ) : null}
          </div>
          {listingsError ? (
            <ErrorState
              className="mb-6 py-6"
              title="Tours unavailable"
              body={userFacingError(listingsError, USER_ERROR.tours)}
              retry={{ onClick: () => reloadCatalog() }}
              extra={
                <a href="/contact" className="tv-btn-ghost inline-flex">
                  Contact support
                </a>
              }
            />
          ) : null}
          {catalogLoading && allListings.length === 0 ? (
            <div aria-busy="true" aria-label="Loading tours">
              <SkeletonCardGrid count={4} />
            </div>
          ) : allListings.length === 0 && !listingsError ? (
            <EmptyState
              className="py-8 max-w-lg"
              icon={Compass}
              title="No tours published yet"
              body="When an operator goes live, tours appear here."
              action={
                <a href={supplierPortalLandingHref()} className="tv-btn-primary inline-flex">
                  List your tours and stays
                </a>
              }
            />
          ) : allListings.length > 0 ? (
            <div className={HOME_DISCOVERY_GRID_CLASS}>
              {displayedListings.map((item, index) => (
                <PublicListingBrowseCard
                  key={item.id}
                  tour={item}
                  index={index}
                  onSelect={() => openListing(item)}
                  discountsByListing={discountsForDisplayedCatalog}
                  reviewAggregate={reviewAggregates.get(item.id)}
                  tagLabels={TAG_LABELS}
                  size="compact"
                  showTagPills
                  wishlist={
                    wishlist.enabled && wishlist.heartsKnown
                      ? {
                          saved: wishlist.isSaved(item.id),
                          busy: wishlist.busyId === item.id,
                          onToggle: () => wishlist.toggle(item.id),
                        }
                      : null
                  }
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="tv-section">
        <div className="tv-content">
          <div className="flex items-end justify-between gap-3 mb-5">
            <div>
              {/* Phase 1680: stays personalization eyebrow/subtitle match tours For you honesty. */}
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">
                {staysSectionEyebrow}
              </p>
              <h2 className="font-sans text-2xl font-bold tracking-tight text-[#111827] sm:text-3xl">{staysSectionTitle}</h2>
              <p className="mt-2 text-sm text-ink-muted">{staysSectionSubtitle}</p>
            </div>
            {!catalogLoading && stayListings.length > 0 ? (
              <button type="button" onClick={() => goToStays()} className="tv-section-cta lux-flat">
                All stays <ArrowRight className="w-4 h-4" aria-hidden />
              </button>
            ) : null}
          </div>
          {listingsError ? (
            <ErrorState
              className="mb-6 py-6"
              title="Stays unavailable"
              body={userFacingError(listingsError, USER_ERROR.stays)}
              retry={{ onClick: () => reloadCatalog() }}
              extra={
                <a href="/contact" className="tv-btn-ghost inline-flex">
                  Contact support
                </a>
              }
            />
          ) : null}
          {catalogLoading && stayListings.length === 0 ? (
            <SkeletonCardGrid count={3} />
          ) : stayListings.length === 0 && !listingsError ? (
            <EmptyState
              icon={Compass}
              title="No stays published yet"
              body="When an operator publishes a stay, it appears here — separate from Tours."
              action={
                <a href={supplierPortalLandingHref()} className="tv-btn-primary inline-flex">
                  List a stay
                </a>
              }
            />
          ) : stayListings.length > 0 ? (
            <div className={HOME_DISCOVERY_GRID_CLASS}>
              {displayedStayListings.map((item, index) => (
                <PublicListingBrowseCard
                  key={item.id}
                  tour={item}
                  index={index}
                  onSelect={() => openListing(item)}
                  discountsByListing={discountsForDisplayedCatalog}
                  reviewAggregate={reviewAggregates.get(item.id)}
                  tagLabels={{}}
                  size="compact"
                  showTagPills={false}
                  wishlist={
                    wishlist.enabled && wishlist.heartsKnown
                      ? {
                          saved: wishlist.isSaved(item.id),
                          busy: wishlist.busyId === item.id,
                          onToggle: () => wishlist.toggle(item.id),
                        }
                      : null
                  }
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="tv-section tv-section-muted tv-section-divider">
        <div className="tv-content">
          <h2 className="mb-2 font-sans text-2xl font-bold tracking-tight text-[#111827] sm:text-3xl">
            Why book with Traverion
          </h2>
          <p className="mb-6 max-w-xl text-sm leading-relaxed text-ink-muted">
            Tours and stays from independent operators — with clear prices before you pay.
          </p>
          <ul className="grid gap-6 border-t border-[#E6EAF0] pt-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Compass,
                title: 'One place to explore',
                body: 'Browse tours and stays from operators who publish directly on Traverion.',
              },
              {
                icon: ShieldCheck,
                title: 'Clear before you pay',
                body: 'See the option, date, and price before checkout — including each listing’s cancellation terms.',
              },
              {
                icon: MapPin,
                title: 'Book the people who run it',
                body: 'Reserve with the operators who deliver the experience, not a generic reseller catalog.',
              },
              {
                icon: CalendarCheck,
                title: 'Trips stays with you',
                body: 'Find upcoming and past bookings anytime in Trips.',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className="flex gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F5F6F8] text-[#0B397E]">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="font-semibold text-[#111827]">{item.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-muted">{item.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
