import { ArrowRight, Search, ShieldCheck, Compass } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { getAllListings } from '../data/listings';
import { filterCatalogByFamily } from '../lib/inventory';
import { getDestinationsFromListings } from '../data/catalogMeta';
import { isSupabaseConfigured } from '../lib/supabase';
import { usePublishedSupplierListings } from '../hooks/usePublishedSupplierListings';
import { TourPackage } from '../types/tour';
import { fetchDiscountsByListingIds } from '../data/supabase-discounts';
import { getReviewAggregatesForListingIds } from '../data/supabase-reviews';
import { isSupabaseListingId } from '../lib/discount-display';
import { PublicListingBrowseCard } from '../components/PublicListingBrowseCard';
import { supplierPortalLandingHref } from '../lib/partnerHost';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { SkeletonCardGrid, SkeletonFeaturedHero, SkeletonPlaceGrid } from '../components/ui/Skeleton';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { TRAVERION_STANDARD_CANCELLATION_POLICY } from '../types/listingExtras';
import { HERO_IMG } from '../lib/heroImages';
import { prefetchPackagesPage } from '../lib/routePrefetch';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';

const TAG_LABELS: Record<string, string> = {
  'free-cancellation': 'Free cancellation',
  'small-group': 'Small group',
  'pickup-available': 'Pickup',
  'mobile-ticket': 'Mobile ticket',
  'bestseller': 'Bestseller',
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
  const [who, setWho] = useState('');
  const [discountsByListing, setDiscountsByListing] = useState<Map<string, import('../data/supabase-discounts').ListingDiscount[]>>(new Map());
  const [reviewAggregates, setReviewAggregates] = useState<Map<string, { rating: number; count: number }>>(
    () => new Map()
  );

  const catalogBase = useMemo(() => {
    const base =
      isSupabaseConfigured() && supplierListings !== null
        ? [...supplierListings]
        : getAllListings({ includeSeed: false, includeHolidayPackages: false });
    return base;
  }, [supplierListings]);

  const allListings = useMemo(() => filterCatalogByFamily(catalogBase, 'tour'), [catalogBase]);
  const stayListings = useMemo(() => filterCatalogByFamily(catalogBase, 'stay'), [catalogBase]);
  const [searchFamily, setSearchFamily] = useState<'tours' | 'stays'>('tours');

  const placeChips = useMemo(() => {
    return getDestinationsFromListings([...allListings, ...stayListings])
      .filter((d) => d.type === 'city' || d.type === 'region')
      .slice(0, 8);
  }, [allListings, stayListings]);

  const displayedListings = useMemo(() => allListings.slice(0, MAX_RESULTS_HOME), [allListings]);
  const featuredListing = displayedListings[0];
  const featuredSrc = featuredListing ? listingHeroImageSrc(featuredListing.image) : undefined;

  const displayedIds = useMemo(
    () => displayedListings.map((t) => t.id).filter(isSupabaseListingId),
    [displayedListings]
  );
  const displayedIdsKey = useMemo(() => displayedIds.join(','), [displayedIds]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !displayedIdsKey) {
      setDiscountsByListing(new Map());
      setReviewAggregates(new Map());
      return;
    }
    const ids = displayedIdsKey.split(',');
    let cancelled = false;
    Promise.all([fetchDiscountsByListingIds(ids), getReviewAggregatesForListingIds(ids)]).then(
      ([discounts, reviews]) => {
        if (cancelled) return;
        setDiscountsByListing(discounts);
        setReviewAggregates(reviews);
      }
    );
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

  const goToStays = (extra?: { q?: string; date?: string; guests?: string }) => {
    if (!onNavigate) return;
    const params = new URLSearchParams();
    const q = (extra?.q ?? searchTerm).trim();
    const date = (extra?.date ?? when).trim();
    const guests = (extra?.guests ?? who).trim();
    if (q) params.set('q', q);
    if (date) params.set('date', date);
    if (guests) params.set('guests', guests);
    const query = params.toString();
    window.history.pushState({}, '', query ? `/stays?${query}` : '/stays');
    onNavigate('stays');
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchFamily === 'stays') goToStays();
    else goToPackages();
  };

  return (
    <div className="min-h-screen bg-paper">
      <section className="relative text-white min-h-[88dvh] flex flex-col justify-end overflow-hidden tv-page">
        <div className="page-hero-media" aria-hidden>
          <img src={HERO_IMG.vacation} alt="" fetchPriority="high" decoding="async" width={1600} height={1067} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/50 to-black/30" aria-hidden />
        <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 sm:pb-16 page-hero-content">
          <p className="page-hero-eyebrow text-xs tracking-[0.22em] uppercase mb-4">Independent travel</p>
          <h1 className="page-hero-title font-display text-4xl sm:text-6xl lg:text-7xl tracking-tight max-w-3xl leading-[1.05] mb-5">
            Book the people who run the day.
          </h1>
          <p className="page-hero-subtitle text-base sm:text-lg mb-8 max-w-xl font-normal">
            Live tours and stays from operators — not a brochure. Free cancellation on tours up to 24 hours before.
          </p>
          <div className="flex gap-1 rounded-full bg-white/15 p-1 mb-3 w-fit">
            <button
              type="button"
              onClick={() => setSearchFamily('tours')}
              className={`lux-flat rounded-full px-4 py-1.5 text-sm font-medium ${
                searchFamily === 'tours' ? 'bg-white text-ink' : 'text-white/80'
              }`}
            >
              Tours
            </button>
            <button
              type="button"
              onClick={() => setSearchFamily('stays')}
              className={`lux-flat rounded-full px-4 py-1.5 text-sm font-medium ${
                searchFamily === 'stays' ? 'bg-white text-ink' : 'text-white/80'
              }`}
            >
              Stays
            </button>
          </div>
          <form
            onSubmit={submitSearch}
            onPointerEnter={prefetchPackagesPage}
            className="bg-paper-raised text-ink rounded-2xl p-2 sm:p-2.5 grid grid-cols-2 sm:grid-cols-[1fr_auto_auto_auto] gap-2 max-w-3xl shadow-soft-xl"
            aria-label={searchFamily === 'stays' ? 'Search stays' : 'Search tours'}
          >
            <label className="sr-only" htmlFor="home-search">Where</label>
            <div className="relative min-w-0 col-span-2 sm:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-faint pointer-events-none" />
              <input
                id="home-search"
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Where"
            className="w-full h-12 sm:h-14 pl-11 pr-4 rounded-xl border-0 text-ink placeholder:text-ink-muted focus:ring-2 focus:ring-finland/30 text-base bg-transparent"
              />
            </div>
            <label className="sr-only" htmlFor="home-when">When</label>
            <input
              id="home-when"
              type="date"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full sm:w-[10.5rem] h-12 sm:h-14 px-3 rounded-xl border-0 text-ink focus:ring-2 focus:ring-finland/30 text-base bg-transparent"
            />
            <label className="sr-only" htmlFor="home-who">Guests</label>
            <input
              id="home-who"
              type="number"
              min={1}
              max={99}
              inputMode="numeric"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              placeholder="Guests"
              className="w-full sm:w-[7.5rem] h-12 sm:h-14 px-3 rounded-xl border-0 text-ink placeholder:text-ink-muted focus:ring-2 focus:ring-finland/30 text-base bg-transparent"
            />
            <button type="submit" className="col-span-2 sm:col-span-1 h-12 sm:h-14 px-8 rounded-xl bg-finland text-white font-semibold hover:bg-finland-dark">
              Search
            </button>
          </form>
        </div>
      </section>

      <section className="py-3 bg-paper">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap gap-x-8 gap-y-1 text-sm text-ink-muted">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-finland" aria-hidden />
            {TRAVERION_STANDARD_CANCELLATION_POLICY.split('.')[0]}.
          </span>
          <span>Pay to confirm — Stripe checkout</span>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl sm:text-4xl text-ink tracking-tight mb-8">Explore</h2>
          {catalogLoading ? (
            <SkeletonPlaceGrid count={6} />
          ) : placeChips.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {placeChips.slice(0, 6).map((p) => {
                const fromInventory =
                  [...allListings, ...stayListings].find(
                    (t) =>
                      (t.city && t.city.toLowerCase() === p.label.toLowerCase()) ||
                      (t.destination && t.destination.toLowerCase().includes(p.label.toLowerCase()))
                  ) ?? null;
                const img = listingHeroImageSrc(fromInventory?.image) ?? HERO_IMG.vacation;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      searchFamily === 'stays' ? goToStays({ q: p.label }) : goToPackages({ destination: p.id })
                    }
                    className="lux-flat relative h-56 sm:h-72 rounded-3xl overflow-hidden text-left group"
                  >
                    <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10" />
                    <span className="absolute bottom-5 left-5 right-5 font-display text-2xl text-white">{p.label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="relative h-72 rounded-3xl overflow-hidden">
                <img src={HERO_IMG.vacation} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6 text-white">
                  <p className="font-display text-2xl mb-2">Operators are listing now</p>
                  <p className="text-sm text-white/80 mb-4">When a tour is published, it appears here for travelers to book.</p>
                  <a href={supplierPortalLandingHref()} className="tv-btn-primary bg-white text-ink hover:bg-paper">
                    List your tours
                  </a>
                </div>
              </div>
              <div className="relative h-72 rounded-3xl overflow-hidden">
                <img src={HERO_IMG.beach} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6 text-white">
                  <p className="font-display text-2xl mb-2">Search anyway</p>
                  <p className="text-sm text-white/80 mb-4">Date and guests still apply as soon as inventory is live.</p>
                  <button type="button" onClick={() => goToPackages()} onPointerEnter={prefetchPackagesPage} className="tv-btn-secondary">
                    Browse tours
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="pb-12 sm:pb-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-3 mb-8">
            <h2 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Tours</h2>
            {!catalogLoading && !listingsError && allListings.length > 0 ? (
              <button type="button" onClick={() => goToPackages()} onPointerEnter={prefetchPackagesPage} className="lux-flat text-sm font-semibold text-finland">
                All tours <ArrowRight className="w-4 h-4 inline" />
              </button>
            ) : null}
          </div>
          {listingsError && supplierListings === null ? (
            <ErrorState
              className="py-8"
              title="Tours unavailable"
              body={userFacingError(listingsError, USER_ERROR.tours)}
              retry={{ onClick: () => reloadCatalog() }}
              extra={
                <a href="/contact" className="tv-btn-ghost inline-flex">
                  Contact support
                </a>
              }
            />
          ) : catalogLoading ? (
            <div aria-busy="true" aria-label="Loading tours">
              <SkeletonFeaturedHero />
              <SkeletonCardGrid count={3} />
            </div>
          ) : allListings.length === 0 ? (
            <EmptyState
              icon={Compass}
              title="No tours yet"
              body="Nothing is live on Traverion right now. That is normal — we do not fill this page with sample listings. When an operator publishes, tours appear here."
              action={
                <a href={supplierPortalLandingHref()} className="tv-btn-primary inline-flex">
                  List your tours
                </a>
              }
            />
          ) : (
            <>
              {featuredListing ? (
                <button
                  type="button"
                  onClick={() => onTourSelect(featuredListing)}
                  className="lux-flat relative w-full h-[22rem] sm:h-[28rem] rounded-3xl overflow-hidden mb-6 text-left group bg-ink/20"
                >
                  {featuredSrc ? (
                    <img
                      src={featuredSrc}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                  <div className="absolute bottom-6 left-6 right-6 text-white">
                    <p className="text-xs uppercase tracking-[0.16em] text-white/70 mb-2">Featured</p>
                    <p className="text-sm text-white/80">{featuredListing.city || featuredListing.destination}</p>
                    <p className="font-display text-3xl sm:text-4xl mt-1">{featuredListing.title}</p>
                  </div>
                </button>
              ) : null}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {displayedListings.slice(1).map((item, index) => (
                  <PublicListingBrowseCard
                    key={item.id}
                    tour={item}
                    index={index}
                    onSelect={() => onTourSelect(item)}
                    discountsByListing={discountsByListing}
                    reviewAggregate={reviewAggregates.get(item.id)}
                    tagLabels={TAG_LABELS}
                    size="default"
                    showTagPills={false}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="pb-16 sm:pb-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-3 mb-8">
            <h2 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Stays</h2>
            {!catalogLoading && stayListings.length > 0 ? (
              <button type="button" onClick={() => goToStays()} className="lux-flat text-sm font-semibold text-finland">
                All stays <ArrowRight className="w-4 h-4 inline" />
              </button>
            ) : null}
          </div>
          {catalogLoading ? (
            <SkeletonCardGrid count={3} />
          ) : stayListings.length === 0 ? (
            <p className="text-ink-muted max-w-xl leading-relaxed">
              No stays are published yet. When an operator lists an apartment or room, it appears here — separate from Tours.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {stayListings.slice(0, 6).map((item, index) => (
                <PublicListingBrowseCard
                  key={item.id}
                  tour={item}
                  index={index}
                  onSelect={() => onTourSelect(item)}
                  discountsByListing={new Map()}
                  tagLabels={{}}
                  size="default"
                  showTagPills={false}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="pb-20 sm:pb-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-black/[0.06] pt-16">
          <h2 className="font-display text-3xl sm:text-4xl text-ink tracking-tight mb-10">Why Traverion</h2>
          <div className="grid sm:grid-cols-3 gap-10 text-[15px] leading-relaxed text-ink-muted">
            <div>
              <p className="font-semibold text-ink mb-2">Real operators</p>
              <p>You book the people who run the day — not a brochure catalog. Price is confirmed at checkout.</p>
            </div>
            <div>
              <p className="font-semibold text-ink mb-2">Clear money</p>
              <p>Pay with Stripe. If checkout cannot start, you see an error. We never pretend a payment succeeded.</p>
            </div>
            <div>
              <p className="font-semibold text-ink mb-2">Tours and stays, separate</p>
              <p>Departures are not nights. Apartments are not tours. Each product keeps its own calendar and rules.</p>
            </div>
          </div>
          <a href={supplierPortalLandingHref()} className="tv-btn-ghost mt-10 -ml-2 inline-flex">
            For operators
          </a>
        </div>
      </section>
    </div>
  );
}
