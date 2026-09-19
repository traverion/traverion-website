import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, Award } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import type { TourPackage } from '../../types/tour';
import {
  SUPPLIER_PAGE_CLASS,
  SupplierPageHero,
  SupplierEmptyState,
  SupplierStatSkeletonGrid,
  SupplierListSkeleton,
  SUPPLIER_STAT_GRID_CLASS,
} from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import { isCollectedBooking } from '../../lib/payment-states';
import { formatMoney, normalizeCurrency } from '../../lib/money';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';

const PERFORMANCE_LOAD_ERROR =
  'We could not load performance. Check your connection and try again.';

type WindowKey = '30d' | '90d' | 'all';

const WINDOW_OPTIONS: { id: WindowKey; label: string; days: number | null }[] = [
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
];

type ListingPerformance = {
  listingId: string;
  title: string;
  bookingsCount: number;
  guestsCount: number;
  revenue: number;
  currency: string;
};

export default function SupplierPerformance() {
  const { user, isSupabase } = useSupplierAuth();
  const [listings, setListings] = useState<TourPackage[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowKey, setWindowKey] = useState<WindowKey>('30d');

  const load = useCallback(async () => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setListings([]);
      setBookings([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const settled = await Promise.allSettled([fetchMyListings(uid), fetchBookingsForSupplier(uid)]);
    if (settled[0].status === 'fulfilled') {
      setListings(settled[0].value);
    } else {
      setListings([]);
    }
    if (settled[1].status === 'fulfilled') {
      setBookings(settled[1].value);
    } else {
      setBookings([]);
    }
    if (settled[0].status === 'rejected' && settled[1].status === 'rejected') {
      setError(PERFORMANCE_LOAD_ERROR);
    }
    setLoading(false);
  }, [isSupabase, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeWindow = WINDOW_OPTIONS.find((w) => w.id === windowKey) ?? WINDOW_OPTIONS[0];

  const collectedInWindow = useMemo(() => {
    const cutoff =
      activeWindow.days == null ? null : Date.now() - activeWindow.days * 24 * 60 * 60 * 1000;
    return bookings.filter((b) => {
      if (!isCollectedBooking(b)) return false;
      if (cutoff == null) return true;
      const createdAt = b.created_at ? new Date(b.created_at).getTime() : NaN;
      return Number.isFinite(createdAt) && createdAt >= cutoff;
    });
  }, [bookings, activeWindow]);

  const titleByListingId = useMemo(
    () => Object.fromEntries(listings.map((l) => [l.id, l.title])),
    [listings]
  );

  const listingRows: ListingPerformance[] = useMemo(() => {
    const byListing = new Map<string, ListingPerformance>();
    for (const b of collectedInWindow) {
      const cur = byListing.get(b.listing_id) ?? {
        listingId: b.listing_id,
        title: titleByListingId[b.listing_id] ?? 'Removed listing',
        bookingsCount: 0,
        guestsCount: 0,
        revenue: 0,
        currency: normalizeCurrency(b.currency),
      };
      cur.bookingsCount += 1;
      cur.guestsCount += b.guests ?? 0;
      cur.revenue += Number(b.amount_paid ?? 0);
      byListing.set(b.listing_id, cur);
    }
    return [...byListing.values()].sort((a, b) => b.revenue - a.revenue);
  }, [collectedInWindow, titleByListingId]);

  /** Revenue is never blended across currencies (this platform genuinely supports several) —
   * bucket by currency so every revenue figure always names a real, single currency. */
  type CurrencyStat = { currency: string; revenue: number; count: number };
  const revenueByCurrency: CurrencyStat[] = useMemo(() => {
    const byCurrency = new Map<string, CurrencyStat>();
    for (const b of collectedInWindow) {
      const code = normalizeCurrency(b.currency);
      const cur = byCurrency.get(code) ?? { currency: code, revenue: 0, count: 0 };
      cur.revenue += Number(b.amount_paid ?? 0);
      cur.count += 1;
      byCurrency.set(code, cur);
    }
    return [...byCurrency.values()].sort((a, b) => b.revenue - a.revenue);
  }, [collectedInWindow]);

  const revenueTotalByCurrency = useMemo(
    () => new Map(revenueByCurrency.map((r) => [r.currency, r.revenue])),
    [revenueByCurrency]
  );

  const totals = useMemo(() => {
    const bookingsCount = collectedInWindow.length;
    const guestsCount = collectedInWindow.reduce((sum, b) => sum + (b.guests ?? 0), 0);
    return { bookingsCount, guestsCount };
  }, [collectedInWindow]);

  const isMultiCurrency = revenueByCurrency.length > 1;
  const topListing = listingRows[0] ?? null;

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        badge="Insights"
        icon={TrendingUp}
        title="Performance"
        description="Which listings are actually earning, based on completed bookings — not estimates or site-traffic guesses."
        actions={
          <div className="flex items-center gap-1 rounded-md bg-paper p-1 ring-1 ring-black/[0.06]" role="tablist" aria-label="Time range">
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={windowKey === opt.id}
                onClick={() => setWindowKey(opt.id)}
                className={`lux-flat px-3 py-1.5 rounded-full text-sm font-medium transition-colors duration-150 ${
                  windowKey === opt.id
                    ? 'bg-finland text-white shadow-sm'
                    : 'text-ink-muted hover:bg-finland/10 hover:text-finland'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
      />

      {error && (
        <ErrorState className="py-6" title="Performance unavailable" body={error} retry={{ onClick: () => void load() }} />
      )}

      {!error && loading && (
        <div className="space-y-6">
          <SupplierStatSkeletonGrid count={4} />
          <SupplierListSkeleton rows={3} />
        </div>
      )}

      {!error && !loading && collectedInWindow.length === 0 && (
        <SupplierEmptyState
          icon={TrendingUp}
          title={listings.length === 0 ? 'No listings yet' : 'No completed bookings in this window'}
          body={
            listings.length === 0
              ? 'Performance is based on your real bookings. Publish a listing to start seeing numbers here.'
              : 'Try a longer time range, or check back once a booking is paid — cancelled and refunded bookings are never counted.'
          }
          action={
            listings.length === 0 ? (
              <button
                type="button"
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings?new=1`)}
                className="tv-btn-primary"
              >
                Create a listing
              </button>
            ) : undefined
          }
        />
      )}

      {!error && !loading && collectedInWindow.length > 0 && (
        <div className="space-y-8">
          <div className={SUPPLIER_STAT_GRID_CLASS}>
            <div className="tv-card p-4 sm:p-5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">Bookings</p>
              <p className="mt-1.5 font-display text-3xl text-ink tabular-nums">{totals.bookingsCount}</p>
              <p className="text-xs text-ink-muted mt-2">{activeWindow.label.toLowerCase()}</p>
            </div>
            <div className="tv-card p-4 sm:p-5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">Guests</p>
              <p className="mt-1.5 font-display text-3xl text-ink tabular-nums">{totals.guestsCount}</p>
              <p className="text-xs text-ink-muted mt-2">across {listingRows.length} listing{listingRows.length === 1 ? '' : 's'}</p>
            </div>
            {revenueByCurrency.map((r) => (
              <div key={`revenue-${r.currency}`} className="tv-card p-4 sm:p-5">
                <p className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                  Revenue collected{isMultiCurrency ? ` (${r.currency})` : ''}
                </p>
                <p className="mt-1.5 font-display text-3xl text-ink tabular-nums">{formatMoney(r.revenue, r.currency)}</p>
                <p className="text-xs text-ink-muted mt-2">paid bookings, refunds excluded</p>
              </div>
            ))}
            {revenueByCurrency.map((r) => (
              <div key={`avg-${r.currency}`} className="tv-card p-4 sm:p-5">
                <p className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                  Avg. booking value{isMultiCurrency ? ` (${r.currency})` : ''}
                </p>
                <p className="mt-1.5 font-display text-3xl text-ink tabular-nums">
                  {formatMoney(r.count > 0 ? r.revenue / r.count : 0, r.currency)}
                </p>
                <p className="text-xs text-ink-muted mt-2">per collected booking</p>
              </div>
            ))}
          </div>

          {isMultiCurrency && (
            <p className="text-xs text-ink-muted -mt-4">
              Bookings in this window span {revenueByCurrency.length} currencies — revenue is never converted or
              blended between them.
            </p>
          )}

          {topListing && listingRows.length > 1 && (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Award className="w-4 h-4 text-finland shrink-0" aria-hidden />
              <span>
                <span className="font-medium text-ink">{topListing.title}</span> is your top earner this window at{' '}
                {formatMoney(topListing.revenue, topListing.currency)}.
              </span>
            </div>
          )}

          <div>
            <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-3">By listing</h2>
            <ul className="space-y-2.5">
              {listingRows.map((row) => {
                const currencyTotal = revenueTotalByCurrency.get(row.currency) ?? 0;
                const share = currencyTotal > 0 ? Math.round((row.revenue / currencyTotal) * 100) : 0;
                return (
                  <li key={row.listingId} className="tv-card p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink truncate">{row.title}</p>
                        <p className="text-sm text-ink-muted mt-0.5">
                          {row.bookingsCount} booking{row.bookingsCount === 1 ? '' : 's'} · {row.guestsCount} guest
                          {row.guestsCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-display text-xl text-ink tabular-nums">{formatMoney(row.revenue, row.currency)}</p>
                        <p className="text-xs text-ink-muted mt-0.5">{share}% of revenue</p>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 w-full rounded-full bg-black/[0.06] overflow-hidden" aria-hidden>
                      <div className="h-full rounded-full bg-finland transition-all duration-300" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
