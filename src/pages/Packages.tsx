import { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import { Search, Globe, PlusCircle, Filter, X, SlidersHorizontal } from 'lucide-react';
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
  const [filterBarSticky, setFilterBarSticky] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const { listings: supplierListings, error: listingsLoadError, reload: reloadSupplierListings } =
    usePublishedSupplierListings();
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

  useEffect(() => {
    const onScroll = () => setFilterBarSticky(window.scrollY > 360);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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

  return (
    <div className="min-h-screen bg-paper pt-20">
      {/* Hero + search & filters over banner (same asset as home) */}
      <section className="relative border-b border-gray-200 overflow-hidden min-h-[300px] sm:min-h-[360px] lg:min-h-[400px]">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url(/banner1.jpg)' }}
        />
        <div className="absolute inset-0 bg-black/50" aria-hidden />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-8 sm:pt-10 sm:pb-10">
          <h1 className="font-display text-3xl sm:text-5xl !text-white mb-2 tracking-tight drop-shadow-md">
            Tours
          </h1>
          <div className="mb-6">
            <p className="!text-white/95 text-base sm:text-lg drop-shadow-md [text-shadow:0_1px_12px_rgba(0,0,0,0.5)]">
              {filteredPackages.length} {filteredPackages.length === 1 ? 'tour' : 'tours'} · Free cancellation on most
            </p>
            {searchTerm.trim() !== '' && searchTerm !== deferredSearch && (
              <p className="!text-white/75 text-sm mt-1 drop-shadow-md" aria-live="polite">
                Updating results…
              </p>
            )}
          </div>
        {/* Sticky filter bar - white card on hero */}
        <div
          className={`mb-0 transition-all duration-200 ${
            filterBarSticky
              ? 'sticky top-20 z-30 bg-white/95 backdrop-blur-md border border-gray-200 rounded-xl shadow-lg py-4 px-4'
              : 'bg-white border border-gray-200 rounded-xl shadow-xl py-4 px-4 ring-1 ring-black/5'
          }`}
        >
          {listingsLoadError && isSupabaseConfigured() && (
            <div className="mb-4 p-4 rounded-lg bg-red-50 text-red-700 text-sm flex items-center justify-between gap-4">
              <span>{listingsLoadError}</span>
              <button
                type="button"
                onClick={() => reloadSupplierListings()}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-100 text-red-800 font-medium hover:bg-red-200"
              >
                Try again
              </button>
            </div>
          )}
          {/* Search row */}
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search tours or destinations..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland transition-all text-sm"
              />
            </div>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              aria-label="Date"
              className="px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland bg-white text-sm text-gray-700"
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
              className="w-full sm:w-24 px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland bg-white text-sm text-gray-700"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="lg:hidden flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg bg-white text-sm font-medium text-gray-700"
                onClick={() => setMobileFiltersOpen(true)}
              >
                <Filter className="w-4 h-4" />
                Filters
              </button>
              <span className="text-sm text-gray-500 whitespace-nowrap hidden sm:block">Sort:</span>
              <span className="text-sm text-gray-500 hidden sm:inline">
                {filteredPackages.length} {filteredPackages.length === 1 ? 'tour' : 'tours'}
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland bg-white text-sm font-medium text-gray-700"
              >
                <option value="recommended">Recommended</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="rating">Top rated (by reviews)</option>
                <option value="duration">Duration</option>
              </select>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 mb-4" aria-label="Active filters">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Applied</span>
              {searchTerm.trim() !== '' && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 border border-gray-200/80"
                >
                  “{searchTerm.trim().slice(0, 36)}
                  {searchTerm.trim().length > 36 ? '…' : ''}”
                  <X className="w-3.5 h-3.5 opacity-70" aria-hidden />
                </button>
              )}
              {selectedDestination !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedDestination('all')}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 border border-gray-200/80"
                >
                  {destinationOptions.find((c) => c.id === selectedDestination)?.label ?? selectedDestination}
                  <X className="w-3.5 h-3.5 opacity-70" aria-hidden />
                </button>
              )}
              {selectedTags.map((tagId) => (
                <button
                  key={tagId}
                  type="button"
                  onClick={() => toggleTag(tagId)}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-finland/10 text-finland hover:bg-finland/15 border border-finland/20"
                >
                  {TAG_OPTIONS.find((t) => t.id === tagId)?.label ?? tagId}
                  <X className="w-3.5 h-3.5 opacity-70" aria-hidden />
                </button>
              ))}
              {priceRange !== 'all' && (
                <button
                  type="button"
                  onClick={() => setPriceRange('all')}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 border border-gray-200/80"
                >
                  {PRICE_CHIPS.find((c) => c.id === priceRange)?.label ?? priceRange}
                  <X className="w-3.5 h-3.5 opacity-70" aria-hidden />
                </button>
              )}
              {filterDate && (
                <button
                  type="button"
                  onClick={() => setFilterDate('')}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 border border-gray-200/80"
                >
                  {filterDate}
                  <X className="w-3.5 h-3.5 opacity-70" aria-hidden />
                </button>
              )}
              {filterGuests && (
                <button
                  type="button"
                  onClick={() => setFilterGuests('')}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 border border-gray-200/80"
                >
                  {filterGuests} {filterGuests === '1' ? 'guest' : 'guests'}
                  <X className="w-3.5 h-3.5 opacity-70" aria-hidden />
                </button>
              )}
            </div>
          )}

          {/* Filter chips - destination, tags, price (hidden on mobile; use Filters drawer) */}
          <div className="hidden lg:flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1 flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5" /> Destination
            </span>
            {destinationOptions.map((chip) => (
              <button
                key={chip.id}
                onClick={() => setSelectedDestination(chip.id)}
                className={`filter-chip px-4 py-2 rounded-full text-sm font-medium ${
                  selectedDestination === chip.id
                    ? 'bg-finland text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {chip.label}
              </button>
            ))}
            <span className="w-px h-5 bg-gray-200 mx-1" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1">Tags</span>
            {TAG_OPTIONS.map((tag) => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className={`filter-chip px-4 py-2 rounded-full text-sm font-medium ${
                  selectedTags.includes(tag.id)
                    ? 'bg-finland text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tag.label}
              </button>
            ))}
            <span className="w-px h-5 bg-gray-200 mx-1" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1">Price</span>
            {PRICE_CHIPS.map((chip) => (
              <button
                key={chip.id}
                onClick={() => setPriceRange(chip.id)}
                className={`filter-chip px-4 py-2 rounded-full text-sm font-medium ${
                  priceRange === chip.id
                    ? 'bg-finland text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {chip.label}
              </button>
            ))}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="ml-2 px-3 py-2 rounded-full text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              >
                Clear all
              </button>
            )}
          </div>
          {/* Mobile filter drawer — above fixed header (z-9999), full height + safe areas */}
          {mobileFiltersOpen && (
            <div className="lg:hidden fixed inset-0 z-[10000]">
              <div
                className="absolute inset-0 bg-black/50"
                onClick={() => setMobileFiltersOpen(false)}
                aria-hidden
              />
              <aside
                role="dialog"
                aria-modal="true"
                aria-labelledby="filters-drawer-title"
                className="absolute top-0 right-0 bottom-0 w-full max-w-[min(100vw,24rem)] flex flex-col bg-white shadow-2xl"
                style={{
                  paddingTop: 'max(0px, env(safe-area-inset-top, 0px))',
                }}
              >
                <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200">
                  <h3 id="filters-drawer-title" className="font-semibold text-gray-900 text-lg">
                    Filters
                  </h3>
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="p-2 -mr-2 text-gray-500 rounded-lg hover:bg-gray-100"
                    aria-label="Close filters"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4 pb-2">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Destination</p>
                    <div className="flex flex-wrap gap-2">
                      {destinationOptions.map((chip) => (
                        <button
                          key={chip.id}
                          onClick={() => setSelectedDestination(chip.id)}
                          className={`px-4 py-2 rounded-full text-sm font-medium ${
                            selectedDestination === chip.id ? 'bg-finland text-white' : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {TAG_OPTIONS.map((tag) => (
                        <button
                          key={tag.id}
                          onClick={() => toggleTag(tag.id)}
                          className={`px-4 py-2 rounded-full text-sm font-medium ${
                            selectedTags.includes(tag.id) ? 'bg-finland text-white' : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {tag.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Price</p>
                    <div className="flex flex-wrap gap-2">
                      {PRICE_CHIPS.map((chip) => (
                        <button
                          key={chip.id}
                          onClick={() => setPriceRange(chip.id)}
                          className={`px-4 py-2 rounded-full text-sm font-medium ${
                            priceRange === chip.id ? 'bg-finland text-white' : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div
                  className="flex-shrink-0 p-4 border-t border-gray-200 space-y-2 bg-white"
                  style={{
                    paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))',
                  }}
                >
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={() => { clearAllFilters(); setMobileFiltersOpen(false); }}
                      className="w-full py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium"
                    >
                      Clear all filters
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="w-full py-3 rounded-lg bg-finland text-white font-semibold"
                  >
                    Show {filteredPackages.length} results
                  </button>
                </div>
              </aside>
            </div>
          )}

          {/* Holiday / multi-day packages hidden from UI for now */}
        </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Recommended - GYG style (only when we have listings) */}
        {SHOW_SEED_LISTINGS && selectedDestination === 'all' && selectedTags.length === 0 && !searchTerm && allListings.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recommended for you</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {allListings
                .filter(a => a.isPopular)
                .slice(0, 4)
                .map((tour, index) => (
                  <PublicListingBrowseCard
                    key={tour.id}
                    tour={tour}
                    index={index}
                    onSelect={() => handleTourSelect(tour)}
                    discountsByListing={discountsByListing}
                    reviewAggregate={reviewAggregates.get(tour.id)}
                    tagLabels={TAG_LABELS}
                    size="compact"
                    showTagPills={false}
                  />
                ))}
            </div>
          </section>
        )}

        {/* Listing grid - only when we have listings */}
        {allListings.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                {hasActiveFilters ? 'Results' : 'All tours & activities'}
              </h2>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-sm text-finland hover:text-finland-dark font-medium"
                >
                  Clear filters
                </button>
              )}
            </div>
            {filteredPackages.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
            />
          ))}
        </div>
            ) : (
              <div className="text-center py-20">
                <Search className="w-14 h-14 mx-auto text-gray-300 mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No tours found</h3>
                <p className="text-gray-500 mb-4">Try different filters or search terms</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark transition-colors"
                    >
                      Clear filters
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                  >
                    Edit search
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {isSupabaseConfigured() && supplierListings === null ? (
          <div className="py-8">
            <SkeletonCardGrid count={6} />
          </div>
        ) : allListings.length === 0 ? (
          <div className="text-center py-20 px-4">
            <Globe className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-2xl font-semibold text-gray-900 mb-2">No tours published yet</h3>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              We are adding new tours. Try again soon or contact us if you need help finding something specific.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 bg-finland text-white font-semibold px-6 py-3 rounded-xl hover:bg-finland-dark transition-colors"
              >
                Refresh
              </button>
              <a
                href={supplierPortalHref('/login')}
                className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <PlusCircle className="w-5 h-5" />
                Become a supplier
              </a>
            </div>
          </div>
        ) : null}

        <p className="mt-12 text-center text-sm text-gray-500 max-w-lg mx-auto">
          Holiday packages from travel agencies will appear here as operators publish them — they are part of Traverion,
          not a separate site.
        </p>
      </div>
    </div>
  );
}
