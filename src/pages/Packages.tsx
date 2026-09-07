import { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import { Search, Filter, X, Compass } from 'lucide-react';
import { getAllListings, SHOW_SEED_LISTINGS, durationToMinutes } from '../data/listings';
import { isSupabaseConfigured } from '../lib/supabase';
import { usePublishedSupplierListings } from '../hooks/usePublishedSupplierListings';
import { analytics } from '../lib/analytics';
import { tourPackages } from '../data/tours';
import { activities, TAG_OPTIONS, getDestinationsFromListings, SEED_DESTINATION_OPTIONS } from '../data/activities';
import { TourPackage } from '../types/tour';
import { fetchDiscountsByListingIds } from '../data/supabase-discounts';
import { getReviewAggregatesForListingIds } from '../data/supabase-reviews';
import { isSupabaseListingId } from '../lib/discount-display';
import { setListingsJsonLd } from '../lib/seo';
import { listingRunsOnDate } from '../lib/booking-quote';
import { getPartySizeBounds } from '../lib/booking-flow';
import { SkeletonCardGrid } from '../components/ui/Skeleton';
import { PublicListingBrowseCard } from '../components/PublicListingBrowseCard';
import { supplierPortalHref } from '../lib/partnerHost';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';

type SortOption = 'recommended' | 'price-asc' | 'price-desc' | 'rating' | 'duration';

const PRICE_CHIPS = [
  { id: 'all', label: 'Any price' },
  { id: 'under100', label: 'Under $100' },
  { id: '100-500', label: '$100 – $500' },
  { id: '500-1000', label: '$500 – $1k' },
  { id: '1000plus', label: '$1k+' },
] as const;

const TAG_LABELS: Record<string, string> = {
  'free-cancellation': 'Free cancellation',
  'small-group': 'Small group',
  'pickup-available': 'Pickup available',
  'mobile-ticket': 'Mobile ticket',
  'bestseller': 'Bestseller',
};

type DestOption = { id: string; label: string; type: 'world' | 'region' | 'city' };

function matchesDestination(tour: TourPackage, destId: string, destinationOptions: DestOption[]): boolean {
  if (destId === 'all') return true;
  const opt = destinationOptions.find(d => d.id === destId);
  if (!opt) return true;
  if (opt.type === 'region') return (tour.country?.toLowerCase() ?? '') === opt.label.toLowerCase();
  if (opt.type === 'city') {
    const cityNorm = (tour.city ?? '').toLowerCase().replace(/\s+/g, '-');
    const idNorm = destId.toLowerCase().replace(/\s+/g, '-');
    return cityNorm === idNorm || (tour.city?.toLowerCase() ?? '') === opt.label.toLowerCase();
  }
  return true;
}

interface PackagesProps {
  onTourSelect: (tour: TourPackage) => void;
  onNavigate?: (page: string) => void;
}

function parsePackagesSearchParams(search: string): {
  searchTerm: string;
  destination: string;
  tags: string[];
  sort: SortOption;
  price: string;
  date: string;
  guests: string;
} {
  const params = new URLSearchParams(search);
  const tagsParam = params.get('tags');
  return {
    searchTerm: params.get('q') ?? '',
    destination: params.get('destination') ?? 'all',
    tags: tagsParam ? tagsParam.split(',').filter(Boolean) : [],
    sort: (params.get('sort') as SortOption) ?? 'recommended',
    price: params.get('price') ?? 'all',
    date: params.get('date') ?? '',
    guests: params.get('guests') ?? '',
  };
}

function buildPackagesSearchParams(state: {
  searchTerm: string;
  selectedDestination: string;
  selectedTags: string[];
  sortBy: SortOption;
  priceRange: string;
  date: string;
  guests: string;
}): string {
  const p = new URLSearchParams();
  if (state.searchTerm) p.set('q', state.searchTerm);
  if (state.selectedDestination !== 'all') p.set('destination', state.selectedDestination);
  if (state.selectedTags.length) p.set('tags', state.selectedTags.join(','));
  if (state.sortBy !== 'recommended') p.set('sort', state.sortBy);
  if (state.priceRange !== 'all') p.set('price', state.priceRange);
  if (state.date) p.set('date', state.date);
  if (state.guests) p.set('guests', state.guests);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export default function Packages({ onTourSelect }: PackagesProps) {
  const initialFilters = parsePackagesSearchParams(
    typeof window === 'undefined' ? '' : window.location.search
  );
  const [searchTerm, setSearchTerm] = useState(initialFilters.searchTerm);
  const [selectedDestination, setSelectedDestination] = useState(initialFilters.destination);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialFilters.tags);
  const [sortBy, setSortBy] = useState<SortOption>(initialFilters.sort);
  const [priceRange, setPriceRange] = useState(initialFilters.price);
  const [filterDate, setFilterDate] = useState(initialFilters.date);
  const [filterGuests, setFilterGuests] = useState(initialFilters.guests);
  const [showHolidayPackages] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const { listings: supplierListings, error: listingsLoadError, reload: reloadSupplierListings } =
    usePublishedSupplierListings();
  const catalogLoading = isSupabaseConfigured() && supplierListings === null;
  const [discountsByListing, setDiscountsByListing] = useState<Map<string, import('../data/supabase-discounts').ListingDiscount[]>>(new Map());
  const [reviewAggregates, setReviewAggregates] = useState<Map<string, { rating: number; count: number }>>(
    () => new Map()
  );

  const deferredSearch = useDeferredValue(searchTerm);

  // Read URL on mount and when user uses browser back/forward
  const syncStateFromUrl = useCallback(() => {
    const search = window.location.search;
    const parsed = parsePackagesSearchParams(search);
    setSearchTerm(parsed.searchTerm);
    setSelectedDestination(parsed.destination);
    setSelectedTags(parsed.tags);
    setSortBy(parsed.sort);
    setPriceRange(parsed.price);
    setFilterDate(parsed.date);
    setFilterGuests(parsed.guests);
  }, []);

  useEffect(() => {
    syncStateFromUrl();
  }, [syncStateFromUrl]);

  useEffect(() => {
    const onPopState = () => syncStateFromUrl();
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [syncStateFromUrl]);

  // Sync leftover hero search payload, if any
  useEffect(() => {
    const searchCriteria = sessionStorage.getItem('searchCriteria');
    if (searchCriteria) {
      try {
        const criteria = JSON.parse(searchCriteria) as { destination?: string; q?: string };
        const q = String(criteria.q ?? criteria.destination ?? '').trim();
        if (q) setSearchTerm(q);
        sessionStorage.removeItem('searchCriteria');
      } catch {
        sessionStorage.removeItem('searchCriteria');
      }
    }
  }, []);

  // Write URL when filters change (shareable links). Skip the first paint so we never
  // clobber a just-arrived search query with empty default state.
  const urlWriteReady = useRef(false);
  useEffect(() => {
    if (!urlWriteReady.current) {
      urlWriteReady.current = true;
      return;
    }
    const query = buildPackagesSearchParams({
      searchTerm,
      selectedDestination,
      selectedTags,
      sortBy,
      priceRange,
      date: filterDate,
      guests: filterGuests,
    });
    const newUrl = `${window.location.pathname}${query}`;
    if (window.location.pathname + window.location.search !== newUrl) {
      window.history.replaceState({}, '', newUrl);
    }
  }, [searchTerm, selectedDestination, selectedTags, sortBy, priceRange, filterDate, filterGuests]);

  const allListings = useMemo(() => {
    const base =
      isSupabaseConfigured() && supplierListings !== null
        ? [...supplierListings]
        : [...getAllListings({ includeSeed: false, includeHolidayPackages: false })];
    if (SHOW_SEED_LISTINGS) base.push(...activities);
    if (showHolidayPackages) base.push(...tourPackages);
    return base;
  }, [supplierListings, showHolidayPackages]);

  const supabaseListingIds = useMemo(
    () => allListings.map((t) => t.id).filter(isSupabaseListingId),
    [allListings]
  );
  const supabaseListingIdsKey = useMemo(() => supabaseListingIds.join(','), [supabaseListingIds]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabaseListingIdsKey) {
      setReviewAggregates(new Map());
      setDiscountsByListing(new Map());
      return;
    }
    const ids = supabaseListingIdsKey.split(',');
    let cancelled = false;
    Promise.all([getReviewAggregatesForListingIds(ids), fetchDiscountsByListingIds(ids)]).then(
      ([reviews, discounts]) => {
        if (cancelled) return;
        setReviewAggregates(reviews);
        setDiscountsByListing(discounts);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [supabaseListingIdsKey]);

  // SEO: JSON-LD for listings (helps search engines understand tour offerings)
  useEffect(() => {
    if (allListings.length === 0) return;
    setListingsJsonLd(
      allListings.slice(0, 20).map((t) => ({
        id: t.id,
        name: t.title,
        description: (t.description || '').slice(0, 500),
        image: t.image,
      }))
    );
  }, [allListings]);

  const destinationOptions = useMemo(() => {
    return SHOW_SEED_LISTINGS ? SEED_DESTINATION_OPTIONS : getDestinationsFromListings(allListings);
  }, [allListings]);

  const ratingSortScore = useCallback(
    (tour: TourPackage) => {
      if (!isSupabaseListingId(tour.id)) return tour.rating;
      const agg = reviewAggregates.get(tour.id);
      if (agg && agg.count > 0) return agg.rating;
      return -1;
    },
    [reviewAggregates]
  );

  const filteredPackages = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    let list = allListings.filter((tour) => {
      const matchesSearch =
        !q ||
        tour.title.toLowerCase().includes(q) ||
        (tour.destination && tour.destination.toLowerCase().includes(q)) ||
        (tour.city && tour.city.toLowerCase().includes(q)) ||
        (tour.country && tour.country.toLowerCase().includes(q));
      const matchesDest = matchesDestination(tour, selectedDestination, destinationOptions);
      const matchesTag =
        selectedTags.length === 0 || (tour.tags && selectedTags.every((tagId) => tour.tags!.includes(tagId)));
      let matchesPrice = true;
      if (priceRange === 'under100') matchesPrice = tour.price.startingFrom < 100;
      else if (priceRange === '100-500') matchesPrice = tour.price.startingFrom >= 100 && tour.price.startingFrom < 500;
      else if (priceRange === '500-1000') matchesPrice = tour.price.startingFrom >= 500 && tour.price.startingFrom <= 1000;
      else if (priceRange === '1000plus') matchesPrice = tour.price.startingFrom > 1000;
      const matchesDate = !filterDate || listingRunsOnDate(tour, filterDate);
      const guestCount = Number.parseInt(filterGuests, 10);
      const matchesGuests =
        !filterGuests ||
        !Number.isFinite(guestCount) ||
        guestCount < 1 ||
        guestCount <= getPartySizeBounds(tour).max;
      return matchesSearch && matchesDest && matchesTag && matchesPrice && matchesDate && matchesGuests;
    });

    if (sortBy === 'price-asc') list = [...list].sort((a, b) => a.price.startingFrom - b.price.startingFrom);
    else if (sortBy === 'price-desc') list = [...list].sort((a, b) => b.price.startingFrom - a.price.startingFrom);
    else if (sortBy === 'rating')
      list = [...list].sort((a, b) => ratingSortScore(b) - ratingSortScore(a));
    else if (sortBy === 'duration') list = [...list].sort((a, b) => durationToMinutes(a.duration) - durationToMinutes(b.duration));
    return list;
  }, [
    allListings,
    destinationOptions,
    deferredSearch,
    selectedDestination,
    selectedTags,
    priceRange,
    sortBy,
    filterDate,
    filterGuests,
    ratingSortScore,
  ]);

  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    selectedDestination !== 'all' ||
    selectedTags.length > 0 ||
    priceRange !== 'all' ||
    filterDate !== '' ||
    filterGuests !== '';

  const clearAllFilters = () => {
    setSearchTerm('');
    setSelectedDestination('all');
    setSelectedTags([]);
    setPriceRange('all');
    setSortBy('recommended');
    setFilterDate('');
    setFilterGuests('');
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev => prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]);
  };

  const handleTourSelect = (tour: TourPackage) => {
    analytics.listingClick(tour.id, tour.title);
    if (onTourSelect) onTourSelect(tour);
  };

  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileFiltersOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileFiltersOpen]);

  const extraFilterCount =
    (selectedDestination !== 'all' ? 1 : 0) +
    selectedTags.length +
    (priceRange !== 'all' ? 1 : 0);

  return (
    <div className="min-h-screen bg-paper pt-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-16 motion-safe:animate-fade-in">
        <h1 className="font-display text-4xl sm:text-5xl text-ink tracking-tight">Tours</h1>
        <p className="mt-2 text-ink-muted">
          {catalogLoading ? (
            <span className="inline-block h-4 w-24 rounded bg-black/[0.06] animate-pulse align-middle" aria-hidden />
          ) : (
            <>
              {filteredPackages.length} {filteredPackages.length === 1 ? 'tour' : 'tours'}
              {searchTerm.trim() !== '' && searchTerm !== deferredSearch ? ' · Updating…' : ''}
            </>
          )}
        </p>

        {listingsLoadError && isSupabaseConfigured() && (
          <ErrorState
            className="mt-6 py-6"
            title="Tours unavailable"
            body={userFacingError(listingsLoadError, USER_ERROR.tours)}
            retry={{ onClick: () => reloadSupplierListings() }}
            extra={
              <a href="/contact" className="tv-btn-ghost inline-flex">
                Contact support
              </a>
            }
          />
        )}

        <div className="mt-8 flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-faint" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Where or what"
              className="tv-input pl-10"
            />
          </div>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            aria-label="Date"
            className="tv-input lg:w-40"
          />
          <input
            type="number"
            min={1}
            max={99}
            inputMode="numeric"
            value={filterGuests}
            onChange={(e) => setFilterGuests(e.target.value)}
            placeholder="Guests"
            aria-label="Guests"
            className="tv-input lg:w-28"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="tv-input lg:w-48"
            aria-label="Sort"
          >
            <option value="recommended">Recommended</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="rating">Top rated</option>
            <option value="duration">Duration</option>
          </select>
          <button
            type="button"
            className="tv-btn-secondary shrink-0"
            onClick={() => setMobileFiltersOpen(true)}
          >
            <Filter className="w-4 h-4" />
            Filters{extraFilterCount > 0 ? ` · ${extraFilterCount}` : ''}
          </button>
        </div>

        {hasActiveFilters && (
          <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
            {searchTerm.trim() !== '' && (
              <button type="button" onClick={() => setSearchTerm('')} className="tv-btn-ghost text-xs">
                “{searchTerm.trim().slice(0, 36)}{searchTerm.trim().length > 36 ? '…' : ''}” <X className="w-3.5 h-3.5" />
              </button>
            )}
            {selectedDestination !== 'all' && (
              <button type="button" onClick={() => setSelectedDestination('all')} className="tv-btn-ghost text-xs">
                {destinationOptions.find((c) => c.id === selectedDestination)?.label ?? selectedDestination} <X className="w-3.5 h-3.5" />
              </button>
            )}
            {selectedTags.map((tagId) => (
              <button key={tagId} type="button" onClick={() => toggleTag(tagId)} className="tv-btn-ghost text-xs">
                {TAG_OPTIONS.find((t) => t.id === tagId)?.label ?? tagId} <X className="w-3.5 h-3.5" />
              </button>
            ))}
            {priceRange !== 'all' && (
              <button type="button" onClick={() => setPriceRange('all')} className="tv-btn-ghost text-xs">
                {PRICE_CHIPS.find((c) => c.id === priceRange)?.label ?? priceRange} <X className="w-3.5 h-3.5" />
              </button>
            )}
            {filterDate && (
              <button type="button" onClick={() => setFilterDate('')} className="tv-btn-ghost text-xs">
                {filterDate} <X className="w-3.5 h-3.5" />
              </button>
            )}
            {filterGuests && (
              <button type="button" onClick={() => setFilterGuests('')} className="tv-btn-ghost text-xs">
                {filterGuests} {filterGuests === '1' ? 'guest' : 'guests'} <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button type="button" onClick={clearAllFilters} className="text-sm font-medium text-finland">
              Clear
            </button>
          </div>
        )}

        {mobileFiltersOpen && (
          <div className="tv-sheet-overlay">
            <button type="button" className="absolute inset-0" aria-label="Close filters" onClick={() => setMobileFiltersOpen(false)} />
            <aside role="dialog" aria-modal="true" aria-labelledby="filters-drawer-title" className="tv-sheet-panel relative motion-safe:animate-slide-up">
              <div className="flex items-center justify-between mb-6">
                <h3 id="filters-drawer-title" className="font-display text-2xl">Filters</h3>
                <button type="button" onClick={() => setMobileFiltersOpen(false)} className="lux-tap-target p-2" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-6">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Destination</p>
                  <div className="flex flex-wrap gap-2">
                    {destinationOptions.map((chip) => (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => setSelectedDestination(chip.id)}
                        className={`px-3 py-1.5 rounded-full text-sm transition-colors duration-150 ${
                          selectedDestination === chip.id ? 'bg-ink text-paper-raised' : 'bg-paper text-ink'
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Price</p>
                  <div className="flex flex-wrap gap-2">
                    {PRICE_CHIPS.map((chip) => (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => setPriceRange(chip.id)}
                        className={`px-3 py-1.5 rounded-full text-sm transition-colors duration-150 ${
                          priceRange === chip.id ? 'bg-ink text-paper-raised' : 'bg-paper text-ink'
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Details</p>
                  <div className="flex flex-wrap gap-2">
                    {TAG_OPTIONS.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className={`px-3 py-1.5 rounded-full text-sm transition-colors duration-150 ${
                          selectedTags.includes(tag.id) ? 'bg-ink text-paper-raised' : 'bg-paper text-ink'
                        }`}
                      >
                        {tag.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-8 flex gap-2">
                {extraFilterCount > 0 ? (
                  <button type="button" onClick={() => { clearAllFilters(); setMobileFiltersOpen(false); }} className="tv-btn-secondary flex-1">
                    Clear
                  </button>
                ) : null}
                <button type="button" onClick={() => setMobileFiltersOpen(false)} className="tv-btn-primary flex-1">
                  Show {filteredPackages.length}
                </button>
              </div>
            </aside>
          </div>
        )}
        {allListings.length > 0 && filteredPackages.length > 0 ? (
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPackages.map((tour, index) => (
            <PublicListingBrowseCard
              key={tour.id}
              tour={tour}
              index={index}
              onSelect={() => handleTourSelect(tour)}
              discountsByListing={discountsByListing}
              reviewAggregate={reviewAggregates.get(tour.id)}
              tagLabels={TAG_LABELS}
              size="default"
              showTagPills={false}
            />
          ))}
        </div>
        ) : allListings.length > 0 ? (
              <EmptyState
                icon={Search}
                title="No tours match"
                body="Nothing in the catalog fits this search. That is a filter result, not a missing page. Change the query or clear filters to see live tours again."
                action={
                  hasActiveFilters ? (
                    <button type="button" onClick={clearAllFilters} className="tv-btn-primary">
                      Clear filters
                    </button>
                  ) : undefined
                }
              />
        ) : null}

        {catalogLoading ? (
          <div className="py-8">
            <SkeletonCardGrid count={6} />
          </div>
        ) : allListings.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="No tours published yet"
            body="Operators have not published live tours. That is expected — Traverion does not show a demo catalog. If you run tours, you can list yours today."
            action={
              <a href={supplierPortalHref('/login')} className="tv-btn-primary inline-flex">
                List your tours
              </a>
            }
          />
        ) : null}

        <p className="mt-16 text-sm text-ink-faint max-w-lg">
          Packages from agencies will join this catalog when operators publish them.
        </p>
      </div>
    </div>
  );
}
