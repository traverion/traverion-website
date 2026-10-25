import { useEffect, useMemo, useState } from 'react';
import { KeyRound, MapPin, Search } from 'lucide-react';
import { fetchAllListings } from '../data/supabase-listings';
import { inventoryFamilyFromListing } from '../lib/inventory';
import { RENTAL_CATEGORY_CONFIG } from '../lib/rental-categories';
import { normalizeRentalDetails } from '../lib/rental-details';
import { rentalCategoryTitle, rentalFromPrice, rentalItemLabel } from '../lib/rental-presentation';
import type { TourPackage } from '../types/tour';
import type { RentalCategoryId, RentalDetails } from '../types/rental';

type Props = {
  onOpenListing: (listingId: string) => void;
};

type Row = {
  listing: TourPackage;
  rental: RentalDetails;
};

function photosOf(listing: TourPackage): string[] {
  const slots = (listing.listingExtras as { photoSlots?: string[] } | undefined)?.photoSlots ?? [];
  const fromSlots = slots.filter((url) => typeof url === 'string' && url.startsWith('http'));
  if (fromSlots.length) return fromSlots;
  return listing.image ? [listing.image] : [];
}

function nightsBetween(start: string, end: string): number | null {
  if (!start || !end || end < start) return null;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

export default function RentalsCatalog({ onOpenListing }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<RentalCategoryId | ''>('');
  const [place, setPlace] = useState('');
  const [duration, setDuration] = useState<'any' | 'hour' | 'day'>('any');
  const [maxPrice, setMaxPrice] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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
            rental: normalizeRentalDetails(listing.listingExtras?.rental),
          }));
        setRows(next);
      } catch {
        if (!cancelled) setError('Rentals could not be loaded. Try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const places = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const label = [row.listing.city, row.listing.country].filter(Boolean).join(', ');
      if (label) set.add(label);
    }
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const placeQ = place.trim().toLowerCase();
    const cap = Number(maxPrice);
    const span = nightsBetween(startDate, endDate);
    return rows.filter((row) => {
      const { listing, rental } = row;
      if (category && rental.category !== category) return false;
      if (duration === 'hour' && rental.durationMode === 'daily') return false;
      if (duration === 'day' && rental.durationMode === 'hourly') return false;
      if (placeQ) {
        const loc = [listing.city, listing.country, listing.destination].filter(Boolean).join(' ').toLowerCase();
        if (!loc.includes(placeQ)) return false;
      }
      if (q) {
        const hay = [listing.title, listing.subtitle, rental.shortIntro, rentalCategoryTitle(rental), rentalItemLabel(rental)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (Number.isFinite(cap) && cap > 0) {
        const from = rentalFromPrice(rental);
        if (from && from.minor > Math.round(cap * 100)) return false;
      }
      if (span != null && (rental.durationMode === 'daily' || rental.durationMode === 'both' || !rental.durationMode)) {
        if (rental.minDurationDays && span < rental.minDurationDays) return false;
        if (rental.maxDurationDays && span > rental.maxDurationDays) return false;
      }
      return true;
    });
  }, [rows, query, category, place, duration, maxPrice, startDate, endDate]);

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-ink">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#073b83]">Rentals</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Rent equipment for the trip
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Bikes, winter clothing, skis, snowmobiles, and outdoor gear from independent operators. Only published rentals appear here.
        </p>

        <form
          className="mt-6 grid gap-3 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)] ring-1 ring-[#E6EAF0] sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(event) => event.preventDefault()}
        >
          <label className="block text-sm sm:col-span-2 lg:col-span-1">
            <span className="mb-1.5 flex items-center gap-1.5 font-medium text-ink">
              <Search className="h-3.5 w-3.5" aria-hidden />
              Search
            </span>
            <input
              className="tv-input w-full"
              value={query}
              placeholder="Fat bike, thermal overall, ski set"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-ink">Category</span>
            <select
              className="tv-input w-full"
              value={category}
              onChange={(event) => setCategory(event.target.value as RentalCategoryId | '')}
            >
              <option value="">All categories</option>
              {Object.values(RENTAL_CATEGORY_CONFIG).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-ink">Destination</span>
            <input
              className="tv-input w-full"
              list="rental-places"
              value={place}
              placeholder="City or country"
              onChange={(event) => setPlace(event.target.value)}
            />
            <datalist id="rental-places">
              {places.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-ink">Duration</span>
            <select
              className="tv-input w-full"
              value={duration}
              onChange={(event) => setDuration(event.target.value as 'any' | 'hour' | 'day')}
            >
              <option value="any">Hourly or daily</option>
              <option value="day">Daily</option>
              <option value="hour">Hourly</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-ink">Pickup</span>
            <input className="tv-input w-full" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-ink">Return</span>
            <input className="tv-input w-full" type="date" min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-ink">Price up to (EUR)</span>
            <input
              className="tv-input w-full"
              inputMode="decimal"
              value={maxPrice}
              placeholder="Any price"
              onChange={(event) => setMaxPrice(event.target.value.replace(/[^\d.]/g, ''))}
            />
          </label>
        </form>

        <div className="mt-6">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading rentals">
              {[0, 1, 2].map((key) => (
                <div key={key} className="h-72 animate-pulse rounded-2xl bg-white ring-1 ring-[#E6EAF0]" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-2xl bg-white px-5 py-8 ring-1 ring-[#E6EAF0]">
              <p className="font-semibold text-ink">{error}</p>
              <button type="button" className="tv-btn-primary mt-4" onClick={() => window.location.reload()}>
                Try again
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl bg-white px-5 py-10 text-center ring-1 ring-[#E6EAF0]">
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#073b83]/10 text-[#073b83]">
                <KeyRound className="h-4 w-4" aria-hidden />
              </span>
              <h2 className="mt-3 font-display text-xl font-semibold text-ink">
                {rows.length === 0 ? 'No rentals are published yet' : 'No rentals match these filters'}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
                {rows.length === 0
                  ? 'Operators can prepare rental listings in the partner portal. They appear here after publication. Online payment stays closed until Traverion opens rental checkout.'
                  : 'Clear a filter or try another destination, category, or date range.'}
              </p>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(({ listing, rental }) => {
                const photo = photosOf(listing)[0];
                const loc = [listing.city, listing.country].filter(Boolean).join(', ');
                const price = rentalFromPrice(rental);
                return (
                  <li key={listing.id}>
                    <button
                      type="button"
                      className="group flex h-full w-full flex-col overflow-hidden rounded-2xl bg-white text-left shadow-[0_1px_2px_rgb(15_23_42/0.04)] ring-1 ring-[#E6EAF0] transition duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgb(15_23_42/0.06)]"
                      onClick={() => onOpenListing(listing.id)}
                    >
                      {photo ? (
                        <img src={photo} alt={`${listing.title} cover`} className="aspect-[16/10] w-full object-cover" />
                      ) : (
                        <div className="flex aspect-[16/10] items-center justify-center bg-[#F4F6F8] text-sm text-ink-muted">
                          No photo
                        </div>
                      )}
                      <div className="flex flex-1 flex-col gap-1.5 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#073b83]">
                          {[rentalCategoryTitle(rental), rentalItemLabel(rental)].filter(Boolean).join(' · ')}
                        </p>
                        <h2 className="font-display text-lg font-semibold leading-snug text-ink">{listing.title}</h2>
                        {loc ? (
                          <p className="flex items-center gap-1 text-sm text-ink-muted">
                            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {loc}
                          </p>
                        ) : null}
                        {price ? <p className="mt-auto pt-2 text-sm font-semibold text-ink">From {price.label}</p> : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
