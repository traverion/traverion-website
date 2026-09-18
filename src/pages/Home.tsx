import { ArrowRight, Search, ShieldCheck, Compass } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { getAllListings } from '../data/listings';
import { filterCatalogByFamily, listingIsFamily } from '../lib/inventory';
import { getDestinationsFromListings } from '../data/catalogMeta';
import { isSupabaseConfigured } from '../lib/supabase';
import { usePublishedSupplierListings } from '../hooks/usePublishedSupplierListings';
import { TourPackage } from '../types/tour';
import { fetchDiscountsByListingIds } from '../data/supabase-discounts';
import { getReviewAggregatesForListingIds } from '../data/supabase-reviews';
import { isSupabaseListingId, getDisplayPriceForTour } from '../lib/discount-display';
import { formatMoney, normalizeCurrency } from '../lib/money';
import { PublicListingBrowseCard } from '../components/PublicListingBrowseCard';
import { supplierPortalLandingHref } from '../lib/partnerHost';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { SkeletonCardGrid, SkeletonFeaturedHero, SkeletonPlaceGrid } from '../components/ui/Skeleton';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { HERO_IMG } from '../lib/heroImages';
import { prefetchPackagesPage } from '../lib/routePrefetch';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';
import { addCalendarDays } from '../lib/stayOccupancy';

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
  const [checkout, setCheckout] = useState('');
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

  const goToStays = (extra?: { q?: string; date?: string; checkout?: string; guests?: string }) => {
    if (!onNavigate) return;
    const params = new URLSearchParams();
    const q = (extra?.q ?? searchTerm).trim();
    const date = (extra?.date ?? when).trim();
    const out = (extra?.checkout ?? checkout).trim();
    const guests = (extra?.guests ?? who).trim();
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
    if (searchFamily === 'stays') goToStays();
    else goToPackages();
  };

  return (
    <div className="min-h-screen bg-paper">
      <section className="relative text-white min-h-[min(92dvh,52rem)] flex flex-col justify-end overflow-hidden tv-page">
        <div className="page-hero-media" aria-hidden>
          <img src={HERO_IMG.vacation} alt="" fetchPriority="high" decoding="async" width={1600} height={1067} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/45 to-black/25" aria-hidden />
        <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 sm:pb-14 page-hero-content">
          <p className="font-display text-3xl sm:text-4xl tracking-[0.04em] text-white mb-3 sm:mb-4">TRAVERION</p>
          <h1 className="page-hero-title font-display text-3xl sm:text-5xl lg:text-6xl tracking-tight max-w-2xl leading-[1.08] mb-4">
            Tours and stays from people who run the day.
          </h1>
          <p className="page-hero-subtitle text-base sm:text-lg mb-7 max-w-lg font-normal text-white/90">
            Independent operators. Live availability. Pay on Stripe to confirm.
          </p>
          <div
            className="flex gap-1 rounded-full bg-white/15 p-1 mb-3 w-fit ring-1 ring-white/20 backdrop-blur-sm"
            role="tablist"
            aria-label="What to search"
          >
            <button
              type="button"
              role="tab"
              aria-selected={searchFamily === 'tours'}
              onClick={() => setSearchFamily('tours')}
              className={`lux-flat rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
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
              className={`lux-flat rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                searchFamily === 'stays'
                  ? 'bg-white text-ink shadow-sm ring-2 ring-white'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              Stays
            </button>
          </div>
          <form
            onSubmit={submitSearch}
            onPointerEnter={prefetchPackagesPage}
            className={`bg-paper-raised text-ink rounded-2xl sm:rounded-full p-2 sm:p-1.5 grid grid-cols-1 gap-1 max-w-3xl shadow-soft-xl ring-1 ring-black/[0.06] ${
              searchFamily === 'stays'
                ? 'sm:grid-cols-[1.2fr_0.9fr_0.9fr_0.75fr_auto]'
                : 'sm:grid-cols-[1.4fr_1fr_0.85fr_auto]'
            }`}
            aria-label={searchFamily === 'stays' ? 'Search stays' : 'Search tours'}
          >
            <div className="relative min-w-0 rounded-xl sm:rounded-full px-3.5 py-2 hover:bg-black/[0.03] focus-within:bg-black/[0.03] focus-within:ring-2 focus-within:ring-finland/25 transition-colors">
              <label htmlFor="home-search" className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                Where
              </label>
              <div className="relative">
                <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
                <input
                  id="home-search"
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={searchFamily === 'stays' ? 'City or stay' : 'City or tour'}
                  className="w-full h-9 pl-6 pr-2 border-0 text-ink placeholder:text-ink-muted focus:ring-0 text-[15px] bg-transparent"
                />
              </div>
            </div>
            <div className="relative min-w-0 rounded-xl sm:rounded-full px-3.5 py-2 hover:bg-black/[0.03] focus-within:bg-black/[0.03] focus-within:ring-2 focus-within:ring-finland/25 transition-colors">
              <label htmlFor="home-when" className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                {searchFamily === 'stays' ? 'Check-in' : 'Date'}
              </label>
              <input
                id="home-when"
                type="date"
                value={when}
                onChange={(e) => {
                  const next = e.target.value;
                  setWhen(next);
                  if (checkout && next && checkout <= next) {
                    setCheckout(addCalendarDays(next, 1));
                  }
                }}
                className="w-full h-9 border-0 text-ink focus:ring-0 text-[15px] bg-transparent"
              />
            </div>
            {searchFamily === 'stays' ? (
              <div className="relative min-w-0 rounded-xl sm:rounded-full px-3.5 py-2 hover:bg-black/[0.03] focus-within:bg-black/[0.03] focus-within:ring-2 focus-within:ring-finland/25 transition-colors">
                <label htmlFor="home-checkout" className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                  Check-out
                </label>
                <input
                  id="home-checkout"
                  type="date"
                  value={checkout}
                  min={when ? addCalendarDays(when, 1) : undefined}
                  onChange={(e) => setCheckout(e.target.value)}
                  className="w-full h-9 border-0 text-ink focus:ring-0 text-[15px] bg-transparent"
                />
              </div>
            ) : null}
            <div className="relative min-w-0 rounded-xl sm:rounded-full px-3.5 py-2 hover:bg-black/[0.03] focus-within:bg-black/[0.03] focus-within:ring-2 focus-within:ring-finland/25 transition-colors">
              <label htmlFor="home-who" className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                {searchFamily === 'stays' ? 'Guests' : 'Travelers'}
              </label>
              <input
                id="home-who"
                type="number"
                min={1}
                max={99}
                inputMode="numeric"
                value={who}
                onChange={(e) => setWho(e.target.value)}
                placeholder="Guests"
                className="w-full h-9 border-0 text-ink placeholder:text-ink-muted focus:ring-0 text-[15px] bg-transparent"
              />
            </div>
            <button
              type="submit"
              className="h-12 sm:h-14 sm:self-center px-7 rounded-xl sm:rounded-full bg-finland text-white font-semibold hover:bg-finland-dark shadow-sm"
            >
              Search
            </button>
          </form>
        </div>
      </section>

      <section className="py-4 bg-paper">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-muted">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-finland" aria-hidden />
              Free cancellation up to 24 hours before
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-finland" aria-hidden />
              Pay to confirm · Stripe TEST until live
            </span>
          </p>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Where can I go?</h2>
            <p className="mt-2 text-sm text-ink-muted max-w-lg">
              Destinations with live inventory on Traverion — only places operators have published.
            </p>
          </div>
          {catalogLoading ? (
            <SkeletonPlaceGrid count={6} />
          ) : placeChips.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {placeChips.slice(0, 6).map((p) => {
                const matches = [...allListings, ...stayListings].filter(
                  (t) =>
                    (t.city && t.city.toLowerCase() === p.label.toLowerCase()) ||
                    (t.country && t.country.toLowerCase() === p.label.toLowerCase()) ||
                    (t.destination && t.destination.toLowerCase().includes(p.label.toLowerCase()))
                );
                const fromInventory = matches[0] ?? null;
                const img = listingHeroImageSrc(fromInventory?.image) ?? HERO_IMG.vacation;
                const tourCount = matches.filter((t) => listingIsFamily(t, 'tour')).length;
                const stayCount = matches.filter((t) => listingIsFamily(t, 'stay')).length;
                const countLabel =
                  searchFamily === 'stays'
                    ? stayCount > 0
                      ? `${stayCount} ${stayCount === 1 ? 'stay' : 'stays'}`
                      : null
                    : tourCount > 0 && stayCount > 0
                      ? `${tourCount} ${tourCount === 1 ? 'tour' : 'tours'} · ${stayCount} ${stayCount === 1 ? 'stay' : 'stays'}`
                      : tourCount > 0
                        ? `${tourCount} ${tourCount === 1 ? 'tour' : 'tours'}`
                        : stayCount > 0
                          ? `${stayCount} ${stayCount === 1 ? 'stay' : 'stays'}`
                          : null;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      searchFamily === 'stays' ? goToStays({ q: p.label }) : goToPackages({ destination: p.id })
                    }
                    className="lux-flat relative aspect-[4/5] sm:aspect-[5/4] rounded-2xl overflow-hidden text-left group shadow-soft ring-1 ring-black/[0.06]"
                  >
                    <img
                      src={img}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                    <span className="absolute bottom-4 left-4 right-4">
                      <span className="block font-display text-xl sm:text-2xl text-white">{p.label}</span>
                      {countLabel ? (
                        <span className="mt-0.5 block text-xs sm:text-sm text-white/80">{countLabel}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="relative h-72 rounded-2xl overflow-hidden shadow-soft ring-1 ring-black/[0.06]">
                <img src={HERO_IMG.vacation} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6 text-white">
                  <p className="font-display text-2xl mb-2">Operators are listing now</p>
                  <p className="text-sm text-white/80 mb-4">
                    When a tour is published, it appears here for travelers to book.
                  </p>
                  <a href={supplierPortalLandingHref()} className="tv-btn-primary bg-white text-ink hover:bg-paper">
                    List your tours
                  </a>
                </div>
              </div>
              <div className="relative h-72 rounded-2xl overflow-hidden">
                <img src={HERO_IMG.beach} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6 text-white">
                  <p className="font-display text-2xl mb-2">Browse anyway</p>
                  <p className="text-sm text-white/80 mb-4">
                    Date and guests still apply as soon as inventory is live.
                  </p>
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

      <section className="pb-12 sm:pb-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-3 mb-8">
            <div>
              <h2 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">What can I book?</h2>
              <p className="mt-2 text-sm text-ink-muted">Live tours from operators — not sample inventory.</p>
            </div>
            {!catalogLoading && !listingsError && allListings.length > 0 ? (
              <button
                type="button"
                onClick={() => goToPackages()}
                onPointerEnter={prefetchPackagesPage}
                className="lux-flat text-sm font-semibold text-finland"
              >
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
                  className="lux-flat relative w-full h-[20rem] sm:h-[26rem] rounded-2xl overflow-hidden mb-6 text-left group bg-ink/20"
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
                    <p className="text-xs uppercase tracking-[0.16em] text-white/70 mb-2">Recommended</p>
                    <p className="text-sm text-white/80">{featuredListing.city || featuredListing.destination}</p>
                    <p className="font-display text-3xl sm:text-4xl mt-1">{featuredListing.title}</p>
                    {(() => {
                      const { price, qualifier, summary } = getDisplayPriceForTour(
                        featuredListing,
                        discountsByListing
                      );
                      const currency = normalizeCurrency(featuredListing.price?.currency);
                      return (
                        <p className="mt-2 text-sm sm:text-base font-semibold tabular-nums text-white">
                          From {formatMoney(Number(price), currency)}
                          {qualifier ? ` per ${qualifier}` : ' per person'}
                          {summary ? (
                            <span className="block mt-0.5 font-medium text-white/80">{summary}</span>
                          ) : null}
                        </p>
                      );
                    })()}
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
            <div>
              <h2 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Stays</h2>
              <p className="mt-2 text-sm text-ink-muted">Nights from operators — separate from tour departures.</p>
            </div>
            {!catalogLoading && stayListings.length > 0 ? (
              <button type="button" onClick={() => goToStays()} className="lux-flat text-sm font-semibold text-finland">
                All stays <ArrowRight className="w-4 h-4 inline" />
              </button>
            ) : null}
          </div>
          {catalogLoading ? (
            <SkeletonCardGrid count={3} />
          ) : stayListings.length === 0 ? (
            <EmptyState
              icon={Compass}
              title="No stays published yet"
              body="Traverion does not fill this page with sample apartments. When an operator publishes a stay, it appears here — separate from Tours."
              action={
                <a href={supplierPortalLandingHref()} className="tv-btn-primary inline-flex">
                  List a stay
                </a>
              }
            />
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">Trust</p>
          <h2 className="font-display text-3xl sm:text-4xl text-ink tracking-tight mb-3">Why book on Traverion</h2>
          <p className="text-sm text-ink-muted mb-10 max-w-xl leading-relaxed">
            A marketplace for independent operators — clear booking truth, honest money, separate product types.
          </p>
          <div className="grid sm:grid-cols-3 gap-6 sm:gap-8">
            <div className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">01</p>
              <p className="font-semibold text-ink mb-2">Real operators</p>
              <p className="text-[15px] leading-relaxed text-ink-muted">
                You book the people who run the day. Price is confirmed at checkout — not guessed on the card.
              </p>
            </div>
            <div className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">02</p>
              <p className="font-semibold text-ink mb-2">Clear money</p>
              <p className="text-[15px] leading-relaxed text-ink-muted">
                Pay with Stripe. Trips is your confirmation of record — we do not invent email receipts.
              </p>
            </div>
            <div className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">03</p>
              <p className="font-semibold text-ink mb-2">Tours ≠ stays</p>
              <p className="text-[15px] leading-relaxed text-ink-muted">
                Departures are not nights. Each product keeps its own calendar, options, and rules.
              </p>
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
