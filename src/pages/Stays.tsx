import { useMemo, useState, useEffect } from 'react';
import { Compass, Search, X } from 'lucide-react';
import { usePublishedSupplierListings } from '../hooks/usePublishedSupplierListings';
import { isSupabaseConfigured } from '../lib/supabase';
import { getAllListings } from '../data/listings';
import { filterCatalogByFamily } from '../lib/inventory';
import { parseListingExtras } from '../types/listingExtras';
import { PublicListingBrowseCard } from '../components/PublicListingBrowseCard';
import { quoteStayNights } from '../lib/booking-quote';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import NoticeCallout from '../components/NoticeCallout';
import { SkeletonCardGrid } from '../components/ui/Skeleton';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { supplierPortalLandingHref } from '../lib/partnerHost';
import { STRIPE_CHECKOUT_CANCELLED_STAY_COPY, readStripeCheckoutReturnBanner } from '../lib/booking-confirmation-copy';
import { stayAvailableForRequestedNights } from '../lib/stayOccupancy';
import { fetchPublishedStayOccupiedRanges } from '../data/supabase-bookings';
import type { TourPackage } from '../types/tour';

type Props = {
  onStaySelect: (stay: TourPackage) => void;
  onNavigate?: (page: string) => void;
};

export default function Stays({ onStaySelect }: Props) {
  const { listings: supplierListings, error, reload } = usePublishedSupplierListings();
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
  const [q, setQ] = useState(() => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('q') ?? '');
  const [checkIn, setCheckIn] = useState(() => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('date') ?? '');
  const [checkOut, setCheckOut] = useState(() => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('checkout') ?? '');
  const [guests, setGuests] = useState(() => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('guests') ?? '');
  const [occupiedByListing, setOccupiedByListing] = useState<Record<
    string,
    { checkIn: string; checkOut: string }[]
  > | null>(null);
  const [occupancyLoading, setOccupancyLoading] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (checkIn) p.set('date', checkIn);
    if (checkOut) p.set('checkout', checkOut);
    if (guests) p.set('guests', guests);
    const next = p.toString() ? `/stays?${p.toString()}` : '/stays';
    if (window.location.pathname + window.location.search !== next) {
      window.history.replaceState({}, '', next);
    }
  }, [q, checkIn, checkOut, guests]);

  const stays = useMemo(() => {
    const base =
      isSupabaseConfigured() && supplierListings !== null
        ? supplierListings
        : getAllListings({ includeSeed: false, includeHolidayPackages: false });
    return filterCatalogByFamily(base, 'stay');
  }, [supplierListings]);

  const dateFilterActive = Boolean(checkIn && checkOut && checkOut > checkIn);

  useEffect(() => {
    if (!dateFilterActive || stays.length === 0 || !isSupabaseConfigured()) {
      setOccupiedByListing(null);
      setOccupancyLoading(false);
      return;
    }
    let cancelled = false;
    setOccupancyLoading(true);
    void Promise.all(
      stays.map(async (s) => {
        const ranges = await fetchPublishedStayOccupiedRanges(s.id);
        return [s.id, ranges] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      setOccupiedByListing(Object.fromEntries(entries));
      setOccupancyLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [dateFilterActive, stays]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const guestN = Number.parseInt(guests, 10);
    return stays.filter((s) => {
      const extras = parseListingExtras(s.listingExtras);
      const maxG = extras.stay?.maxGuests;
      if (query) {
        const hay = `${s.title} ${s.city ?? ''} ${s.country ?? ''} ${s.destination}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      if (Number.isFinite(guestN) && guestN > 0 && typeof maxG === 'number' && guestN > maxG) return false;
      if (dateFilterActive && occupiedByListing) {
        const ranges = occupiedByListing[s.id] ?? [];
        if (!stayAvailableForRequestedNights(checkIn, checkOut, ranges)) return false;
      }
      return true;
    });
  }, [stays, q, guests, dateFilterActive, occupiedByListing, checkIn, checkOut]);

  const waitingOnOccupancy = dateFilterActive && isSupabaseConfigured() && (occupancyLoading || occupiedByListing === null);

  return (
    <div className="min-h-screen bg-paper tv-page">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-16 motion-safe:animate-fade-in">
        <header className="mb-8 rounded-2xl bg-paper-raised p-5 sm:p-7 shadow-soft ring-1 ring-black/[0.06]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">Browse</p>
          <h1 className="font-display text-4xl sm:text-5xl text-ink tracking-tight">Stays</h1>
          <p className="mt-3 text-ink-muted max-w-xl leading-relaxed">
            Apartments and rooms from operators — not mixed into Tours. Dates are nights, not departures.
            {dateFilterActive
              ? ' Results hide stays whose nights are already booked for your dates.'
              : ''}
          </p>
        </header>
        {paymentBanner === 'cancelled' ? (
          <div className="mb-8 max-w-xl">
            <NoticeCallout title="Checkout cancelled" tone="warn">
              {STRIPE_CHECKOUT_CANCELLED_STAY_COPY}
            </NoticeCallout>
          </div>
        ) : null}

        <form
          className="mb-10 grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_1fr_0.85fr_auto] gap-1 bg-paper-raised rounded-2xl sm:rounded-full p-2 sm:p-1.5 shadow-soft-lg ring-1 ring-black/[0.06] max-w-4xl"
          onSubmit={(e) => e.preventDefault()}
          aria-label="Search stays"
        >
          <div className="relative min-w-0 rounded-xl sm:rounded-full px-3.5 py-2 hover:bg-black/[0.03] focus-within:ring-2 focus-within:ring-finland/25">
            <label htmlFor="stays-q" className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Where
            </label>
            <div className="relative">
              <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
              <input
                id="stays-q"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="City or stay"
                className="w-full h-9 pl-6 pr-2 border-0 text-ink placeholder:text-ink-muted focus:ring-0 text-[15px] bg-transparent"
              />
            </div>
          </div>
          <div className="relative min-w-0 rounded-xl sm:rounded-full px-3.5 py-2 hover:bg-black/[0.03] focus-within:ring-2 focus-within:ring-finland/25">
            <label htmlFor="stays-in" className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Check-in
            </label>
            <input
              id="stays-in"
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className="w-full h-9 border-0 text-ink focus:ring-0 text-[15px] bg-transparent"
            />
          </div>
          <div className="relative min-w-0 rounded-xl sm:rounded-full px-3.5 py-2 hover:bg-black/[0.03] focus-within:ring-2 focus-within:ring-finland/25">
            <label htmlFor="stays-out" className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Check-out
            </label>
            <input
              id="stays-out"
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className="w-full h-9 border-0 text-ink focus:ring-0 text-[15px] bg-transparent"
            />
          </div>
          <div className="relative min-w-0 rounded-xl sm:rounded-full px-3.5 py-2 hover:bg-black/[0.03] focus-within:ring-2 focus-within:ring-finland/25">
            <label htmlFor="stays-guests" className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Guests
            </label>
            <input
              id="stays-guests"
              type="number"
              min={1}
              max={99}
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
              placeholder="Guests"
              className="w-full h-9 border-0 text-ink placeholder:text-ink-muted focus:ring-0 text-[15px] bg-transparent"
            />
          </div>
          <p className="self-center text-sm text-ink-muted px-3 py-2 sm:text-right">
            {catalogLoading || waitingOnOccupancy
              ? 'Loading'
              : `${filtered.length} stay${filtered.length === 1 ? '' : 's'}`}
          </p>
        </form>

        {(q.trim() || checkIn || checkOut || guests) ? (
          <div className="mb-8 flex flex-wrap items-center gap-2" aria-label="Active filters">
            {q.trim() ? (
              <button
                type="button"
                onClick={() => setQ('')}
                className="lux-flat inline-flex items-center gap-1.5 rounded-full bg-finland/10 px-3 py-1.5 text-xs font-semibold text-finland ring-1 ring-finland/20"
              >
                “{q.trim().slice(0, 36)}
                {q.trim().length > 36 ? '…' : ''}” <X className="w-3.5 h-3.5" />
              </button>
            ) : null}
            {checkIn ? (
              <button
                type="button"
                onClick={() => setCheckIn('')}
                className="lux-flat inline-flex items-center gap-1.5 rounded-full bg-finland/10 px-3 py-1.5 text-xs font-semibold text-finland ring-1 ring-finland/20"
              >
                In {checkIn} <X className="w-3.5 h-3.5" />
              </button>
            ) : null}
            {checkOut ? (
              <button
                type="button"
                onClick={() => setCheckOut('')}
                className="lux-flat inline-flex items-center gap-1.5 rounded-full bg-finland/10 px-3 py-1.5 text-xs font-semibold text-finland ring-1 ring-finland/20"
              >
                Out {checkOut} <X className="w-3.5 h-3.5" />
              </button>
            ) : null}
            {guests ? (
              <button
                type="button"
                onClick={() => setGuests('')}
                className="lux-flat inline-flex items-center gap-1.5 rounded-full bg-finland/10 px-3 py-1.5 text-xs font-semibold text-finland ring-1 ring-finland/20"
              >
                {guests} {guests === '1' ? 'guest' : 'guests'} <X className="w-3.5 h-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setQ('');
                setCheckIn('');
                setCheckOut('');
                setGuests('');
              }}
              className="lux-flat rounded-full bg-finland px-3 py-1.5 text-xs font-semibold text-white shadow-sm ring-1 ring-finland/30"
            >
              Clear all
            </button>
          </div>
        ) : null}

        {error && supplierListings === null ? (
          <ErrorState
            title="Stays unavailable"
            body={userFacingError(error, USER_ERROR.tours)}
            retry={{ onClick: () => reload() }}
          />
        ) : catalogLoading || waitingOnOccupancy ? (
          <SkeletonCardGrid count={3} />
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-paper-raised px-6 py-2 shadow-soft ring-1 ring-black/[0.06] sm:px-8">
            {stays.length === 0 ? (
              <EmptyState
                className="py-10 sm:py-12 max-w-lg"
                icon={Compass}
                title="No stays published yet"
                body="Traverion does not fill this page with sample apartments. When an operator publishes a stay, it appears here."
                action={
                  <a href={supplierPortalLandingHref()} className="tv-btn-primary inline-flex">
                    List a stay
                  </a>
                }
              />
            ) : (
              <EmptyState
                className="py-10 sm:py-12 max-w-lg"
                icon={Search}
                title="No stays match"
                body={
                  dateFilterActive
                    ? 'No stays are free for those nights. Try other dates or clear filters to browse all stays.'
                    : 'Try another place, dates, or guest count — or clear filters to see live stays again.'
                }
                action={
                  q || checkIn || checkOut || guests ? (
                    <button
                      type="button"
                      onClick={() => {
                        setQ('');
                        setCheckIn('');
                        setCheckOut('');
                        setGuests('');
                      }}
                      className="tv-btn-primary"
                    >
                      Clear filters
                    </button>
                  ) : undefined
                }
              />
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
                discountsByListing={new Map()}
                tagLabels={{}}
                showTagPills={false}
                size="default"
                stayStayTotal={
                  stayQuote?.ok
                    ? { nights: stayQuote.nights, total: stayQuote.totalAmount, currency: stayQuote.currency }
                    : null
                }
              />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
