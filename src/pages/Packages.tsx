import { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { Search, X, Compass } from 'lucide-react';
import { getAllListings, SHOW_SEED_LISTINGS, durationToMinutes } from '../data/listings';
import { filterCatalogByFamily } from '../lib/inventory';
import { isSupabaseConfigured } from '../lib/supabase';
import { usePublishedSupplierListings } from '../hooks/usePublishedSupplierListings';
import { useTravelerWishlist } from '../hooks/useTravelerWishlist';
import { analytics } from '../lib/analytics';
import { TAG_OPTIONS, getDestinationsFromListings, SEED_DESTINATION_OPTIONS } from '../data/catalogMeta';
import { TourPackage } from '../types/tour';
import { fetchDiscountsByListingIds } from '../data/supabase-discounts';
import { getReviewAggregatesForListingIds } from '../data/supabase-reviews';
import { isSupabaseListingId } from '../lib/discount-display';
import { clearListingsJsonLd, setListingsJsonLd } from '../lib/seo';
import { listingHasBookableDepartureOnDate, listingHasUpcomingBookableSeason, tourBookableSellingDeparturesOnDate } from '../lib/booking-quote';
import { getPartySizeBoundsKnown, formatBookingDateDisplay } from '../lib/booking-flow';
import { tourDateLacksCapacityForParty } from '../lib/tour-calendar';
import { listingTourCapacityFromOptions, capacitySpotsFromBookingOptions } from '../lib/availability-ops';
import { fetchAvailabilityByListingId, fetchPublishedTourPaidGuests, fetchPublishedTourPaidGuestsBySlot, tourPaidSlotKey } from '../data/supabase-availability';
import { parseListingExtras, materializedBookingOptions } from '../types/listingExtras';
import { SkeletonCardGrid } from '../components/ui/Skeleton';
import { PublicListingBrowseCard } from '../components/PublicListingBrowseCard';
import { MarketplaceBrowseShell, MarketplaceFamilySwitch, MarketplaceSortSelect } from '../components/marketplace/MarketplaceBrowseShell';
import {
  MarketplaceFilterChip,
  MarketplaceFilterChipRow,
  MarketplaceFilterSection,
  MarketplaceActiveChip,
} from '../components/marketplace/MarketplaceFilterPanel';
import {
  MarketplaceFilterMenu,
  MarketplaceSecondaryFilterRow,
} from '../components/marketplace/MarketplaceFilterMenu';
import {
  MarketplaceMobileSearchTrigger,
  MarketplaceSearchFields,
  MarketplaceSearchPill,
} from '../components/marketplace/MarketplaceSearchBar';
import { supplierPortalLandingHref } from '../lib/partnerHost';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { formatMoney, normalizeCurrency } from '../lib/money';
import { recordTravelerInterest } from '../lib/traveler-interest';
import {
  buildPriceChips,
  catalogHasParseableDurations,
  catalogSharedCurrency,
  collectTourLanguages,
  DURATION_FILTER_CHIPS,
  languageLabel,
  listingBrowseAmount,
  MARKETPLACE_BROWSE_GRID_CLASS,
  marketplaceFamilySwitchPath,
  marketplaceWhereDisplay,
  parseDurationFilterId,
  parseMarketplaceSort,
  parsePriceChipId,
  parseRatingFilterId,
  RATING_FILTER_CHIPS,
  tourMatchesCatalogFilters,
  toursBrowseFilteredEmptyBody,
  type DurationFilterId,
  type MarketplaceSortOption,
  type PriceChipId,
  type RatingFilterId,
} from '../lib/marketplaceBrowse';

const TAG_LABELS: Record<string, string> = {
  'free-cancellation': 'Free cancellation',
  'small-group': 'Small group',
  'pickup-available': 'Pickup available',
  'mobile-ticket': 'Mobile ticket',
};

const TOUR_SORT_OPTIONS = [
  // Phase 1599: traveler-facing sort label (id stays recommended).
  { id: 'recommended', label: 'Recommended' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'rating', label: 'Guest rating' },
  { id: 'duration', label: 'Duration' },
];

interface PackagesProps {
  onTourSelect: (tour: TourPackage) => void;
  onNavigate?: (page: string) => void;
}

function parsePackagesSearchParams(search: string): {
  searchTerm: string;
  destination: string;
  tags: string[];
  sort: MarketplaceSortOption;
  price: PriceChipId;
  date: string;
  guests: string;
  privateOnly: boolean;
  rating: RatingFilterId;
  duration: DurationFilterId;
  language: string;
} {
  const params = new URLSearchParams(search);
  const tagsParam = params.get('tags');
  return {
    searchTerm: params.get('q') ?? '',
    destination: params.get('destination') ?? 'all',
    tags: tagsParam ? tagsParam.split(',').filter(Boolean) : [],
    sort: parseMarketplaceSort(params.get('sort')),
    price: parsePriceChipId(params.get('price')),
    date: params.get('date') ?? '',
    guests: params.get('guests') ?? '',
    privateOnly: params.get('private') === '1',
    rating: parseRatingFilterId(params.get('rating')),
    duration: parseDurationFilterId(params.get('duration')),
    language: (params.get('lang') ?? '').trim().toLowerCase(),
  };
}

function buildPackagesSearchParams(state: {
  searchTerm: string;
  selectedDestination: string;
  selectedTags: string[];
  sortBy: MarketplaceSortOption;
  priceRange: PriceChipId;
  date: string;
  guests: string;
  privateOnly: boolean;
  rating: RatingFilterId;
  duration: DurationFilterId;
  language: string;
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
  if (state.rating !== 'all') p.set('rating', state.rating);
  if (state.duration !== 'all') p.set('duration', state.duration);
  if (state.language && state.language !== 'all') p.set('lang', state.language);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export default function Packages({ onTourSelect, onNavigate }: PackagesProps) {
  const initialFilters = parsePackagesSearchParams(
    typeof window === 'undefined' ? '' : window.location.search
  );
  const [searchTerm, setSearchTerm] = useState(initialFilters.searchTerm);
  const [selectedDestination, setSelectedDestination] = useState(initialFilters.destination);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialFilters.tags);
  const [sortBy, setSortBy] = useState<MarketplaceSortOption>(initialFilters.sort);
  const [priceRange, setPriceRange] = useState(initialFilters.price);
  const [filterDate, setFilterDate] = useState(initialFilters.date);
  const [filterGuests, setFilterGuests] = useState(initialFilters.guests);
  /** Draft primary search — applied only on Search (does not refilter while typing). */
  const [draftWhere, setDraftWhere] = useState(initialFilters.searchTerm);
  const [draftDate, setDraftDate] = useState(initialFilters.date);
  const [draftGuests, setDraftGuests] = useState(initialFilters.guests);
  const [privateOnly, setPrivateOnly] = useState(initialFilters.privateOnly);
  const [ratingFilter, setRatingFilter] = useState<RatingFilterId>(initialFilters.rating);
  const [durationFilter, setDurationFilter] = useState<DurationFilterId>(initialFilters.duration);
  const [languageFilter, setLanguageFilter] = useState(initialFilters.language);
  const wishlist = useTravelerWishlist();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filterSheetRef = useRef<HTMLDivElement>(null);
  const closeMobileFilters = useCallback(() => setMobileFiltersOpen(false), []);
  useDialogFocus(mobileFiltersOpen, filterSheetRef, closeMobileFilters);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchSheetRef = useRef<HTMLDivElement>(null);
  const closeMobileSearch = useCallback(() => setMobileSearchOpen(false), []);
  useDialogFocus(mobileSearchOpen, mobileSearchSheetRef, closeMobileSearch);
  const { listings: supplierListings, error: listingsLoadError, reload: reloadSupplierListings } =
    usePublishedSupplierListings({ emptyOnFirstError: false });
  const catalogLoading = isSupabaseConfigured() && supplierListings === null && !listingsLoadError;
  const [discountsByListing, setDiscountsByListing] = useState<Map<
    string,
    import('../data/supabase-discounts').ListingDiscount[]
  > | null>(null);
  /** Offers map is only for this catalog id key — not a prior fetch while ids change (Phase 1472). */
  const [discountsLoadedForKey, setDiscountsLoadedForKey] = useState<string | null>(null);
  const discountsLoadGenRef = useRef(0);
  const [reviewAggregates, setReviewAggregates] = useState<Map<string, { rating: number; count: number }>>(
    () => new Map()
  );
  const [dateCapacityByListing, setDateCapacityByListing] = useState<Record<
    string,
    {
      paid: number;
      dayCap?: number;
      fallbackCap: number | null;
      paidBySlot: Record<string, number>;
      departures: Array<{ startTimeHm: string; maxSpots: number }>;
    }
  > | null>(null);
  const [dateCapacityLoading, setDateCapacityLoading] = useState(false);
  const [dateCapacityError, setDateCapacityError] = useState<string | null>(null);
  /** Paid/cap snapshot is for one catalog + date — not a prior catalog while the same date reloads (Stays 1432 parity). */
  const [dateCapacityLoadedFor, setDateCapacityLoadedFor] = useState<string | null>(null);
  const dateCapacityReloadGenRef = useRef(0);

  const deferredSearch = useDeferredValue(searchTerm);

  // Read URL on mount and when user uses browser back/forward
  const syncStateFromUrl = useCallback(() => {
    const search = window.location.search;
    const parsed = parsePackagesSearchParams(search);
    setSearchTerm(parsed.searchTerm);
    setDraftWhere(parsed.searchTerm);
    setSelectedDestination(parsed.destination);
    setSelectedTags(parsed.tags);
    setSortBy(parsed.sort);
    setPriceRange(parsed.price);
    setFilterDate(parsed.date);
    setDraftDate(parsed.date);
    setFilterGuests(parsed.guests);
    setDraftGuests(parsed.guests);
    setPrivateOnly(parsed.privateOnly);
    setRatingFilter(parsed.rating);
    setDurationFilter(parsed.duration);
    setLanguageFilter(parsed.language);
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
        if (q) {
          setSearchTerm(q);
          setDraftWhere(q);
        }
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
      rating: ratingFilter,
      duration: durationFilter,
      language: languageFilter,
    });
    const newUrl = `${window.location.pathname}${query}`;
    if (window.location.pathname + window.location.search !== newUrl) {
      window.history.replaceState({}, '', newUrl);
    }
  }, [searchTerm, selectedDestination, selectedTags, sortBy, priceRange, filterDate, filterGuests, privateOnly, ratingFilter, durationFilter, languageFilter]);

  const allListings = useMemo(() => {
    let base;
    if (isSupabaseConfigured()) {
      // Phase 1356 / Stays parity: never invent browse catalog from localStorage while live fetch is pending or failed.
      base = supplierListings !== null ? [...supplierListings] : [];
    } else {
      base = [...getAllListings({ includeSeed: false, includeHolidayPackages: false })];
    }
    return filterCatalogByFamily(base, 'tour');
  }, [supplierListings]);

  // Phase 1275: chips / languages / JSON-LD must not advertise destinations that only
  // have season-ended tours (card filter already uses listingHasUpcomingBookableSeason).
  const seasonLiveListings = useMemo(
    () => allListings.filter((t) => listingHasUpcomingBookableSeason(t)),
    [allListings]
  );

  const supabaseListingIds = useMemo(
    () => allListings.map((t) => t.id).filter(isSupabaseListingId),
    [allListings]
  );
  const supabaseListingIdsKey = useMemo(() => supabaseListingIds.join(','), [supabaseListingIds]);

  const dateCapacityBrowseKey = useMemo(() => {
    if (!filterDate || !/^\d{4}-\d{2}-\d{2}$/.test(filterDate) || !supabaseListingIdsKey) return '';
    return `${supabaseListingIdsKey}|${filterDate}`;
  }, [filterDate, supabaseListingIdsKey]);

  const waitingOnDateCapacity =
    Boolean(filterDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(filterDate) &&
    isSupabaseConfigured() &&
    allListings.length > 0 &&
    Boolean(dateCapacityBrowseKey) &&
    !dateCapacityError &&
    (dateCapacityLoading ||
      dateCapacityByListing === null ||
      dateCapacityLoadedFor !== dateCapacityBrowseKey);
  const showCatalogLoading = catalogLoading || waitingOnDateCapacity;

  const dateCapacityForActiveFilter = useMemo(() => {
    if (!dateCapacityBrowseKey || dateCapacityLoadedFor !== dateCapacityBrowseKey) return null;
    return dateCapacityByListing;
  }, [dateCapacityBrowseKey, dateCapacityLoadedFor, dateCapacityByListing]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabaseListingIdsKey) {
      setReviewAggregates(new Map());
      setDiscountsByListing(null);
      setDiscountsLoadedForKey(null);
      return;
    }
    const ids = supabaseListingIdsKey.split(',');
    const keyAtStart = supabaseListingIdsKey;
    const gen = ++discountsLoadGenRef.current;
    setDiscountsByListing(null);
    setDiscountsLoadedForKey(null);
    let cancelled = false;
    // Phase 1194: decouple offers vs reviews (Home/Destination 1193 parity).
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
  }, [supabaseListingIdsKey]);

  const reloadDateCapacity = useCallback(() => {
    if (
      !filterDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(filterDate) ||
      !isSupabaseConfigured() ||
      allListings.length === 0 ||
      !supabaseListingIdsKey
    ) {
      setDateCapacityByListing(null);
      setDateCapacityLoadedFor(null);
      setDateCapacityLoading(false);
      setDateCapacityError(null);
      return () => {};
    }
    const browseKeyAtStart = `${supabaseListingIdsKey}|${filterDate}`;
    const reloadGen = ++dateCapacityReloadGenRef.current;
    let cancelled = false;
    setDateCapacityLoading(true);
    setDateCapacityError(null);
    // Phase 1350: keep prior map while reloading — clearing to null made a failed
    // reload treat every tour as open under the Capacity unavailable banner (1341/1344).
    void Promise.all(
      allListings.map(async (tour) => {
        try {
          const extras = parseListingExtras(tour.listingExtras);
          const opts = materializedBookingOptions(extras.bookingOptions ?? []);
          const fallbackCap = listingTourCapacityFromOptions(capacitySpotsFromBookingOptions(opts));
          const [caps, paidByDay, paidBySlot] = await Promise.all([
            fetchAvailabilityByListingId(tour.id, { fromDate: filterDate }),
            fetchPublishedTourPaidGuests(tour.id),
            fetchPublishedTourPaidGuestsBySlot(tour.id),
          ]);
          const dayRow = caps.find((r) => String(r.available_date ?? '').slice(0, 10) === filterDate);
          const departures = tourBookableSellingDeparturesOnDate(opts, filterDate, {
            cutoffHoursBeforeStart: extras.bookingCutoffHoursBeforeStart,
            timeZone: extras.departureTimezone,
          }).map((d) => ({
            startTimeHm: d.startTime,
            maxSpots: d.maxSpotsPerSlot,
          }));
          const slotForDay: Record<string, number> = {};
          for (const d of departures) {
            const key = tourPaidSlotKey(filterDate, d.startTimeHm);
            slotForDay[d.startTimeHm] = paidBySlot[key] ?? 0;
          }
          return [
            tour.id,
            {
              paid: paidByDay[filterDate] ?? 0,
              dayCap: dayRow ? dayRow.capacity : undefined,
              fallbackCap,
              paidBySlot: slotForDay,
              departures,
            },
          ] as const;
        } catch {
          // Phase 1192: one failed listing must not fail the whole date browse (1190 exclude).
          return null;
        }
      })
    )
      .then((entries) => {
        if (cancelled || reloadGen !== dateCapacityReloadGenRef.current) return;
        const ok = entries.filter((e): e is NonNullable<typeof e> => e != null);
        // Phase 1192 allows partial maps; zero successes must not mark browse loaded (invent “fully booked”).
        if (ok.length === 0 && allListings.length > 0) {
          setDateCapacityError(
            'We could not check tour capacity for that date. Check your connection and try again.'
          );
          setDateCapacityLoading(false);
          return;
        }
        setDateCapacityByListing(Object.fromEntries(ok));
        setDateCapacityLoadedFor(browseKeyAtStart);
        setDateCapacityLoading(false);
      })
      .catch((e) => {
        if (cancelled || reloadGen !== dateCapacityReloadGenRef.current) return;
        // Phase 1104: keep prior capacity map — null would make every tour look open.
        setDateCapacityError(
          userFacingError(e, 'We could not check tour capacity for that date. Check your connection and try again.')
        );
        setDateCapacityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filterDate, allListings, supabaseListingIdsKey]);

  useEffect(() => {
    return reloadDateCapacity();
  }, [reloadDateCapacity]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') reloadDateCapacity();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reloadDateCapacity]);

  // SEO: JSON-LD for listings (helps search engines understand tour offerings)
  useEffect(() => {
    if (seasonLiveListings.length === 0) {
      clearListingsJsonLd();
      return;
    }
    setListingsJsonLd(
      seasonLiveListings.slice(0, 20).map((t) => ({
        id: t.id,
        name: t.title,
        description: (t.description || '').slice(0, 500),
        image: t.image,
      }))
    );
    return () => clearListingsJsonLd();
  }, [seasonLiveListings]);

  const destinationOptions = useMemo(() => {
    return SHOW_SEED_LISTINGS ? SEED_DESTINATION_OPTIONS : getDestinationsFromListings(seasonLiveListings);
  }, [seasonLiveListings]);

  // Real per-listing currency (SUPPORTED_CURRENCIES has 9 codes) — null when the
  // visible catalog spans more than one, so price-chip labels never claim a
  // currency that isn't actually true for every listing they cover.
  const catalogCurrency = useMemo(
    () => catalogSharedCurrency(seasonLiveListings, normalizeCurrency),
    [seasonLiveListings]
  );
  const priceChips = useMemo(() => buildPriceChips(catalogCurrency, formatMoney), [catalogCurrency]);
  const languageOptions = useMemo(() => collectTourLanguages(seasonLiveListings), [seasonLiveListings]);
  const showDurationFilter = useMemo(
    () => catalogHasParseableDurations(seasonLiveListings),
    [seasonLiveListings]
  );

  // Hidden filters must not keep filtering — that would be a UI-only illusion.
  useEffect(() => {
    if (!showDurationFilter && durationFilter !== 'all') setDurationFilter('all');
  }, [showDurationFilter, durationFilter]);

  useEffect(() => {
    if (languageOptions.length === 0 && languageFilter && languageFilter !== 'all') {
      setLanguageFilter('');
    }
  }, [languageOptions.length, languageFilter]);

  // Phase 1363: hidden destination chips must not keep filtering (language/duration parity).
  useEffect(() => {
    if (
      selectedDestination !== 'all' &&
      !destinationOptions.some((c) => c.id === selectedDestination)
    ) {
      setSelectedDestination('all');
    }
  }, [destinationOptions, selectedDestination]);

  const ratingScoreForFilter = useCallback(
    (tour: TourPackage) => {
      if (!isSupabaseListingId(tour.id)) return null;
      const agg = reviewAggregates.get(tour.id);
      if (agg && agg.count > 0) return agg.rating;
      return null;
    },
    [reviewAggregates]
  );

  const ratingSortScore = useCallback(
    (tour: TourPackage) => {
      if (!isSupabaseListingId(tour.id)) return tour.rating;
      const agg = reviewAggregates.get(tour.id);
      if (agg && agg.count > 0) return agg.rating;
      return -1;
    },
    [reviewAggregates]
  );

  const { filteredPackages, matchingExceptCapacityCount, knownSoldOutForDate } = useMemo(() => {
    const guestCount = Number.parseInt(filterGuests, 10);
    const partySize = Number.isFinite(guestCount) && guestCount > 0 ? guestCount : 1;

    const matchExceptCapacity = (tour: TourPackage) =>
      tourMatchesCatalogFilters(tour, {
        q: deferredSearch,
        destinationId: selectedDestination,
        destinationOptions,
        tags: selectedTags,
        price: priceRange,
        date: filterDate,
        guests: filterGuests,
        privateOnly,
        rating: ratingFilter,
        duration: durationFilter,
        language: languageFilter,
        ratingScore: ratingScoreForFilter(tour),
        partyMax: getPartySizeBoundsKnown(tour)?.max ?? null,
        runsOnDate: filterDate
          ? listingHasBookableDepartureOnDate(tour, filterDate)
          : listingHasUpcomingBookableSeason(tour),
      });

    const exceptCapacity = allListings.filter(matchExceptCapacity);
    let knownSoldOutForDate = 0;
    let list = exceptCapacity.filter((tour) => {
      if (!filterDate) return true;
      // Phase 1350: unknown capacity must not invent open seats (null map).
      if (dateCapacityForActiveFilter == null) return false;
      const cap = dateCapacityForActiveFilter[tour.id];
      // Phase 1190: missing cap row while map is loaded → exclude (do not invent open).
      if (!cap) return false;
      const lacks = tourDateLacksCapacityForParty({
        paidGuestsThatDay: cap.paid,
        dayCapacity: cap.dayCap,
        fallbackCapacity: cap.fallbackCap,
        partySize,
        paidBySlot: cap.paidBySlot,
        departures: cap.departures,
        slotKey: (hm) => hm,
      });
      if (lacks) knownSoldOutForDate += 1;
      return !lacks;
    });

    if (sortBy === 'price-asc') list = [...list].sort((a, b) => listingBrowseAmount(a) - listingBrowseAmount(b));
    else if (sortBy === 'price-desc') list = [...list].sort((a, b) => listingBrowseAmount(b) - listingBrowseAmount(a));
    else if (sortBy === 'rating')
      list = [...list].sort((a, b) => ratingSortScore(b) - ratingSortScore(a));
    else if (sortBy === 'duration') list = [...list].sort((a, b) => durationToMinutes(a.duration) - durationToMinutes(b.duration));
    return {
      filteredPackages: list,
      matchingExceptCapacityCount: exceptCapacity.length,
      knownSoldOutForDate,
    };
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
    ratingFilter,
    durationFilter,
    languageFilter,
    ratingSortScore,
    ratingScoreForFilter,
    dateCapacityForActiveFilter,
  ]);

  // Phase 1193: “Fully booked” only when known capacity sold out — not all-unknown-cap excludes (1190).
  const emptyDueToSoldOutDate =
    filteredPackages.length === 0 &&
    Boolean(filterDate) &&
    dateCapacityForActiveFilter != null &&
    matchingExceptCapacityCount > 0 &&
    knownSoldOutForDate > 0;

  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    selectedDestination !== 'all' ||
    selectedTags.length > 0 ||
    priceRange !== 'all' ||
    filterDate !== '' ||
    filterGuests !== '' ||
    privateOnly ||
    ratingFilter !== 'all' ||
    durationFilter !== 'all' ||
    Boolean(languageFilter && languageFilter !== 'all');

  const clearAllFilters = () => {
    setSearchTerm('');
    setDraftWhere('');
    setSelectedDestination('all');
    setSelectedTags([]);
    setPriceRange('all');
    setSortBy('recommended');
    setFilterDate('');
    setDraftDate('');
    setFilterGuests('');
    setDraftGuests('');
    setPrivateOnly(false);
    setRatingFilter('all');
    setDurationFilter('all');
    setLanguageFilter('');
  };

  const applyPrimarySearch = useCallback(() => {
    setSearchTerm(draftWhere);
    setFilterDate(draftDate);
    setFilterGuests(draftGuests);
    setMobileSearchOpen(false);
    const q = draftWhere.trim();
    if (q) {
      recordTravelerInterest({ kind: 'search', key: q, family: 'tour' });
    }
  }, [draftWhere, draftDate, draftGuests]);

  const patchDraftSearch = useCallback(
    (patch: Partial<{ where: string; date: string; guests: string }>) => {
      if (patch.where !== undefined) {
        const destOnly = !draftWhere.trim() && selectedDestination !== 'all';
        setDraftWhere(patch.where);
        if (!patch.where.trim() || destOnly) setSelectedDestination('all');
      }
      if (patch.date !== undefined) setDraftDate(patch.date);
      if (patch.guests !== undefined) setDraftGuests(patch.guests);
    },
    [draftWhere, selectedDestination]
  );

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev => prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]);
  };

  const handleTourSelect = (tour: TourPackage) => {
    analytics.listingClick(tour.id, tour.title);
    if (onTourSelect) onTourSelect(tour);
  };

  const extraFilterCount =
    (selectedDestination !== 'all' ? 1 : 0) +
    selectedTags.length +
    (priceRange !== 'all' ? 1 : 0) +
    (privateOnly ? 1 : 0) +
    (ratingFilter !== 'all' ? 1 : 0) +
    (durationFilter !== 'all' ? 1 : 0) +
    (languageFilter && languageFilter !== 'all' ? 1 : 0);

  const searchValues = useMemo(
    () => ({
      where: marketplaceWhereDisplay(draftWhere, selectedDestination, destinationOptions),
      date: draftDate,
      checkout: '',
      guests: draftGuests,
    }),
    [draftWhere, selectedDestination, destinationOptions, draftDate, draftGuests]
  );

  const mobileSearchSummary = useMemo(() => {
    const where =
      marketplaceWhereDisplay(draftWhere, selectedDestination, destinationOptions).trim() || 'Anywhere';
    const whenLabel = draftDate || 'Any date';
    const whoLabel = draftGuests.trim()
      ? `${draftGuests} ${Number(draftGuests) === 1 ? 'traveler' : 'travelers'}`
      : 'Add travelers';
    return { where, whenLabel, whoLabel };
  }, [draftWhere, selectedDestination, destinationOptions, draftDate, draftGuests]);

  const destLabel =
    selectedDestination !== 'all'
      ? destinationOptions.find((c) => c.id === selectedDestination)?.label
      : searchTerm.trim() || null;
  const resultTitle = showCatalogLoading ? (
    <span className="inline-block h-6 w-40 rounded bg-black/[0.06] animate-pulse align-middle" aria-hidden />
  ) : (
    <>
      {filteredPackages.length} {filteredPackages.length === 1 ? 'tour' : 'tours'}
      {destLabel ? ` in ${destLabel}` : ''}
      {searchTerm.trim() !== '' && searchTerm !== deferredSearch ? ' · Updating…' : ''}
    </>
  );

  const filterPanel = (
    <>
      <MarketplaceFilterSection title="Destination">
        <MarketplaceFilterChipRow>
          {destinationOptions.map((chip) => (
            <MarketplaceFilterChip
              key={chip.id}
              pressed={selectedDestination === chip.id}
              onClick={() => setSelectedDestination(chip.id)}
            >
              {chip.label}
            </MarketplaceFilterChip>
          ))}
        </MarketplaceFilterChipRow>
      </MarketplaceFilterSection>
      <MarketplaceFilterSection
        title="Price"
        hint={!catalogCurrency ? 'Amounts in each tour’s own currency' : undefined}
      >
        <MarketplaceFilterChipRow>
          {priceChips.map((chip) => (
            <MarketplaceFilterChip
              key={chip.id}
              pressed={priceRange === chip.id}
              onClick={() => setPriceRange(chip.id)}
            >
              {chip.label}
            </MarketplaceFilterChip>
          ))}
        </MarketplaceFilterChipRow>
      </MarketplaceFilterSection>
      <MarketplaceFilterSection title="Rating">
        <MarketplaceFilterChipRow>
          {RATING_FILTER_CHIPS.map((chip) => (
            <MarketplaceFilterChip
              key={chip.id}
              pressed={ratingFilter === chip.id}
              onClick={() => setRatingFilter(chip.id)}
            >
              {chip.label}
            </MarketplaceFilterChip>
          ))}
        </MarketplaceFilterChipRow>
      </MarketplaceFilterSection>
      {showDurationFilter ? (
        <MarketplaceFilterSection title="Duration">
          <MarketplaceFilterChipRow>
            {DURATION_FILTER_CHIPS.map((chip) => (
              <MarketplaceFilterChip
                key={chip.id}
                pressed={durationFilter === chip.id}
                onClick={() => setDurationFilter(chip.id)}
              >
                {chip.label}
              </MarketplaceFilterChip>
            ))}
          </MarketplaceFilterChipRow>
        </MarketplaceFilterSection>
      ) : null}
      {languageOptions.length > 0 ? (
        <MarketplaceFilterSection title="Languages">
          <MarketplaceFilterChipRow>
            <MarketplaceFilterChip
              pressed={!languageFilter || languageFilter === 'all'}
              onClick={() => setLanguageFilter('')}
            >
              Any language
            </MarketplaceFilterChip>
            {languageOptions.map((chip) => (
              <MarketplaceFilterChip
                key={chip.id}
                pressed={languageFilter === chip.id}
                onClick={() => setLanguageFilter(chip.id)}
              >
                {chip.label}
              </MarketplaceFilterChip>
            ))}
          </MarketplaceFilterChipRow>
        </MarketplaceFilterSection>
      ) : null}
      <MarketplaceFilterSection title="Details">
        <MarketplaceFilterChipRow>
          <MarketplaceFilterChip pressed={privateOnly} onClick={() => setPrivateOnly((v) => !v)}>
            Private tours
          </MarketplaceFilterChip>
          {TAG_OPTIONS.map((tag) => (
            <MarketplaceFilterChip
              key={tag.id}
              pressed={selectedTags.includes(tag.id)}
              onClick={() => toggleTag(tag.id)}
            >
              {tag.label}
            </MarketplaceFilterChip>
          ))}
        </MarketplaceFilterChipRow>
      </MarketplaceFilterSection>
    </>
  );

  const sortControl = (
    <MarketplaceSortSelect
      value={sortBy}
      onChange={(v) => setSortBy(parseMarketplaceSort(v))}
      options={TOUR_SORT_OPTIONS}
    />
  );

  const destSummary =
    selectedDestination !== 'all'
      ? destinationOptions.find((c) => c.id === selectedDestination)?.label ?? selectedDestination
      : null;
  const priceSummary = priceRange !== 'all' ? priceChips.find((c) => c.id === priceRange)?.label ?? priceRange : null;
  const ratingSummary =
    ratingFilter !== 'all' ? RATING_FILTER_CHIPS.find((c) => c.id === ratingFilter)?.label ?? ratingFilter : null;
  const durationSummary =
    durationFilter !== 'all' ? DURATION_FILTER_CHIPS.find((c) => c.id === durationFilter)?.label ?? durationFilter : null;
  const languageSummary =
    languageFilter && languageFilter !== 'all' ? languageLabel(languageFilter) || languageFilter : null;
  const detailsActive = privateOnly || selectedTags.length > 0;
  const detailsSummary = detailsActive
    ? [
        privateOnly ? 'Private' : null,
        selectedTags.length ? `${selectedTags.length} tag${selectedTags.length === 1 ? '' : 's'}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  const desktopFilters = (
    <MarketplaceSecondaryFilterRow sortControl={sortControl}>
      <MarketplaceFilterMenu label="Destination" closeOnSelect summary={destSummary} active={selectedDestination !== 'all'}>
        <MarketplaceFilterChipRow>
          {destinationOptions.map((chip) => (
            <MarketplaceFilterChip
              key={chip.id}
              pressed={selectedDestination === chip.id}
              onClick={() => setSelectedDestination(chip.id)}
            >
              {chip.label}
            </MarketplaceFilterChip>
          ))}
        </MarketplaceFilterChipRow>
      </MarketplaceFilterMenu>
      <MarketplaceFilterMenu label="Price" closeOnSelect summary={priceSummary} active={priceRange !== 'all'}>
        <MarketplaceFilterChipRow>
          {priceChips.map((chip) => (
            <MarketplaceFilterChip
              key={chip.id}
              pressed={priceRange === chip.id}
              onClick={() => setPriceRange(chip.id)}
            >
              {chip.label}
            </MarketplaceFilterChip>
          ))}
        </MarketplaceFilterChipRow>
      </MarketplaceFilterMenu>
      <MarketplaceFilterMenu label="Rating" closeOnSelect summary={ratingSummary} active={ratingFilter !== 'all'}>
        <MarketplaceFilterChipRow>
          {RATING_FILTER_CHIPS.map((chip) => (
            <MarketplaceFilterChip
              key={chip.id}
              pressed={ratingFilter === chip.id}
              onClick={() => setRatingFilter(chip.id)}
            >
              {chip.label}
            </MarketplaceFilterChip>
          ))}
        </MarketplaceFilterChipRow>
      </MarketplaceFilterMenu>
      {showDurationFilter ? (
        <MarketplaceFilterMenu label="Duration" closeOnSelect summary={durationSummary} active={durationFilter !== 'all'}>
          <MarketplaceFilterChipRow>
            {DURATION_FILTER_CHIPS.map((chip) => (
              <MarketplaceFilterChip
                key={chip.id}
                pressed={durationFilter === chip.id}
                onClick={() => setDurationFilter(chip.id)}
              >
                {chip.label}
              </MarketplaceFilterChip>
            ))}
          </MarketplaceFilterChipRow>
        </MarketplaceFilterMenu>
      ) : null}
      {languageOptions.length > 0 ? (
        <MarketplaceFilterMenu
          label="Languages"
          closeOnSelect
          summary={languageSummary}
          active={Boolean(languageFilter && languageFilter !== 'all')}
        >
          <MarketplaceFilterChipRow>
            <MarketplaceFilterChip
              pressed={!languageFilter || languageFilter === 'all'}
              onClick={() => setLanguageFilter('')}
            >
              Any language
            </MarketplaceFilterChip>
            {languageOptions.map((chip) => (
              <MarketplaceFilterChip
                key={chip.id}
                pressed={languageFilter === chip.id}
                onClick={() => setLanguageFilter(chip.id)}
              >
                {chip.label}
              </MarketplaceFilterChip>
            ))}
          </MarketplaceFilterChipRow>
        </MarketplaceFilterMenu>
      ) : null}
      <MarketplaceFilterMenu label="More" summary={detailsSummary} active={detailsActive}>
        <MarketplaceFilterChipRow>
          <MarketplaceFilterChip pressed={privateOnly} onClick={() => setPrivateOnly((v) => !v)}>
            Private tours
          </MarketplaceFilterChip>
          {TAG_OPTIONS.map((tag) => (
            <MarketplaceFilterChip
              key={tag.id}
              pressed={selectedTags.includes(tag.id)}
              onClick={() => toggleTag(tag.id)}
            >
              {tag.label}
            </MarketplaceFilterChip>
          ))}
        </MarketplaceFilterChipRow>
      </MarketplaceFilterMenu>
    </MarketplaceSecondaryFilterRow>
  );

  return (
    <>
      <MarketplaceBrowseShell
        headingId="tours-heading"
        resultTitle={resultTitle}
        familyNav={
          <MarketplaceFamilySwitch
            current="tours"
            onTours={() => undefined}
            onStays={() => {
              if (!onNavigate) return;
              const next = marketplaceFamilySwitchPath('stays', {
                q: searchTerm,
                destination: selectedDestination !== 'all' ? selectedDestination : undefined,
                date: filterDate,
                guests: filterGuests,
              });
              window.history.pushState({}, '', next);
              onNavigate('stays');
            }}
          />
        }
        search={
          <MarketplaceSearchPill
            family="tours"
            values={searchValues}
            onChange={patchDraftSearch}
            onSubmit={(e) => {
              e.preventDefault();
              applyPrimarySearch();
            }}
            idPrefix="tours"
            trailing={
              <button
                type="submit"
                className="h-12 self-center px-6 rounded-full bg-finland text-white text-sm font-semibold hover:bg-finland-dark shadow-sm"
              >
                Search
              </button>
            }
          />
        }
        mobileSearch={
          <MarketplaceMobileSearchTrigger
            where={mobileSearchSummary.where}
            whenLabel={mobileSearchSummary.whenLabel}
            whoLabel={mobileSearchSummary.whoLabel}
            onClick={() => setMobileSearchOpen(true)}
            expanded={mobileSearchOpen}
            controlsId="tours-mobile-search-dialog"
          />
        }
        filterCount={extraFilterCount}
        filtersOpen={mobileFiltersOpen}
        onOpenFilters={() => setMobileFiltersOpen(true)}
        onCloseFilters={closeMobileFilters}
        filterSheetRef={filterSheetRef}
        filterPanel={filterPanel}
        desktopFilters={desktopFilters}
        filterFooter={
          <>
            {extraFilterCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  clearAllFilters();
                  setMobileFiltersOpen(false);
                }}
                className="tv-btn-secondary flex-1"
              >
                Clear
              </button>
            ) : null}
            <button type="button" onClick={closeMobileFilters} className="tv-btn-primary flex-1">
              Show {filteredPackages.length}
            </button>
          </>
        }
        sortControl={sortControl}
        activeChips={
          hasActiveFilters ? (
            <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
              {searchTerm.trim() !== '' ? (
                <MarketplaceActiveChip
                  label={`“${searchTerm.trim().slice(0, 36)}${searchTerm.trim().length > 36 ? '…' : ''}”`}
                  onRemove={() => {
                    setSearchTerm('');
                    setDraftWhere('');
                  }}
                />
              ) : null}
              {selectedDestination !== 'all' ? (
                <MarketplaceActiveChip
                  label={destinationOptions.find((c) => c.id === selectedDestination)?.label ?? selectedDestination}
                  onRemove={() => setSelectedDestination('all')}
                />
              ) : null}
              {selectedTags.map((tagId) => (
                <MarketplaceActiveChip
                  key={tagId}
                  label={TAG_OPTIONS.find((t) => t.id === tagId)?.label ?? tagId}
                  onRemove={() => toggleTag(tagId)}
                />
              ))}
              {priceRange !== 'all' ? (
                <MarketplaceActiveChip
                  label={priceChips.find((c) => c.id === priceRange)?.label ?? priceRange}
                  onRemove={() => setPriceRange('all')}
                />
              ) : null}
              {filterDate ? (
                <MarketplaceActiveChip
                  // Phase 1600: human date — match search summary / booking date display.
                  label={formatBookingDateDisplay(filterDate) || filterDate}
                  onRemove={() => {
                    setFilterDate('');
                    setDraftDate('');
                  }}
                />
              ) : null}
              {filterGuests ? (
                <MarketplaceActiveChip
                  label={`${filterGuests} ${filterGuests === '1' ? 'traveler' : 'travelers'}`}
                  onRemove={() => {
                    setFilterGuests('');
                    setDraftGuests('');
                  }}
                />
              ) : null}
              {privateOnly ? <MarketplaceActiveChip label="Private tours" onRemove={() => setPrivateOnly(false)} /> : null}
              {ratingFilter !== 'all' ? (
                <MarketplaceActiveChip
                  label={RATING_FILTER_CHIPS.find((c) => c.id === ratingFilter)?.label ?? ratingFilter}
                  onRemove={() => setRatingFilter('all')}
                />
              ) : null}
              {durationFilter !== 'all' ? (
                <MarketplaceActiveChip
                  label={DURATION_FILTER_CHIPS.find((c) => c.id === durationFilter)?.label ?? durationFilter}
                  onRemove={() => setDurationFilter('all')}
                />
              ) : null}
              {languageFilter && languageFilter !== 'all' ? (
                <MarketplaceActiveChip
                  label={languageLabel(languageFilter) || languageFilter}
                  onRemove={() => setLanguageFilter('')}
                />
              ) : null}
              <button
                type="button"
                onClick={clearAllFilters}
                className="lux-flat rounded-full bg-finland px-3 py-1.5 text-xs font-semibold text-white shadow-sm ring-1 ring-finland/30"
              >
                Clear all
              </button>
            </div>
          ) : null
        }
      >
        {listingsLoadError && isSupabaseConfigured() ? (
          <ErrorState
            className="mb-6 py-6"
            title="Tours unavailable"
            body={userFacingError(listingsLoadError, USER_ERROR.tours)}
            retry={{ onClick: () => reloadSupplierListings() }}
            extra={
              <a href="/contact" className="tv-btn-ghost inline-flex">
                Contact support
              </a>
            }
          />
        ) : null}
        {dateCapacityError && filterDate ? (
          <ErrorState
            className="mb-6 py-6"
            title="Capacity unavailable"
            body={dateCapacityError}
            retry={{ onClick: () => reloadDateCapacity() }}
            extra={
              <a href="/contact" className="tv-btn-ghost inline-flex">
                Contact support
              </a>
            }
          />
        ) : null}
        {showCatalogLoading ? (
          <SkeletonCardGrid count={6} />
        ) : dateCapacityError && filterDate && dateCapacityLoadedFor !== dateCapacityBrowseKey ? null : allListings.length > 0 &&
          filteredPackages.length > 0 ? (
          <>
            <div className={MARKETPLACE_BROWSE_GRID_CLASS}>
              {filteredPackages.map((tour, index) => (
                <PublicListingBrowseCard
                  key={tour.id}
                  tour={tour}
                  index={index}
                  onSelect={() => handleTourSelect(tour)}
                  discountsByListing={
                    discountsLoadedForKey === supabaseListingIdsKey ? discountsByListing : null
                  }
                  reviewAggregate={reviewAggregates.get(tour.id)}
                  tagLabels={TAG_LABELS}
                  size="compact"
                  // Phase 1601: surface marketplace tags (small-group, pickup, etc.) on browse cards.
                  showTagPills
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
            <p className="mt-8 text-sm text-ink-faint max-w-lg">
              Showing published tours from independent operators.
            </p>
          </>
        ) : listingsLoadError || dateCapacityError ? null : (
          <div className="rounded-2xl bg-paper-raised px-6 py-2 shadow-soft ring-1 ring-black/[0.06] sm:px-8">
            {allListings.length > 0 ? (
              <EmptyState
                className="py-8 sm:py-10 max-w-lg"
                icon={Search}
                title={emptyDueToSoldOutDate ? 'Fully booked for that date' : 'No tours match'}
                body={
                  emptyDueToSoldOutDate
                    ? 'Tours that match your other filters are sold out or do not have enough spots left for your party. Try another date or fewer guests.'
                    : toursBrowseFilteredEmptyBody(searchTerm.trim() !== '')
                }
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
                className="py-8 sm:py-10 max-w-lg"
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
      </MarketplaceBrowseShell>

      {mobileSearchOpen ? (
        <div ref={mobileSearchSheetRef} className="tv-sheet-overlay sm:hidden">
          <button type="button" tabIndex={-1} className="absolute inset-0" aria-label="Close search" onClick={closeMobileSearch} />
          <aside
            id="tours-mobile-search-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tours-mobile-search-title"
            className="tv-sheet-panel relative flex max-h-[min(92dvh,40rem)] flex-col overflow-hidden motion-safe:animate-slide-up"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland">Search</p>
                <h2 id="tours-mobile-search-title" className="font-display text-2xl text-ink tracking-tight mt-1">
                  Find a tour
                </h2>
              </div>
              <button
                type="button"
                onClick={closeMobileSearch}
                className="lux-tap-target inline-flex min-h-11 min-w-11 items-center justify-center p-2 -mr-1"
                aria-label="Close"
              >
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto space-y-1 rounded-2xl bg-black/[0.02] p-1 ring-1 ring-black/[0.04]">
              <MarketplaceSearchFields
                family="tours"
                values={searchValues}
                onChange={patchDraftSearch}
                idPrefix="tours-sheet"
                stacked
              />
            </div>
            <div className="mt-5 flex gap-2 shrink-0">
              {draftWhere ||
              draftDate ||
              draftGuests ||
              searchTerm ||
              filterDate ||
              filterGuests ||
              selectedDestination !== 'all' ? (
                <button
                  type="button"
                  onClick={() => {
                    setDraftWhere('');
                    setDraftDate('');
                    setDraftGuests('');
                    setSearchTerm('');
                    setFilterDate('');
                    setFilterGuests('');
                    setSelectedDestination('all');
                  }}
                  className="tv-btn-secondary flex-1"
                >
                  Clear
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  applyPrimarySearch();
                  closeMobileSearch();
                }}
                className="tv-btn-primary flex-1"
              >
                Search
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
