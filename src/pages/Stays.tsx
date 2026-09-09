import { useMemo, useState, useEffect } from 'react';
import { Compass, Search } from 'lucide-react';
import { usePublishedSupplierListings } from '../hooks/usePublishedSupplierListings';
import { isSupabaseConfigured } from '../lib/supabase';
import { getAllListings } from '../data/listings';
import { filterCatalogByFamily } from '../lib/inventory';
import { parseListingExtras } from '../types/listingExtras';
import { PublicListingBrowseCard } from '../components/PublicListingBrowseCard';
import { quoteStayNights } from '../lib/booking-quote';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { SkeletonCardGrid } from '../components/ui/Skeleton';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { supplierPortalLandingHref } from '../lib/partnerHost';
import { STRIPE_CHECKOUT_CANCELLED_STAY_COPY, readStripeCheckoutReturnBanner } from '../lib/booking-confirmation-copy';
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
      return true;
    });
  }, [stays, q, guests]);

  return (
    <div className="min-h-screen bg-paper tv-page">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-16 motion-safe:animate-fade-in">
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-3">Stays</p>
        <h1 className="font-display text-4xl sm:text-5xl text-ink tracking-tight mb-2">Places to stay</h1>
        <p className="text-ink-muted max-w-xl mb-8 leading-relaxed">
          Apartments and rooms from operators — not mixed into Tours. Dates are nights, not departures.
        </p>
        {paymentBanner === 'cancelled' ? (
          <p className="mb-8 max-w-xl rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200/70">
            {STRIPE_CHECKOUT_CANCELLED_STAY_COPY}
          </p>
        ) : null}

        <form
          className="grid grid-cols-2 sm:grid-cols-[1fr_auto_auto_auto_auto] gap-2 bg-paper-raised rounded-2xl p-2 shadow-soft-lg max-w-4xl mb-10"
          onSubmit={(e) => e.preventDefault()}
          aria-label="Search stays"
        >
          <label className="sr-only" htmlFor="stays-q">
            Where
          </label>
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-faint pointer-events-none" />
            <input
              id="stays-q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Where"
              className="w-full h-12 pl-11 pr-4 rounded-xl bg-transparent text-ink"
            />
          </div>
          <label className="sr-only" htmlFor="stays-in">
            Check-in
          </label>
          <input
            id="stays-in"
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            className="h-12 px-3 rounded-xl bg-transparent text-ink"
          />
          <label className="sr-only" htmlFor="stays-out">
            Check-out
          </label>
          <input
            id="stays-out"
            type="date"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            className="h-12 px-3 rounded-xl bg-transparent text-ink"
          />
          <label className="sr-only" htmlFor="stays-guests">
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
            className="h-12 px-3 rounded-xl bg-transparent text-ink"
          />
          <p className="col-span-2 sm:col-span-1 self-center text-sm text-ink-muted px-2">
            {catalogLoading ? 'Loading' : `${filtered.length} stay${filtered.length === 1 ? '' : 's'}`}
          </p>
        </form>

        {error && supplierListings === null ? (
          <ErrorState
            title="Stays unavailable"
            body={userFacingError(error, USER_ERROR.tours)}
            retry={{ onClick: () => reload() }}
          />
        ) : catalogLoading ? (
          <SkeletonCardGrid count={3} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Compass}
            title={stays.length === 0 ? 'No stays published yet' : 'Nothing matches'}
            body={
              stays.length === 0
                ? 'Traverion does not fill this page with sample apartments. When an operator publishes a stay, it appears here.'
                : 'Try another place, dates, or guest count.'
            }
            action={
              stays.length === 0 ? (
                <a href={supplierPortalLandingHref()} className="tv-btn-primary inline-flex">
                  List a stay
                </a>
              ) : undefined
            }
          />
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
