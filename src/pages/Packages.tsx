import { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { Search, Filter, X, Compass } from 'lucide-react';
import { getAllListings, SHOW_SEED_LISTINGS, durationToMinutes } from '../data/listings';
import { filterCatalogByFamily } from '../lib/inventory';
import { isSupabaseConfigured } from '../lib/supabase';
import { usePublishedSupplierListings } from '../hooks/usePublishedSupplierListings';
import { analytics } from '../lib/analytics';
import { TAG_OPTIONS, getDestinationsFromListings, SEED_DESTINATION_OPTIONS } from '../data/catalogMeta';
import { TourPackage } from '../types/tour';
import { fetchDiscountsByListingIds } from '../data/supabase-discounts';
import { getReviewAggregatesForListingIds } from '../data/supabase-reviews';
import { isSupabaseListingId, catalogHeadlineAmount } from '../lib/discount-display';
import { setListingsJsonLd } from '../lib/seo';
import { listingRunsOnDate } from '../lib/booking-quote';
import { getPartySizeBounds } from '../lib/booking-flow';
import { tourDateLacksCapacityForParty } from '../lib/tour-calendar';
import { listingTourCapacityFromOptions } from '../lib/availability-ops';
import { fetchAvailabilityByListingId, fetchPublishedTourPaidGuests } from '../data/supabase-availability';
import { parseListingExtras, materializedBookingOptions } from '../types/listingExtras';
import { SkeletonCardGrid } from '../components/ui/Skeleton';
import { PublicListingBrowseCard } from '../components/PublicListingBrowseCard';
import { supplierPortalLandingHref } from '../lib/partnerHost';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';

type SortOption = 'recommended' | 'price-asc' | 'price-desc' | 'rating' | 'duration';

const PRICE_CHIPS = [
  { id: 'all', label: 'Any price' },
  { id: 'under100', label: 'Under €100' },
  { id: '100-500', label: '€100 – €500' },
  { id: '500-1000', label: '€500 – €1k' },
  { id: '1000plus', label: '€1k+' },
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
  privateOnly: boolean;
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
    privateOnly: params.get('private') === '1',
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
  privateOnly: boolean;
}): string {
  const p = new URLSearchParams();
  if (state.searchTerm) p.set('q', state.searchTerm);
  if (state.selectedDestination !== 'all') p.set('destination', state.selectedDestination);
  if (state.selectedTags.length) p.set('tags', state.selectedTags.join(','));
  if (state.sortBy !== 'recommended') p.set('sort', state.sortBy);
  if (state.priceRange !== 'all') p.set('price', state.priceRange);
  if (state.date) p.set('date', state.date);
  if (state.guests) p.set('guests', state.guests);
  if (state.privateOnly) p.set('private', '1');
  const s = p.toString();
  return s ? `?${s}` : '';
}

function listingIsPrivateOnly(tour: TourPackage): boolean {
  const opts = materializedBookingOptions(parseListingExtras(tour.listingExtras).bookingOptions);
  return opts.length > 0 && opts.every((o) => Boolean(o.isPrivate));
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
  const [privateOnly, setPrivateOnly] = useState(initialFilters.privateOnly);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filterSheetRef = useRef<HTMLDivElement>(null);
  const closeMobileFilters = useCallback(() => setMobileFiltersOpen(false), []);
  useDialogFocus(mobileFiltersOpen, filterSheetRef, closeMobileFilters);
  const { listings: supplierListings, error: listingsLoadError, reload: reloadSupplierListings } =
    usePublishedSupplierListings();
  const catalogLoading = isSupabaseConfigured() && supplierListings === null;
  const [discountsByListing, setDiscountsByListing] = useState<Map<string, import('../data/supabase-discounts').ListingDiscount[]>>(new Map());
  const [reviewAggregates, setReviewAggregates] = useState<Map<string, { rating: number; count: number }>>(
    () => new Map()
  );
  const [dateCapacityByListing, setDateCapacityByListing] = useState<Record<
    string,
    { paid: number; dayCap?: number; fallbackCap: number }
  > | null>(null);
  const [dateCapacityLoading, setDateCapacityLoading] = useState(false);

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
    setPrivateOnly(parsed.privateOnly);
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
      privateOnly,
    });
    const newUrl = `${window.location.pathname}${query}`;
    if (window.location.pathname + window.location.search !== newUrl) {
      window.history.replaceState({}, '', newUrl);
    }
  }, [searchTerm, selectedDestination, selectedTags, sortBy, priceRange, filterDate, filterGuests, privateOnly]);

  const allListings = useMemo(() => {
    const base =
      isSupabaseConfigured() && supplierListings !== null
        ? [...supplierListings]
        : [...getAllListings({ includeSeed: false, includeHolidayPackages: false })];
    return filterCatalogByFamily(base, 'tour');
  }, [supplierListings]);

  const waitingOnDateCapacity =
    Boolean(filterDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(filterDate) &&
    isSupabaseConfigured() &&
    allListings.length > 0 &&
    (dateCapacityLoading || dateCapacityByListing === null);
  const showCatalogLoading = catalogLoading || waitingOnDateCapacity;

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

  useEffect(() => {
    if (!filterDate || !/^\d{4}-\d{2}-\d{2}$/.test(filterDate) || !isSupabaseConfigured() || allListings.length === 0) {
      setDateCapacityByListing(null);
      setDateCapacityLoading(false);
      return;
    }
    let cancelled = false;
    setDateCapacityLoading(true);
    void Promise.all(
      allListings.map(async (tour) => {
        const extras = parseListingExtras(tour.listingExtras);
        const fallbackCap = listingTourCapacityFromOptions(
          (extras.bookingOptions ?? []).map((o) => o.maxSpotsPerSlot)
        );
        const [caps, paidByDay] = await Promise.all([
          fetchAvailabilityByListingId(tour.id),
          fetchPublishedTourPaidGuests(tour.id),
        ]);
        const dayRow = caps.find((r) => String(r.available_date ?? '').slice(0, 10) === filterDate);
        return [
          tour.id,
          {
            paid: paidByDay[filterDate] ?? 0,
            dayCap: dayRow ? dayRow.capacity : undefined,
            fallbackCap,
          },
        ] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      setDateCapacityByListing(Object.fromEntries(entries));
      setDateCapacityLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [filterDate, allListings]);

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
      const headline = catalogHeadlineAmount(tour);
      if (priceRange === 'under100') matchesPrice = headline < 100;
      else if (priceRange === '100-500') matchesPrice = headline >= 100 && headline < 500;
      else if (priceRange === '500-1000') matchesPrice = headline >= 500 && headline <= 1000;
      else if (priceRange === '1000plus') matchesPrice = headline > 1000;
      const matchesDate = !filterDate || listingRunsOnDate(tour, filterDate);
      const guestCount = Number.parseInt(filterGuests, 10);
      const matchesGuests =
        !filterGuests ||
        !Number.isFinite(guestCount) ||
        guestCount < 1 ||
        guestCount <= getPartySizeBounds(tour).max;
      let matchesCapacity = true;
      if (filterDate && dateCapacityByListing) {
        const cap = dateCapacityByListing[tour.id];
        if (cap) {
          matchesCapacity = !tourDateLacksCapacityForParty({
            paidGuestsThatDay: cap.paid,
            dayCapacity: cap.dayCap,
            fallbackCapacity: cap.fallbackCap,
            partySize: Number.isFinite(guestCount) && guestCount > 0 ? guestCount : 1,
          });
        }
      }
      const matchesPrivate = !privateOnly || listingIsPrivateOnly(tour);
      return (
        matchesSearch &&
        matchesDest &&
        matchesTag &&
        matchesPrice &&
        matchesDate &&
        matchesGuests &&
        matchesCapacity &&
        matchesPrivate
      );
    });

    if (sortBy === 'price-asc') list = [...list].sort((a, b) => catalogHeadlineAmount(a) - catalogHeadlineAmount(b));
    else if (sortBy === 'price-desc') list = [...list].sort((a, b) => catalogHeadlineAmount(b) - catalogHeadlineAmount(a));
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
    privateOnly,
    ratingSortScore,
    dateCapacityByListing,
  ]);

  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    selectedDestination !== 'all' ||
    selectedTags.length > 0 ||
    priceRange !== 'all' ||
    filterDate !== '' ||
    filterGuests !== '' ||
    privateOnly;

  const clearAllFilters = () => {
    setSearchTerm('');
    setSelectedDestination('all');
    setSelectedTags([]);
    setPriceRange('all');
    setSortBy('recommended');
    setFilterDate('');
    setFilterGuests('');
    setPrivateOnly(false);
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
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileFiltersOpen]);

  const extraFilterCount =
    (selectedDestination !== 'all' ? 1 : 0) +
    selectedTags.length +
    (priceRange !== 'all' ? 1 : 0) +
    (privateOnly ? 1 : 0);

  return (
    <div className="min-h-screen bg-paper tv-page">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-16 motion-safe:animate-fade-in">
        <header className="mb-8 rounded-2xl bg-paper-raised p-5 sm:p-7 shadow-soft ring-1 ring-black/[0.06]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">Browse</p>
          <h1 className="font-display text-4xl sm:text-5xl text-ink tracking-tight">Tours</h1>
          <p className="mt-3 text-ink-muted">
            {showCatalogLoading ? (
              <span className="inline-block h-4 w-24 rounded bg-black/[0.06] animate-pulse align-middle" aria-hidden />
            ) : (
              <>
                {filteredPackages.length} {filteredPackages.length === 1 ? 'tour' : 'tours'}
                {searchTerm.trim() !== '' && searchTerm !== deferredSearch ? ' · Updating…' : ''}
                <span className="hidden sm:inline text-ink-faint"> · Where, date, and travelers refine live results</span>
              </>
            )}
          </p>
        </header>

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

        <div className="bg-paper-raised rounded-2xl sm:rounded-full p-2 sm:p-1.5 grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_0.85fr_auto] gap-1 shadow-soft-lg ring-1 ring-black/[0.06]">
          <div className="relative min-w-0 rounded-xl sm:rounded-full px-3.5 py-2 hover:bg-black/[0.03] focus-within:ring-2 focus-within:ring-finland/25">
            <label htmlFor="tours-where" className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Where
            </label>
            <div className="relative">
              <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
              <input
                id="tours-where"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="City or tour"
                className="w-full h-9 pl-6 pr-2 border-0 text-ink placeholder:text-ink-muted focus:ring-0 text-[15px] bg-transparent"
              />
            </div>
          </div>
          <div className="relative min-w-0 rounded-xl sm:rounded-full px-3.5 py-2 hover:bg-black/[0.03] focus-within:ring-2 focus-within:ring-finland/25">
            <label htmlFor="tours-date" className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Date
            </label>
            <input
              id="tours-date"
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full h-9 border-0 text-ink focus:ring-0 text-[15px] bg-transparent"
            />
          </div>
          <div className="relative min-w-0 rounded-xl sm:rounded-full px-3.5 py-2 hover:bg-black/[0.03] focus-within:ring-2 focus-within:ring-finland/25">
            <label htmlFor="tours-guests" className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Travelers
            </label>
            <input
              id="tours-guests"
              type="number"
              min={1}
              max={99}
              inputMode="numeric"
              value={filterGuests}
              onChange={(e) => setFilterGuests(e.target.value)}
              placeholder="Guests"
              className="w-full h-9 border-0 text-ink placeholder:text-ink-muted focus:ring-0 text-[15px] bg-transparent"
            />
          </div>
          <button
            type="button"
            className="tv-btn-secondary h-12 sm:h-14 sm:self-center col-span-1"
            onClick={() => setMobileFiltersOpen(true)}
            aria-expanded={mobileFiltersOpen}
            aria-controls="tours-filters"
          >
            <Filter className="w-4 h-4" />
            Filters{extraFilterCount > 0 ? ` · ${extraFilterCount}` : ''}
          </button>
        </div>
        <div className="mt-3 flex justify-end">
          <label className="inline-flex items-center gap-2 rounded-full bg-paper-raised px-3 py-1.5 text-sm text-ink-muted shadow-soft ring-1 ring-black/[0.06]">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-finland">Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="h-8 bg-transparent text-sm font-medium text-ink"
              aria-label="Sort"
            >
              <option value="recommended">Recommended</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="rating">Top rated</option>
              <option value="duration">Duration</option>
            </select>
          </label>
        </div>

        {hasActiveFilters && (
          <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
            {searchTerm.trim() !== '' && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="lux-flat inline-flex items-center gap-1.5 rounded-full bg-finland/10 px-3 py-1.5 text-xs font-semibold text-finland ring-1 ring-finland/20"
              >
                “{searchTerm.trim().slice(0, 36)}{searchTerm.trim().length > 36 ? '…' : ''}” <X className="w-3.5 h-3.5" />
              </button>
            )}
            {selectedDestination !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedDestination('all')}
                className="lux-flat inline-flex items-center gap-1.5 rounded-full bg-finland/10 px-3 py-1.5 text-xs font-semibold text-finland ring-1 ring-finland/20"
              >
                {destinationOptions.find((c) => c.id === selectedDestination)?.label ?? selectedDestination} <X className="w-3.5 h-3.5" />
              </button>
            )}
            {selectedTags.map((tagId) => (
              <button
                key={tagId}
                type="button"
                onClick={() => toggleTag(tagId)}
                className="lux-flat inline-flex items-center gap-1.5 rounded-full bg-finland/10 px-3 py-1.5 text-xs font-semibold text-finland ring-1 ring-finland/20"
              >
                {TAG_OPTIONS.find((t) => t.id === tagId)?.label ?? tagId} <X className="w-3.5 h-3.5" />
              </button>
            ))}
            {priceRange !== 'all' && (
              <button
                type="button"
                onClick={() => setPriceRange('all')}
                className="lux-flat inline-flex items-center gap-1.5 rounded-full bg-finland/10 px-3 py-1.5 text-xs font-semibold text-finland ring-1 ring-finland/20"
              >
                {PRICE_CHIPS.find((c) => c.id === priceRange)?.label ?? priceRange} <X className="w-3.5 h-3.5" />
              </button>
            )}
            {filterDate && (
              <button
                type="button"
                onClick={() => setFilterDate('')}
                className="lux-flat inline-flex items-center gap-1.5 rounded-full bg-finland/10 px-3 py-1.5 text-xs font-semibold text-finland ring-1 ring-finland/20"
              >
                {filterDate} <X className="w-3.5 h-3.5" />
              </button>
            )}
            {filterGuests && (
              <button
                type="button"
                onClick={() => setFilterGuests('')}
                className="lux-flat inline-flex items-center gap-1.5 rounded-full bg-finland/10 px-3 py-1.5 text-xs font-semibold text-finland ring-1 ring-finland/20"
              >
                {filterGuests} {filterGuests === '1' ? 'guest' : 'guests'} <X className="w-3.5 h-3.5" />
              </button>
            )}
            {privateOnly && (
              <button
                type="button"
                onClick={() => setPrivateOnly(false)}
                className="lux-flat inline-flex items-center gap-1.5 rounded-full bg-finland/10 px-3 py-1.5 text-xs font-semibold text-finland ring-1 ring-finland/20"
              >
                Private tours <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button type="button" onClick={clearAllFilters} className="lux-flat rounded-full bg-finland px-3 py-1.5 text-xs font-semibold text-white shadow-sm ring-1 ring-finland/30">
              Clear all
            </button>
          </div>
        )}

        {mobileFiltersOpen && (
          <div ref={filterSheetRef} className="tv-sheet-overlay">
            <button type="button" tabIndex={-1} className="absolute inset-0" aria-label="Close filters" onClick={closeMobileFilters} />
            <aside
              id="tours-filters"
              role="dialog"
              aria-modal="true"
              aria-labelledby="filters-drawer-title"
              className="tv-sheet-panel relative flex flex-col overflow-hidden motion-safe:animate-slide-up"
            >
              <div className="mb-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland">Browse</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <h3 id="filters-drawer-title" className="font-display text-2xl sm:text-3xl text-ink tracking-tight">
                    Filters
                    {extraFilterCount > 0 ? (
                      <span className="ml-2 align-middle text-base font-sans font-semibold text-finland tabular-nums">
                        · {extraFilterCount}
                      </span>
                    ) : null}
                  </h3>
                  <button type="button" onClick={() => setMobileFiltersOpen(false)} className="lux-tap-target p-2" aria-label="Close">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="space-y-6 min-h-0 flex-1 overflow-y-auto">
                <div className="grid grid-cols-2 gap-3 lg:hidden">
                  <div className="col-span-2">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">When</p>
                    <input
                      type="date"
                      value={filterDate}
                      onChange={(e) => setFilterDate(e.target.value)}
                      aria-label="Date"
                      className="tv-input"
                    />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Guests</p>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      inputMode="numeric"
                      value={filterGuests}
                      onChange={(e) => setFilterGuests(e.target.value)}
                      placeholder="Guests"
                      aria-label="Guests"
                      className="tv-input"
                    />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Sort</p>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      className="tv-input"
                      aria-label="Sort"
                    >
                      <option value="recommended">Recommended</option>
                      <option value="price-asc">Price: low to high</option>
                      <option value="price-desc">Price: high to low</option>
                      <option value="rating">Top rated</option>
                      <option value="duration">Duration</option>
                    </select>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Destination</p>
                  <div className="flex flex-wrap gap-2">
                    {destinationOptions.map((chip) => (
                      <button
                        key={chip.id}
                        type="button"
                        aria-pressed={selectedDestination === chip.id}
                        onClick={() => setSelectedDestination(chip.id)}
                        className={`tv-chip transition-colors duration-150 ${
                          selectedDestination === chip.id
                            ? 'bg-finland text-white shadow-sm ring-2 ring-finland/40'
                            : 'bg-paper text-ink hover:bg-finland/10 hover:text-finland'
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
                        aria-pressed={priceRange === chip.id}
                        onClick={() => setPriceRange(chip.id)}
                        className={`tv-chip transition-colors duration-150 ${
                          priceRange === chip.id
                            ? 'bg-finland text-white shadow-sm ring-2 ring-finland/40'
                            : 'bg-paper text-ink hover:bg-finland/10 hover:text-finland'
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
                    <button
                      type="button"
                      aria-pressed={privateOnly}
                      onClick={() => setPrivateOnly((v) => !v)}
                      className={`tv-chip transition-colors duration-150 ${
                        privateOnly
                          ? 'bg-finland text-white shadow-sm ring-2 ring-finland/40'
                          : 'bg-paper text-ink hover:bg-finland/10 hover:text-finland'
                      }`}
                    >
                      Private tours
                    </button>
                    {TAG_OPTIONS.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        aria-pressed={selectedTags.includes(tag.id)}
                        onClick={() => toggleTag(tag.id)}
                        className={`tv-chip transition-colors duration-150 ${
                          selectedTags.includes(tag.id)
                            ? 'bg-finland text-white shadow-sm ring-2 ring-finland/40'
                            : 'bg-paper text-ink hover:bg-finland/10 hover:text-finland'
                        }`}
                      >
                        {tag.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex gap-2 shrink-0">
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
        {showCatalogLoading ? (
          <div className="mt-10 py-8">
            <SkeletonCardGrid count={6} />
          </div>
        ) : allListings.length > 0 && filteredPackages.length > 0 ? (
          <>
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
            <p className="mt-16 text-sm text-ink-faint max-w-lg">
              Live tours from operators appear here when they publish. Traverion does not fill this page with sample trips.
            </p>
          </>
        ) : (
          <div className="mt-10 rounded-2xl bg-paper-raised px-6 py-2 shadow-soft ring-1 ring-black/[0.06] sm:px-8">
            {allListings.length > 0 ? (
              <EmptyState
                className="py-10 sm:py-12 max-w-lg"
                icon={Search}
                title="No tours match"
                body="Nothing fits this search. Try another place, date, or clear filters to see live tours again."
                action={
                  hasActiveFilters ? (
                    <button type="button" onClick={clearAllFilters} className="tv-btn-primary">
                      Clear filters
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <EmptyState
                className="py-10 sm:py-12 max-w-lg"
                icon={Compass}
                title="No tours published yet"
                body="Operators have not published live tours. That is expected — Traverion does not show a demo catalog. If you run tours, you can list yours today."
                action={
                  <a href={supplierPortalLandingHref()} className="tv-btn-primary inline-flex">
                    List your tours
                  </a>
                }
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
