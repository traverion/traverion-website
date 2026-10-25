import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyRound, Search, X } from 'lucide-react';
import { fetchAllListings } from '../data/supabase-listings';
import { inventoryFamilyFromListing } from '../lib/inventory';
import { RENTAL_CATEGORY_CONFIG } from '../lib/rental-categories';
import { normalizeRentalDetails } from '../lib/rental-details';
import { rentalCategoryTitle, rentalFromPrice, rentalItemLabel } from '../lib/rental-presentation';
import { formatMoney } from '../lib/money';
import {
  MARKETPLACE_BROWSE_GRID_CLASS,
  buildPriceChips,
  marketplaceFamilySwitchPath,
  matchesPriceChip,
  parsePriceChipId,
  type MarketplaceSearchValues,
  type PriceChipId,
} from '../lib/marketplaceBrowse';
import { PublicListingBrowseCard } from '../components/PublicListingBrowseCard';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { SkeletonCardGrid } from '../components/ui/Skeleton';
import {
  MarketplaceBrowseShell,
  MarketplaceFamilySwitch,
  MarketplaceSortSelect,
} from '../components/marketplace/MarketplaceBrowseShell';
import {
  MarketplaceMobileSearchTrigger,
  MarketplaceSearchFields,
  MarketplaceSearchPill,
} from '../components/marketplace/MarketplaceSearchBar';
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
import type { TourPackage } from '../types/tour';
import type { RentalCategoryId, RentalDetails } from '../types/rental';

type Props = {
  onOpenListing: (listingId: string) => void;
  onNavigate?: (page: string) => void;
};

type Row = {
  listing: TourPackage;
  rental: RentalDetails;
};

type DurationChip = 'any' | 'hour' | 'day';
type SortId = 'recommended' | 'price-asc' | 'price-desc';

function nightsBetween(start: string, end: string): number | null {
  if (!start || !end || end < start) return null;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

function readDuration(raw: string | null): DurationChip {
  return raw === 'hour' || raw === 'day' ? raw : 'any';
}

function readSort(raw: string | null): SortId {
  return raw === 'price-asc' || raw === 'price-desc' ? raw : 'recommended';
}

function readCategory(raw: string | null): RentalCategoryId | '' {
  if (!raw) return '';
  return raw in RENTAL_CATEGORY_CONFIG ? (raw as RentalCategoryId) : '';
}

function initialSearch(): {
  where: string;
  date: string;
  checkout: string;
  category: RentalCategoryId | '';
  duration: DurationChip;
  price: PriceChipId;
  sort: SortId;
} {
  if (typeof window === 'undefined') {
    return { where: '', date: '', checkout: '', category: '', duration: 'any', price: 'all', sort: 'recommended' };
  }
  const p = new URLSearchParams(window.location.search);
  const where = (p.get('destination') || p.get('q') || '').trim();
  return {
    where,
    date: p.get('date') ?? '',
    checkout: p.get('checkout') ?? '',
    category: readCategory(p.get('category')),
    duration: readDuration(p.get('duration')),
    price: parsePriceChipId(p.get('price')),
    sort: readSort(p.get('sort')),
  };
}

function durationMeta(rental: RentalDetails): string {
  if (rental.durationMode === 'hourly') return 'Hourly';
  if (rental.durationMode === 'both') return 'Daily or hourly';
  return 'Daily';
}

export default function RentalsCatalog({ onOpenListing, onNavigate }: Props) {
  const start = initialSearch();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [where, setWhere] = useState(start.where);
  const [draftWhere, setDraftWhere] = useState(start.where);
  const [date, setDate] = useState(start.date);
  const [draftDate, setDraftDate] = useState(start.date);
  const [checkout, setCheckout] = useState(start.checkout);
  const [draftCheckout, setDraftCheckout] = useState(start.checkout);
  const [category, setCategory] = useState<RentalCategoryId | ''>(start.category);
  const [duration, setDuration] = useState<DurationChip>(start.duration);
  const [price, setPrice] = useState<PriceChipId>(start.price);
  const [sort, setSort] = useState<SortId>(start.sort);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filterSheetRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setReloadKey((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const listings = await fetchAllListings();
        if (cancelled) return;
        const next = listings
          .filter(
            (listing) =>
              listing.status === 'published' && inventoryFamilyFromListing(listing) === 'rental'
          )
          .map((listing) => ({
            listing,
            rental: normalizeRentalDetails(listing.listingExtras),
          }));
        setRows(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Rentals could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const applyPrimarySearch = useCallback(() => {
    setWhere(draftWhere.trim());
    setDate(draftDate);
    setCheckout(draftCheckout && draftDate && draftCheckout >= draftDate ? draftCheckout : draftDate ? draftDate : '');
  }, [draftCheckout, draftDate, draftWhere]);

  const searchValues: MarketplaceSearchValues = {
    where: draftWhere,
    date: draftDate,
    checkout: draftCheckout,
    guests: '',
  };

  const patchDraftSearch = (patch: Partial<MarketplaceSearchValues>) => {
    if (patch.where != null) setDraftWhere(patch.where);
    if (patch.date != null) setDraftDate(patch.date);
    if (patch.checkout != null) setDraftCheckout(patch.checkout);
  };

  useEffect(() => {
    const p = new URLSearchParams();
    if (where) {
      p.set('q', where);
      p.set('destination', where);
    }
    if (date) p.set('date', date);
    if (checkout) p.set('checkout', checkout);
    if (category) p.set('category', category);
    if (duration !== 'any') p.set('duration', duration);
    if (price !== 'all') p.set('price', price);
    if (sort !== 'recommended') p.set('sort', sort);
    const next = p.toString();
    const url = next ? `/rentals?${next}` : '/rentals';
    if (window.location.pathname === '/rentals' && `${window.location.pathname}${window.location.search}` !== url) {
      window.history.replaceState({}, '', url);
    }
  }, [where, date, checkout, category, duration, price, sort]);

  const priceChips = useMemo(() => buildPriceChips('EUR', formatMoney), []);

  const filtered = useMemo(() => {
    const q = where.trim().toLowerCase();
    const span = nightsBetween(date, checkout || date);
    const matched = rows.filter((row) => {
      const { listing, rental } = row;
      if (category && rental.category !== category) return false;
      if (duration === 'hour' && rental.durationMode === 'daily') return false;
      if (duration === 'day' && rental.durationMode === 'hourly') return false;
      if (q) {
        const hay = [
          listing.title,
          listing.subtitle,
          listing.city,
          listing.country,
          listing.destination,
          rental.shortIntro,
          rentalCategoryTitle(rental),
          rentalItemLabel(rental),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const from = rentalFromPrice(rental);
      const major = from ? from.minor / 100 : 0;
      if (from && !matchesPriceChip(major, price)) return false;
      if (!from && price !== 'all') return false;
      if (span != null && (rental.durationMode === 'daily' || rental.durationMode === 'both' || !rental.durationMode)) {
        if (rental.minDurationDays && span < rental.minDurationDays) return false;
        if (rental.maxDurationDays && span > rental.maxDurationDays) return false;
      }
      return true;
    });
    const priced = (row: Row) => rentalFromPrice(row.rental)?.minor ?? Number.POSITIVE_INFINITY;
    if (sort === 'price-asc') matched.sort((a, b) => priced(a) - priced(b));
    if (sort === 'price-desc') matched.sort((a, b) => priced(b) - priced(a));
    return matched;
  }, [rows, where, category, duration, price, date, checkout, sort]);

  const extraFilterCount = (category ? 1 : 0) + (duration !== 'any' ? 1 : 0) + (price !== 'all' ? 1 : 0);
  const resultTitle = loading
    ? 'Rentals'
    : filtered.length === 1
      ? '1 rental'
      : `${filtered.length} rentals`;

  const whenLabel = date
    ? checkout && checkout !== date
      ? `${date} – ${checkout}`
      : date
    : 'Any dates';

  const clearFilters = () => {
    setCategory('');
    setDuration('any');
    setPrice('all');
  };

  const sortControl = (
    <MarketplaceSortSelect
      value={sort}
      onChange={(next) => setSort(readSort(next))}
      options={[
        { id: 'recommended', label: 'Recommended' },
        { id: 'price-asc', label: 'Price: low to high' },
        { id: 'price-desc', label: 'Price: high to low' },
      ]}
    />
  );

  const categoryChips = (
    <MarketplaceFilterChipRow>
      <MarketplaceFilterChip pressed={!category} onClick={() => setCategory('')}>
        All
      </MarketplaceFilterChip>
      {Object.values(RENTAL_CATEGORY_CONFIG).map((item) => (
        <MarketplaceFilterChip
          key={item.id}
          pressed={category === item.id}
          onClick={() => setCategory(item.id)}
        >
          {item.title}
        </MarketplaceFilterChip>
      ))}
    </MarketplaceFilterChipRow>
  );

  const priceChipRow = (
    <MarketplaceFilterChipRow>
      {priceChips.map((chip) => (
        <MarketplaceFilterChip key={chip.id} pressed={price === chip.id} onClick={() => setPrice(chip.id)}>
          {chip.label}
        </MarketplaceFilterChip>
      ))}
    </MarketplaceFilterChipRow>
  );

  const durationChips = (
    <MarketplaceFilterChipRow>
      {(
        [
          ['any', 'Hourly or daily'],
          ['day', 'Daily'],
          ['hour', 'Hourly'],
        ] as const
      ).map(([id, label]) => (
        <MarketplaceFilterChip key={id} pressed={duration === id} onClick={() => setDuration(id)}>
          {label}
        </MarketplaceFilterChip>
      ))}
    </MarketplaceFilterChipRow>
  );

  const filterPanel = (
    <>
      <MarketplaceFilterSection title="Category">{categoryChips}</MarketplaceFilterSection>
      <MarketplaceFilterSection title="Price" hint="Starting rate">
        {priceChipRow}
      </MarketplaceFilterSection>
      <MarketplaceFilterSection title="Duration">{durationChips}</MarketplaceFilterSection>
    </>
  );

  const desktopFilters = (
    <MarketplaceSecondaryFilterRow sortControl={sortControl}>
      <MarketplaceFilterMenu
        label="Category"
        summary={category ? RENTAL_CATEGORY_CONFIG[category].title : null}
        active={Boolean(category)}
        closeOnSelect
      >
        {categoryChips}
      </MarketplaceFilterMenu>
      <MarketplaceFilterMenu
        label="Price"
        summary={price === 'all' ? null : priceChips.find((chip) => chip.id === price)?.label}
        active={price !== 'all'}
        closeOnSelect
      >
        {priceChipRow}
      </MarketplaceFilterMenu>
      <MarketplaceFilterMenu
        label="Duration"
        summary={duration === 'day' ? 'Daily' : duration === 'hour' ? 'Hourly' : null}
        active={duration !== 'any'}
        closeOnSelect
      >
        {durationChips}
      </MarketplaceFilterMenu>
    </MarketplaceSecondaryFilterRow>
  );

  const goFamily = (target: 'tours' | 'stays' | 'rentals', page: string) => {
    if (!onNavigate || target === 'rentals') return;
    const next = marketplaceFamilySwitchPath(target, {
      q: where,
      date,
      checkout,
    });
    window.history.pushState({}, '', next);
    onNavigate(page);
  };

  return (
    <>
      <MarketplaceBrowseShell
        headingId="rentals-heading"
        resultTitle={resultTitle}
        familyNav={
          <MarketplaceFamilySwitch
            current="rentals"
            onTours={() => goFamily('tours', 'packages')}
            onStays={() => goFamily('stays', 'stays')}
            onRentals={() => undefined}
          />
        }
        search={
          <MarketplaceSearchPill
            family="rentals"
            values={searchValues}
            onChange={patchDraftSearch}
            onSubmit={(event) => {
              event.preventDefault();
              applyPrimarySearch();
            }}
            idPrefix="rentals"
            trailing={
              <button
                type="submit"
                className="mx-1 flex h-11 items-center justify-center gap-2 self-center rounded-full bg-finland px-5 text-sm font-semibold text-white shadow-sm hover:bg-finland-dark"
              >
                <Search className="h-4 w-4" aria-hidden />
                Search
              </button>
            }
          />
        }
        mobileSearch={
          <MarketplaceMobileSearchTrigger
            where={draftWhere.trim() || 'Anywhere'}
            whenLabel={whenLabel}
            whoLabel={duration === 'day' ? 'Daily' : duration === 'hour' ? 'Hourly' : 'Any duration'}
            onClick={() => setMobileSearchOpen(true)}
            expanded={mobileSearchOpen}
            controlsId="rentals-mobile-search-dialog"
          />
        }
        filterCount={extraFilterCount}
        filtersOpen={mobileFiltersOpen}
        onOpenFilters={() => setMobileFiltersOpen(true)}
        onCloseFilters={() => setMobileFiltersOpen(false)}
        filterSheetRef={filterSheetRef}
        filterPanel={filterPanel}
        desktopFilters={desktopFilters}
        filterFooter={
          extraFilterCount > 0 ? (
            <button type="button" onClick={clearFilters} className="tv-btn-ghost">
              Clear filters
            </button>
          ) : null
        }
        sortControl={sortControl}
        activeChips={
          extraFilterCount > 0 || where || date ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {where ? (
                <MarketplaceActiveChip
                  label={where}
                  onRemove={() => {
                    setWhere('');
                    setDraftWhere('');
                  }}
                />
              ) : null}
              {date ? (
                <MarketplaceActiveChip
                  label={checkout && checkout !== date ? `${date} – ${checkout}` : `Pickup ${date}`}
                  onRemove={() => {
                    setDate('');
                    setDraftDate('');
                    setCheckout('');
                    setDraftCheckout('');
                  }}
                />
              ) : null}
              {category ? (
                <MarketplaceActiveChip
                  label={RENTAL_CATEGORY_CONFIG[category].title}
                  onRemove={() => setCategory('')}
                />
              ) : null}
              {duration !== 'any' ? (
                <MarketplaceActiveChip
                  label={duration === 'day' ? 'Daily' : 'Hourly'}
                  onRemove={() => setDuration('any')}
                />
              ) : null}
              {price !== 'all' ? (
                <MarketplaceActiveChip
                  label={priceChips.find((chip) => chip.id === price)?.label ?? price}
                  onRemove={() => setPrice('all')}
                />
              ) : null}
            </div>
          ) : null
        }
      >
        {loading ? (
          <SkeletonCardGrid count={8} />
        ) : error ? (
          <ErrorState
            title="Rentals unavailable"
            body="Published rentals could not be loaded. Try again in a moment."
            retry={{ onClick: load }}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No rentals are published yet"
            body="Operators are preparing equipment listings. Online payment for rentals stays closed until bookings are ready."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No rentals match these filters"
            body="Try another destination, date, or category. Only published rentals are shown."
            action={
              <button
                type="button"
                className="tv-btn-secondary"
                onClick={() => {
                  setWhere('');
                  setDraftWhere('');
                  setDate('');
                  setDraftDate('');
                  setCheckout('');
                  setDraftCheckout('');
                  clearFilters();
                }}
              >
                Clear search
              </button>
            }
          />
        ) : (
          <div className={MARKETPLACE_BROWSE_GRID_CLASS}>
            {filtered.map((row, index) => {
              const from = rentalFromPrice(row.rental);
              return (
                <PublicListingBrowseCard
                  key={row.listing.id}
                  tour={row.listing}
                  index={index}
                  onSelect={() => onOpenListing(row.listing.id)}
                  rentalBrowse={{
                    badge: rentalCategoryTitle(row.rental),
                    meta: durationMeta(row.rental),
                    priceLabel: from?.label ?? null,
                  }}
                />
              );
            })}
          </div>
        )}
      </MarketplaceBrowseShell>

      {mobileSearchOpen ? (
        <div className="tv-sheet-overlay sm:hidden">
          <button
            type="button"
            tabIndex={-1}
            className="absolute inset-0"
            aria-label="Close search"
            onClick={() => setMobileSearchOpen(false)}
          />
          <aside
            id="rentals-mobile-search-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rentals-mobile-search-title"
            className="tv-sheet-panel relative flex max-h-[min(92dvh,40rem)] flex-col overflow-hidden motion-safe:animate-slide-up"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="tv-eyebrow">Search</p>
                <h2 id="rentals-mobile-search-title" className="mt-1 font-display text-2xl tracking-tight text-ink">
                  Find a rental
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setMobileSearchOpen(false)}
                className="lux-tap-target -mr-1 inline-flex min-h-11 min-w-11 items-center justify-center p-2"
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-2xl bg-black/[0.02] p-1 ring-1 ring-black/[0.04]">
              <MarketplaceSearchFields
                family="rentals"
                values={searchValues}
                onChange={patchDraftSearch}
                idPrefix="rentals-sheet"
                stacked
              />
            </div>
            <div className="mt-5 flex shrink-0 gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                className="tv-btn-primary flex-1"
                onClick={() => {
                  applyPrimarySearch();
                  setMobileSearchOpen(false);
                }}
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
