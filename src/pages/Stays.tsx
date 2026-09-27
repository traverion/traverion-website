import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Compass, Search, X } from 'lucide-react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { usePublishedSupplierListings } from '../hooks/usePublishedSupplierListings';
import { useTravelerWishlist } from '../hooks/useTravelerWishlist';
import { isSupabaseConfigured } from '../lib/supabase';
import { getAllListings } from '../data/listings';
import { filterCatalogByFamily } from '../lib/inventory';
import { parseListingExtras } from '../types/listingExtras';
import { PublicListingBrowseCard } from '../components/PublicListingBrowseCard';
import { quoteStayNights, experienceTodayIsoForListing } from '../lib/booking-quote';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import NoticeCallout from '../components/NoticeCallout';
import { SkeletonCardGrid } from '../components/ui/Skeleton';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { supplierPortalLandingHref } from '../lib/partnerHost';
import { STRIPE_CHECKOUT_CANCELLED_STAY_COPY, readStripeCheckoutReturnBanner } from '../lib/booking-confirmation-copy';
import { addCalendarDays, stayAvailableForRequestedNights, nightsOccupiedByStay } from '../lib/stayOccupancy';
import { fetchPublishedStayOccupiedRanges, fetchPublishedStayBlockedNights } from '../data/supabase-bookings';
import type { TourPackage } from '../types/tour';
import { formatStayNightHuman } from '../lib/stay-calendar';
import { isSupabaseListingId } from '../lib/discount-display';
import { fetchDiscountsByListingIds } from '../data/supabase-discounts';
import { getReviewAggregatesForListingIds } from '../data/supabase-reviews';
import { formatMoney, normalizeCurrency } from '../lib/money';
import { recordTravelerInterest } from '../lib/traveler-interest';
import { MarketplaceBrowseShell, MarketplaceFamilySwitch, MarketplaceSortSelect } from '../components/marketplace/MarketplaceBrowseShell';
import {
  MarketplaceActiveChip,
  MarketplaceFilterChip,
  MarketplaceFilterChipRow,
  MarketplaceFilterSection,
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
import {
  buildPriceChips,
  catalogSharedCurrency,
  collectStayAmenities,
  collectStayPropertyTypes,
  listingBrowseAmount,
  marketplaceFamilySwitchPath,
  MARKETPLACE_BROWSE_GRID_CLASS,
  parseMarketplaceSort,
  parsePriceChipId,
  parseRatingFilterId,
  RATING_FILTER_CHIPS,
  stayMatchesCatalogFilters,
  type MarketplaceSearchValues,
  type MarketplaceSortOption,
  type PriceChipId,
  type RatingFilterId,
} from '../lib/marketplaceBrowse';

type Props = {
  onStaySelect: (stay: TourPackage) => void;
  onNavigate?: (page: string) => void;
};

const STAY_SORT_OPTIONS = [
  { id: 'recommended', label: 'Catalog order' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'rating', label: 'Guest rating' },
];

function parseStaysSearch(search: string) {
  const p = new URLSearchParams(search);
  const amenities = (p.get('amenities') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    q: p.get('q') ?? '',
    checkIn: p.get('date') ?? '',
    checkOut: p.get('checkout') ?? '',
    guests: p.get('guests') ?? '',
    propertyType: p.get('type') ?? 'all',
    price: parsePriceChipId(p.get('price')),
    amenities,
    sort: parseMarketplaceSort(p.get('sort')),
    rating: parseRatingFilterId(p.get('rating')),
  };
}

export default function Stays({ onStaySelect, onNavigate }: Props) {
  const { listings: supplierListings, error, reload } = usePublishedSupplierListings();
  const wishlist = useTravelerWishlist();
  const initial = parseStaysSearch(typeof window === 'undefined' ? '' : window.location.search);
  const [paymentBanner] = useState<'cancelled' | null>(() =>
    typeof window === 'undefined'
      ? null
      : readStripeCheckoutReturnBanner(window.location.search) === 'cancelled'
        ? 'cancelled'
        : null
  );

  useEffect(() => {
    if (readStripeCheckoutReturnBanner(window.location.search) !== 'cancelled') return;
    const url = new URL(window.location.href);
    url.searchParams.delete('payment');
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, []);
  const catalogLoading = isSupabaseConfigured() && supplierListings === null;
  const [q, setQ] = useState(initial.q);
  const [checkIn, setCheckIn] = useState(initial.checkIn);
  const [checkOut, setCheckOut] = useState(initial.checkOut);
  const [guests, setGuests] = useState(initial.guests);
  /** Draft primary search — applied only on Search submit. */
  const [draftWhere, setDraftWhere] = useState(initial.q);
  const [draftCheckIn, setDraftCheckIn] = useState(initial.checkIn);
  const [draftCheckOut, setDraftCheckOut] = useState(initial.checkOut);
  const [draftGuests, setDraftGuests] = useState(initial.guests);
  const [propertyType, setPropertyType] = useState(initial.propertyType);
  const [priceRange, setPriceRange] = useState<PriceChipId>(initial.price);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(initial.amenities);
  const [sortBy, setSortBy] = useState<MarketplaceSortOption>(
    initial.sort === 'duration' ? 'recommended' : initial.sort
  );
  const [ratingFilter, setRatingFilter] = useState<RatingFilterId>(initial.rating);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchSheetRef = useRef<HTMLDivElement>(null);
  const closeMobileSearch = useCallback(() => setMobileSearchOpen(false), []);
  useDialogFocus(mobileSearchOpen, mobileSearchSheetRef, closeMobileSearch);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filterSheetRef = useRef<HTMLDivElement>(null);
  const closeMobileFilters = useCallback(() => setMobileFiltersOpen(false), []);
  useDialogFocus(mobileFiltersOpen, filterSheetRef, closeMobileFilters);
  const [occupiedByListing, setOccupiedByListing] = useState<Record<
    string,
    { ranges: { checkIn: string; checkOut: string }[]; blockedNights: string[] }
  > | null>(null);
  const [occupancyLoading, setOccupancyLoading] = useState(false);
  const [occupancyError, setOccupancyError] = useState<string | null>(null);
  const [discountsByListing, setDiscountsByListing] = useState<Map<
    string,
    import('../data/supabase-discounts').ListingDiscount[]
  > | null>(null);
  const [reviewAggregates, setReviewAggregates] = useState<Map<string, { rating: number; count: number }>>(
    () => new Map()
  );

  const syncStateFromUrl = useCallback(() => {
    const parsed = parseStaysSearch(window.location.search);
    setQ(parsed.q);
    setDraftWhere(parsed.q);
    setCheckIn(parsed.checkIn);
    setDraftCheckIn(parsed.checkIn);
    setCheckOut(parsed.checkOut);
    setDraftCheckOut(parsed.checkOut);
    setGuests(parsed.guests);
    setDraftGuests(parsed.guests);
    setPropertyType(parsed.propertyType);
    setPriceRange(parsed.price);
    setSelectedAmenities(parsed.amenities);
    setSortBy(parsed.sort === 'duration' ? 'recommended' : parsed.sort);
    setRatingFilter(parsed.rating);
  }, []);

  useEffect(() => {
    const onPopState = () => syncStateFromUrl();
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [syncStateFromUrl]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (checkIn) p.set('date', checkIn);
    if (checkOut) p.set('checkout', checkOut);
    if (guests) p.set('guests', guests);
    if (propertyType && propertyType !== 'all') p.set('type', propertyType);
    if (priceRange !== 'all') p.set('price', priceRange);
    if (selectedAmenities.length) p.set('amenities', selectedAmenities.join(','));
    if (sortBy !== 'recommended') p.set('sort', sortBy);
    if (ratingFilter !== 'all') p.set('rating', ratingFilter);
    const next = p.toString() ? `/stays?${p.toString()}` : '/stays';
    if (window.location.pathname + window.location.search !== next) {
      window.history.replaceState({}, '', next);
    }
  }, [q, checkIn, checkOut, guests, propertyType, priceRange, selectedAmenities, sortBy, ratingFilter]);

  const stays = useMemo(() => {
    const base =
      isSupabaseConfigured() && supplierListings !== null
        ? supplierListings
        : getAllListings({ includeSeed: false, includeHolidayPackages: false });
    return filterCatalogByFamily(base, 'stay');
  }, [supplierListings]);

  const dateFilterActive = Boolean(checkIn && checkOut && checkOut > checkIn);

  // Invalid ranges from shared URLs must not silently ignore dates.
  useEffect(() => {
    if (checkIn && checkOut && checkOut <= checkIn) {
      setCheckOut(addCalendarDays(checkIn, 1));
    }
  }, [checkIn, checkOut]);

  const patchDraftSearch = useCallback((patch: Partial<MarketplaceSearchValues>) => {
    if (patch.where !== undefined) setDraftWhere(patch.where);
    if (patch.date !== undefined) setDraftCheckIn(patch.date);
    if (patch.checkout !== undefined) setDraftCheckOut(patch.checkout);
    if (patch.guests !== undefined) setDraftGuests(patch.guests);
  }, []);

  const applyPrimarySearch = useCallback(() => {
    let nextIn = draftCheckIn;
    let nextOut = draftCheckOut;
    if (nextIn && nextOut && nextOut <= nextIn) {
      nextOut = addCalendarDays(nextIn, 1);
    } else if (nextIn && !nextOut) {
      nextOut = addCalendarDays(nextIn, 1);
    }
    setQ(draftWhere);
    setCheckIn(nextIn);
    setCheckOut(nextOut);
    setDraftCheckOut(nextOut);
    setGuests(draftGuests);
    setMobileSearchOpen(false);
    const query = draftWhere.trim();
    if (query) {
      recordTravelerInterest({ kind: 'search', key: query, family: 'stay' });
    }
  }, [draftWhere, draftCheckIn, draftCheckOut, draftGuests]);

  const reloadStayBrowseOccupancy = useCallback(() => {
    if (!dateFilterActive || stays.length === 0 || !isSupabaseConfigured()) {
      setOccupiedByListing(null);
      setOccupancyLoading(false);
      setOccupancyError(null);
      return () => {};
    }
    let cancelled = false;
    setOccupancyLoading(true);
    setOccupancyError(null);
    void Promise.all(
      stays.map(async (s) => {
        try {
          const [ranges, blockedNights] = await Promise.all([
            fetchPublishedStayOccupiedRanges(s.id),
            fetchPublishedStayBlockedNights(s.id, {
              fromDate: experienceTodayIsoForListing(parseListingExtras(s.listingExtras).departureTimezone),
            }),
          ]);
          return [s.id, { ranges, blockedNights }] as const;
        } catch {
          // Phase 1192: one failed stay must not fail the whole night browse (Packages parity).
          return null;
        }
      })
    )
      .then((entries) => {
        if (cancelled) return;
        setOccupiedByListing(
          Object.fromEntries(entries.filter((e): e is NonNullable<typeof e> => e != null))
        );
        setOccupancyLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        // Phase 1188: keep prior occupancy map — null would make every stay look open (Packages 1104).
        setOccupancyError(
          userFacingError(e, 'We could not check stay availability. Check your connection and try again.')
        );
        setOccupancyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateFilterActive, stays]);

  useEffect(() => {
    return reloadStayBrowseOccupancy();
  }, [reloadStayBrowseOccupancy]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') reloadStayBrowseOccupancy();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reloadStayBrowseOccupancy]);

  const stayIdsKey = useMemo(() => stays.map((s) => s.id).filter(isSupabaseListingId).join(','), [stays]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !stayIdsKey) {
      setReviewAggregates(new Map());
      setDiscountsByListing(null);
      return;
    }
    const ids = stayIdsKey.split(',');
    let cancelled = false;
    // Phase 1194: decouple offers vs reviews (Home/Destination 1193 parity).
    void fetchDiscountsByListingIds(ids)
      .then((discounts) => {
        if (!cancelled) setDiscountsByListing(discounts);
      })
      .catch(() => {
        // Phase 1151/1166: empty map → honest list From (not endless "Checking offers…").
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
  }, [stayIdsKey]);

  const catalogCurrency = useMemo(() => catalogSharedCurrency(stays, normalizeCurrency), [stays]);
  const priceChips = useMemo(() => buildPriceChips(catalogCurrency, formatMoney), [catalogCurrency]);
  const propertyTypes = useMemo(() => collectStayPropertyTypes(stays), [stays]);
  const amenityOptions = useMemo(() => collectStayAmenities(stays), [stays]);

  // Hidden filters must not keep filtering — that would be a UI-only illusion.
  useEffect(() => {
    if (propertyTypes.length === 0 && propertyType && propertyType !== 'all') {
      setPropertyType('all');
    }
  }, [propertyTypes.length, propertyType]);

  useEffect(() => {
    if (amenityOptions.length === 0 && selectedAmenities.length > 0) {
      setSelectedAmenities([]);
    }
  }, [amenityOptions.length, selectedAmenities.length]);

  const { filtered, knownOccupiedForNights } = useMemo(() => {
    let knownOccupied = 0;
    let list = stays.filter((s) => {
      const agg = reviewAggregates.get(s.id);
      if (
        !stayMatchesCatalogFilters(s, {
          q,
          guests,
          propertyType,
          price: priceRange,
          amenities: selectedAmenities,
          rating: ratingFilter,
          ratingScore: agg && agg.count > 0 ? agg.rating : null,
        })
      ) {
        return false;
      }
      const extras = parseListingExtras(s.listingExtras);
      if (dateFilterActive) {
        const requestedNights = nightsOccupiedByStay(checkIn, checkOut).length;
        const minN = extras.stay?.minNights ?? 1;
        if (requestedNights < minN) return false;
      }
      if (dateFilterActive && occupiedByListing) {
        const pack = occupiedByListing[s.id];
        // Phase 1193: missing occupancy row → exclude (do not invent open nights).
        if (!pack) return false;
        if (!stayAvailableForRequestedNights(checkIn, checkOut, pack.ranges)) {
          knownOccupied += 1;
          return false;
        }
        const blocked = new Set(pack.blockedNights);
        if (nightsOccupiedByStay(checkIn, checkOut).some((n) => blocked.has(n))) {
          knownOccupied += 1;
          return false;
        }
      }
      return true;
    });
    if (sortBy === 'price-asc') list = [...list].sort((a, b) => listingBrowseAmount(a) - listingBrowseAmount(b));
    else if (sortBy === 'price-desc') list = [...list].sort((a, b) => listingBrowseAmount(b) - listingBrowseAmount(a));
    else if (sortBy === 'rating') {
      list = [...list].sort((a, b) => {
        const ar = reviewAggregates.get(a.id);
        const br = reviewAggregates.get(b.id);
        const as = ar && ar.count > 0 ? ar.rating : -1;
        const bs = br && br.count > 0 ? br.rating : -1;
        return bs - as;
      });
    }
    return { filtered: list, knownOccupiedForNights: knownOccupied };
  }, [
    stays,
    q,
    guests,
    propertyType,
    priceRange,
    selectedAmenities,
    ratingFilter,
    dateFilterActive,
    occupiedByListing,
    checkIn,
    checkOut,
    sortBy,
    reviewAggregates,
  ]);

  const matchingExceptOccupancyCount = useMemo(() => {
    if (!dateFilterActive) return 0;
    return stays.filter((s) => {
      const agg = reviewAggregates.get(s.id);
      if (
        !stayMatchesCatalogFilters(s, {
          q,
          guests,
          propertyType,
          price: priceRange,
          amenities: selectedAmenities,
          rating: ratingFilter,
          ratingScore: agg && agg.count > 0 ? agg.rating : null,
        })
      ) {
        return false;
      }
      const extras = parseListingExtras(s.listingExtras);
      const requestedNights = nightsOccupiedByStay(checkIn, checkOut).length;
      const minN = extras.stay?.minNights ?? 1;
      if (requestedNights < minN) return false;
      return true;
    }).length;
  }, [
    stays,
    q,
    guests,
    propertyType,
    priceRange,
    selectedAmenities,
    ratingFilter,
    dateFilterActive,
    checkIn,
    checkOut,
    reviewAggregates,
  ]);

  // Phase 1194: “Fully booked” only when known night conflicts — not all-unknown excludes (1193).
  const emptyDueToOccupiedNights =
    filtered.length === 0 &&
    dateFilterActive &&
    occupiedByListing != null &&
    matchingExceptOccupancyCount > 0 &&
    knownOccupiedForNights > 0;

  const waitingOnOccupancy =
    dateFilterActive && isSupabaseConfigured() && !occupancyError && (occupancyLoading || occupiedByListing === null);

  const searchValues: MarketplaceSearchValues = useMemo(
    () => ({ where: draftWhere, date: draftCheckIn, checkout: draftCheckOut, guests: draftGuests }),
    [draftWhere, draftCheckIn, draftCheckOut, draftGuests]
  );

  const mobileSearchSummary = useMemo(() => {
    const where = draftWhere.trim() || 'Anywhere';
    let whenLabel = 'Any dates';
    if (draftCheckIn && draftCheckOut) whenLabel = `${formatStayNightHuman(draftCheckIn)} → ${formatStayNightHuman(draftCheckOut)}`;
    else if (draftCheckIn) whenLabel = formatStayNightHuman(draftCheckIn);
    const guestN = Number.parseInt(draftGuests, 10);
    const whoLabel = draftGuests.trim() ? `${draftGuests} ${guestN === 1 ? 'guest' : 'guests'}` : 'Add guests';
    return { where, whenLabel, whoLabel };
  }, [draftWhere, draftCheckIn, draftCheckOut, draftGuests]);

  const extraFilterCount =
    (propertyType !== 'all' && propertyType ? 1 : 0) +
    (priceRange !== 'all' ? 1 : 0) +
    selectedAmenities.length +
    (ratingFilter !== 'all' ? 1 : 0);

  const hasActiveFilters =
    Boolean(q.trim() || checkIn || checkOut || guests) || extraFilterCount > 0;

  const clearAllFilters = () => {
    setQ('');
    setDraftWhere('');
    setCheckIn('');
    setDraftCheckIn('');
    setCheckOut('');
    setDraftCheckOut('');
    setGuests('');
    setDraftGuests('');
    setPropertyType('all');
    setPriceRange('all');
    setSelectedAmenities([]);
    setRatingFilter('all');
    setSortBy('recommended');
  };

  const toggleAmenity = (label: string) => {
    setSelectedAmenities((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]));
  };

  const destLabel = q.trim() || null;
  const resultTitle =
    catalogLoading || waitingOnOccupancy ? (
      <span className="inline-block h-6 w-40 rounded bg-black/[0.06] animate-pulse align-middle" aria-hidden />
    ) : (
      <>
        {filtered.length} {filtered.length === 1 ? 'stay' : 'stays'}
        {destLabel ? ` in ${destLabel}` : ''}
      </>
    );

  const filterPanel = (
    <>
      {propertyTypes.length > 0 ? (
        <MarketplaceFilterSection title="Property type">
          <MarketplaceFilterChipRow>
            <MarketplaceFilterChip pressed={propertyType === 'all'} onClick={() => setPropertyType('all')}>
              All
            </MarketplaceFilterChip>
            {propertyTypes.map((type) => (
              <MarketplaceFilterChip
                key={type}
                pressed={propertyType.toLowerCase() === type.toLowerCase()}
                onClick={() => setPropertyType(type)}
              >
                {type}
              </MarketplaceFilterChip>
            ))}
          </MarketplaceFilterChipRow>
        </MarketplaceFilterSection>
      ) : null}
      <MarketplaceFilterSection
        title="Price"
        hint={!catalogCurrency ? 'Nightly amounts in each stay’s own currency' : 'Per night'}
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
      {amenityOptions.length > 0 ? (
        <MarketplaceFilterSection title="Amenities">
          <MarketplaceFilterChipRow>
            {amenityOptions.map((amenity) => (
              <MarketplaceFilterChip
                key={amenity}
                pressed={selectedAmenities.includes(amenity)}
                onClick={() => toggleAmenity(amenity)}
              >
                {amenity}
              </MarketplaceFilterChip>
            ))}
          </MarketplaceFilterChipRow>
        </MarketplaceFilterSection>
      ) : null}
    </>
  );

  const sortControl = (
    <MarketplaceSortSelect
      value={sortBy}
      onChange={(v) => setSortBy(parseMarketplaceSort(v) === 'duration' ? 'recommended' : parseMarketplaceSort(v))}
      options={STAY_SORT_OPTIONS}
    />
  );

  const typeSummary = propertyType !== 'all' && propertyType ? propertyType : null;
  const priceSummary = priceRange !== 'all' ? priceChips.find((c) => c.id === priceRange)?.label ?? priceRange : null;
  const ratingSummary =
    ratingFilter !== 'all' ? RATING_FILTER_CHIPS.find((c) => c.id === ratingFilter)?.label ?? ratingFilter : null;
  const amenitiesSummary =
    selectedAmenities.length > 0
      ? selectedAmenities.length === 1
        ? selectedAmenities[0]
        : `${selectedAmenities.length} selected`
      : null;

  const desktopFilters = (
    <MarketplaceSecondaryFilterRow sortControl={sortControl}>
      {propertyTypes.length > 0 ? (
        <MarketplaceFilterMenu label="Type" closeOnSelect summary={typeSummary} active={Boolean(typeSummary)}>
          <MarketplaceFilterChipRow>
            <MarketplaceFilterChip pressed={propertyType === 'all'} onClick={() => setPropertyType('all')}>
              All
            </MarketplaceFilterChip>
            {propertyTypes.map((type) => (
              <MarketplaceFilterChip
                key={type}
                pressed={propertyType.toLowerCase() === type.toLowerCase()}
                onClick={() => setPropertyType(type)}
              >
                {type}
              </MarketplaceFilterChip>
            ))}
          </MarketplaceFilterChipRow>
        </MarketplaceFilterMenu>
      ) : null}
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
      {amenityOptions.length > 0 ? (
        <MarketplaceFilterMenu
          label="Amenities"
          summary={amenitiesSummary}
          active={selectedAmenities.length > 0}
        >
          <MarketplaceFilterChipRow>
            {amenityOptions.map((amenity) => (
              <MarketplaceFilterChip
                key={amenity}
                pressed={selectedAmenities.includes(amenity)}
                onClick={() => toggleAmenity(amenity)}
              >
                {amenity}
              </MarketplaceFilterChip>
            ))}
          </MarketplaceFilterChipRow>
        </MarketplaceFilterMenu>
      ) : null}
    </MarketplaceSecondaryFilterRow>
  );

  return (
    <>
      <MarketplaceBrowseShell
        headingId="stays-heading"
        resultTitle={resultTitle}
        familyNav={
          <MarketplaceFamilySwitch
            current="stays"
            onTours={() => {
              if (!onNavigate) return;
              const next = marketplaceFamilySwitchPath('tours', {
                q,
                date: checkIn,
                guests,
              });
              window.history.pushState({}, '', next);
              onNavigate('packages');
            }}
            onStays={() => undefined}
          />
        }
        search={
          <MarketplaceSearchPill
            family="stays"
            values={searchValues}
            onChange={patchDraftSearch}
            onSubmit={(e) => {
              e.preventDefault();
              applyPrimarySearch();
            }}
            idPrefix="stays"
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
            controlsId="stays-mobile-search-dialog"
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
                  setPropertyType('all');
                  setPriceRange('all');
                  setSelectedAmenities([]);
                  setRatingFilter('all');
                  setMobileFiltersOpen(false);
                }}
                className="tv-btn-secondary flex-1"
              >
                Clear
              </button>
            ) : null}
            <button type="button" onClick={closeMobileFilters} className="tv-btn-primary flex-1">
              Show {filtered.length}
            </button>
          </>
        }
        sortControl={sortControl}
        activeChips={
          hasActiveFilters ? (
            <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
              {q.trim() ? (
                <MarketplaceActiveChip
                  label={`“${q.trim().slice(0, 36)}${q.trim().length > 36 ? '…' : ''}”`}
                  onRemove={() => {
                    setQ('');
                    setDraftWhere('');
                  }}
                />
              ) : null}
              {checkIn ? (
                <MarketplaceActiveChip
                  label={`In ${formatStayNightHuman(checkIn)}`}
                  onRemove={() => {
                    setCheckIn('');
                    setDraftCheckIn('');
                  }}
                />
              ) : null}
              {checkOut ? (
                <MarketplaceActiveChip
                  label={`Out ${formatStayNightHuman(checkOut)}`}
                  onRemove={() => {
                    setCheckOut('');
                    setDraftCheckOut('');
                  }}
                />
              ) : null}
              {guests ? (
                <MarketplaceActiveChip
                  label={`${guests} ${guests === '1' ? 'guest' : 'guests'}`}
                  onRemove={() => {
                    setGuests('');
                    setDraftGuests('');
                  }}
                />
              ) : null}
              {propertyType !== 'all' && propertyType ? (
                <MarketplaceActiveChip label={propertyType} onRemove={() => setPropertyType('all')} />
              ) : null}
              {priceRange !== 'all' ? (
                <MarketplaceActiveChip
                  label={priceChips.find((c) => c.id === priceRange)?.label ?? priceRange}
                  onRemove={() => setPriceRange('all')}
                />
              ) : null}
              {selectedAmenities.map((amenity) => (
                <MarketplaceActiveChip key={amenity} label={amenity} onRemove={() => toggleAmenity(amenity)} />
              ))}
              {ratingFilter !== 'all' ? (
                <MarketplaceActiveChip
                  label={RATING_FILTER_CHIPS.find((c) => c.id === ratingFilter)?.label ?? ratingFilter}
                  onRemove={() => setRatingFilter('all')}
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
        {paymentBanner === 'cancelled' ? (
          <div className="mb-5 max-w-xl">
            <NoticeCallout title="Checkout cancelled" tone="warn">
              {STRIPE_CHECKOUT_CANCELLED_STAY_COPY}
            </NoticeCallout>
          </div>
        ) : null}
        {error ? (
          <ErrorState
            title="Stays unavailable"
            body={userFacingError(error, USER_ERROR.stays)}
            retry={{ onClick: () => reload() }}
            extra={
              <a href="/contact" className="tv-btn-ghost inline-flex">
                Contact support
              </a>
            }
          />
        ) : occupancyError && dateFilterActive ? (
          <ErrorState
            title="Capacity unavailable"
            body={occupancyError}
            retry={{ onClick: () => reloadStayBrowseOccupancy() }}
            extra={
              <a href="/contact" className="tv-btn-ghost inline-flex">
                Contact support
              </a>
            }
          />
        ) : catalogLoading || waitingOnOccupancy ? (
          <SkeletonCardGrid count={6} />
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-paper-raised px-6 py-2 shadow-soft ring-1 ring-black/[0.06] sm:px-8">
            {stays.length === 0 ? (
              <EmptyState
                className="py-8 sm:py-10 max-w-lg"
                icon={Compass}
                title="No stays published yet"
                body="When an operator publishes a stay, it appears here. Traverion does not invent sample apartments."
                action={
                  <a href={supplierPortalLandingHref()} className="tv-btn-primary inline-flex">
                    List a stay
                  </a>
                }
              />
            ) : (
              <EmptyState
                className="py-8 sm:py-10 max-w-lg"
                icon={Search}
                title={emptyDueToOccupiedNights ? 'Fully booked for those nights' : 'No stays match'}
                body={
                  emptyDueToOccupiedNights
                    ? 'Stays that match your other filters are occupied or blocked for those nights. Try other dates or clear filters.'
                    : dateFilterActive
                      ? 'No stays are free for those nights — or the stay has a longer minimum. Try other dates or clear filters.'
                      : 'Try another place, dates, or guest count — or clear filters to see live stays again.'
                }
                action={
                  hasActiveFilters ? (
                    <button type="button" onClick={clearAllFilters} className="tv-btn-primary">
                      Clear filters
                    </button>
                  ) : undefined
                }
              />
            )}
          </div>
        ) : (
          <div className={MARKETPLACE_BROWSE_GRID_CLASS}>
            {filtered.map((item, index) => {
              const guestN = Number.parseInt(guests, 10) || 1;
              const stayQuote =
                checkIn && checkOut
                  ? quoteStayNights({ tour: item, checkIn, checkOut, guests: guestN })
                  : null;
              return (
                <PublicListingBrowseCard
                  key={item.id}
                  tour={item}
                  index={index}
                  onSelect={() => onStaySelect(item)}
                  discountsByListing={discountsByListing}
                  reviewAggregate={reviewAggregates.get(item.id)}
                  tagLabels={{}}
                  showTagPills={false}
                  size="compact"
                  stayStayTotal={
                    stayQuote?.ok
                      ? { nights: stayQuote.nights, total: stayQuote.totalAmount, currency: stayQuote.currency }
                      : null
                  }
                  wishlist={
                    wishlist.enabled
                      ? {
                          saved: wishlist.isSaved(item.id),
                          busy: wishlist.busyId === item.id,
                          onToggle: () => wishlist.toggle(item.id),
                        }
                      : null
                  }
                />
              );
            })}
          </div>
        )}
      </MarketplaceBrowseShell>

      {mobileSearchOpen ? (
        <div ref={mobileSearchSheetRef} className="tv-sheet-overlay sm:hidden">
          <button type="button" tabIndex={-1} className="absolute inset-0" aria-label="Close search" onClick={closeMobileSearch} />
          <aside
            id="stays-mobile-search-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stays-mobile-search-title"
            className="tv-sheet-panel relative flex max-h-[min(92dvh,40rem)] flex-col overflow-hidden motion-safe:animate-slide-up"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland">Search</p>
                <h2 id="stays-mobile-search-title" className="font-display text-xl text-ink tracking-tight mt-1">
                  Find a stay
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
                family="stays"
                values={searchValues}
                onChange={patchDraftSearch}
                idPrefix="stays-sheet"
                stacked
              />
            </div>
            <div className="mt-5 flex gap-2 shrink-0">
              {draftWhere.trim() || draftCheckIn || draftCheckOut || draftGuests || q.trim() || checkIn || checkOut || guests ? (
                <button
                  type="button"
                  onClick={() => {
                    setDraftWhere('');
                    setDraftCheckIn('');
                    setDraftCheckOut('');
                    setDraftGuests('');
                    setQ('');
                    setCheckIn('');
                    setCheckOut('');
                    setGuests('');
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
