import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
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
} from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import { isCollectedBooking } from '../../lib/payment-states';
import { formatMoney, normalizeCurrency } from '../../lib/money';
import { navigateSupplierUrl, openSupplierCalendar } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE, PARTNER_CREATE_PATH } from '../../lib/partnerPortalPaths';
import { inventoryFamilyFromListing } from '../../lib/inventory';
import { displayListingTitleFromPurchase } from '../../lib/purchase-snapshot';

const PERFORMANCE_LOAD_ERROR =
  'We could not load analytics. Check your connection and try again.';

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
  const [windowKey, setWindowKey] = useState<WindowKey>(() => {
    const w = new URLSearchParams(window.location.search).get('window');
    if (w === '30d' || w === '90d' || w === 'all') return w;
    return '30d';
  });
  const loadGenRef = useRef(0);
  const performanceHubUserIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setListings([]);
      setBookings([]);
      setError(null);
      setLoading(false);
      return;
    }
    const gen = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    const settled = await Promise.allSettled([fetchMyListings(uid), fetchBookingsForSupplier(uid)]);
    if (gen !== loadGenRef.current) return;
    // Phase 1304: keep prior listings/bookings on failure — do not invent empty Performance.
    if (settled[0].status === 'fulfilled') {
      setListings(settled[0].value);
    }
    if (settled[1].status === 'fulfilled') {
      setBookings(settled[1].value);
    }
    if (settled[0].status === 'rejected' || settled[1].status === 'rejected') {
      setError(PERFORMANCE_LOAD_ERROR);
    }
    setLoading(false);
  }, [isSupabase, user?.id]);

  useLayoutEffect(() => {
    const clearPerformancePartnerWorkspace = () => {
      setListings([]);
      setBookings([]);
      setError(null);
    };
    if (!user?.id) {
      performanceHubUserIdRef.current = null;
      loadGenRef.current += 1;
      clearPerformancePartnerWorkspace();
      setLoading(false);
      return;
    }
    // Phase 1390: clear prior partner analytics before loading the next account (Earnings 1384 parity).
    if (performanceHubUserIdRef.current !== user.id) {
      performanceHubUserIdRef.current = user.id;
      loadGenRef.current += 1;
      clearPerformancePartnerWorkspace();
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onPop = () => {
      const w = new URLSearchParams(window.location.search).get('window');
      if (w === '30d' || w === '90d' || w === 'all') setWindowKey(w);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const setWindowAndUrl = (next: WindowKey) => {
    setWindowKey(next);
    const url = new URL(window.location.href);
    if (next === '30d') url.searchParams.delete('window');
    else url.searchParams.set('window', next);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  };

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

  const listingById = useMemo(
    () => Object.fromEntries(listings.map((l) => [l.id, l])),
    [listings]
  );

  /** One row per listing×currency — never blend currencies into a single listing total. */
  const listingRows: ListingPerformance[] = useMemo(() => {
    const byKey = new Map<string, ListingPerformance>();
    for (const b of collectedInWindow) {
      const currency = normalizeCurrency(b.currency);
      const key = `${b.listing_id}::${currency}`;
      const cur = byKey.get(key) ?? {
        listingId: b.listing_id,
        title: displayListingTitleFromPurchase(
          b.purchase_snapshot,
          titleByListingId[b.listing_id],
          'Removed listing'
        ),
        bookingsCount: 0,
        guestsCount: 0,
        revenue: 0,
        currency,
      };
      cur.bookingsCount += 1;
      cur.guestsCount += Number(b.guests) > 0 ? Number(b.guests) : 0;
      cur.revenue += Number(b.amount_paid ?? 0);
      byKey.set(key, cur);
    }
    return [...byKey.values()].sort((a, b) => b.revenue - a.revenue);
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
    const guestsCount = collectedInWindow.reduce((sum, b) => {
      const g = Number(b.guests);
      return sum + (Number.isFinite(g) && g > 0 ? g : 0);
    }, 0);
    return { bookingsCount, guestsCount };
  }, [collectedInWindow]);

  const isMultiCurrency = revenueByCurrency.length > 1;
  const listingCountInWindow = useMemo(
    () => new Set(listingRows.map((r) => r.listingId)).size,
    [listingRows]
  );
  /** Top earner only when comparable in one currency (avoid cross-currency “winner”). */
  const topListing = useMemo(() => {
    if (listingRows.length < 2) return null;
    if (isMultiCurrency) {
      const byCur = new Map<string, ListingPerformance[]>();
      for (const row of listingRows) {
        const list = byCur.get(row.currency) ?? [];
        list.push(row);
        byCur.set(row.currency, list);
      }
      const mono = [...byCur.values()].find((rows) => rows.length > 1);
      return mono?.[0] ?? null;
    }
    return listingRows[0] ?? null;
  }, [listingRows, isMultiCurrency]);

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        badge="Insights"
        icon={TrendingUp}
        title="Analytics"
        description="Paid traveler bookings only — same collected definition as Income. Not estimates, site traffic, or unpaid checkouts."
        actions={
          <div className="flex items-center gap-1 rounded-md bg-paper p-1 ring-1 ring-black/[0.06]" role="tablist" aria-label="Time range">
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={windowKey === opt.id}
                onClick={() => setWindowAndUrl(opt.id)}
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
        <ErrorState className="py-6" title="Analytics unavailable" body={error} retry={{ onClick: () => void load() }} />
      )}

      {loading && !error && listings.length === 0 && bookings.length === 0 && (
        <div className="space-y-6">
          <SupplierStatSkeletonGrid count={4} />
          <SupplierListSkeleton rows={3} />
        </div>
      )}

      {!loading && !error && collectedInWindow.length === 0 && (
        <SupplierEmptyState
          icon={TrendingUp}
          title={
            listings.length === 0
              ? 'No listings yet'
              : bookings.length > 0
                ? 'No paid bookings in this window'
                : 'No paid bookings yet'
          }
          body={
            listings.length === 0
              ? 'Analytics uses the same paid bookings as Income. Draft a listing to start collecting bookings.'
              : bookings.length > 0
                ? 'Unpaid checkouts, cancelled trips, and refunds are never counted. Try a longer time range, or wait until a traveler completes checkout.'
                : 'Try a longer time range, or check back once a traveler completes checkout — cancelled and refunded bookings are never counted.'
          }
          action={
            listings.length === 0 ? (
              <button
                type="button"
                onClick={() => navigateSupplierUrl(PARTNER_CREATE_PATH)}
                className="tv-btn-primary"
              >
                Create a listing
              </button>
            ) : windowKey !== 'all' ? (
              <button type="button" onClick={() => setWindowAndUrl('all')} className="tv-btn-secondary">
                Show all time
              </button>
            ) : bookings.length > 0 ? (
              // Phase 1652: unpaid/cancelled-only ops — open Bookings when all-time paid is empty.
              <button
                type="button"
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings`)}
                className="tv-btn-secondary"
              >
                View bookings
              </button>
            ) : (
              // Phase 1673: listings exist but zero bookings — escape to listings (Inbox/Money parity).
              <button
                type="button"
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`)}
                className="tv-btn-ghost"
              >
                Your listings
              </button>
            )
          }
        />
      )}

      {!loading && collectedInWindow.length > 0 && (
        <div className="space-y-8">
          <p className="text-xs text-ink-muted -mb-4">
            Window uses booking created date (checkout time), not departure date.
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
            <div className="tv-metric-tile">
              <p className="tv-metric-tile__label">Paid bookings</p>
              <p className="tv-metric-tile__value">{totals.bookingsCount}</p>
              <p className="text-[11px] text-ink-muted mt-1.5">{activeWindow.label.toLowerCase()}</p>
            </div>
            <div className="tv-metric-tile">
              <p className="tv-metric-tile__label">Guests</p>
              <p className="tv-metric-tile__value">{totals.guestsCount}</p>
              <p className="text-[11px] text-ink-muted mt-1.5">
                {listingCountInWindow} listing{listingCountInWindow === 1 ? '' : 's'}
              </p>
            </div>
            {revenueByCurrency.map((r) => (
              <div key={`revenue-${r.currency}`} className="tv-metric-tile">
                <p className="tv-metric-tile__label">
                  Revenue{isMultiCurrency ? ` (${r.currency})` : ''}
                </p>
                <p className="tv-metric-tile__value">{formatMoney(r.revenue, r.currency)}</p>
                <p className="text-[11px] text-ink-muted mt-1.5">paid · no refunds</p>
              </div>
            ))}
            {revenueByCurrency.map((r) => (
              <div key={`avg-${r.currency}`} className="tv-metric-tile">
                <p className="tv-metric-tile__label">
                  Avg. booking{isMultiCurrency ? ` (${r.currency})` : ''}
                </p>
                <p className="tv-metric-tile__value">
                  {formatMoney(r.count > 0 ? r.revenue / r.count : 0, r.currency)}
                </p>
                <p className="text-[11px] text-ink-muted mt-1.5">per paid booking</p>
              </div>
            ))}
          </div>

          {isMultiCurrency && (
            <p className="text-xs text-ink-muted -mt-4">
              Bookings in this window span {revenueByCurrency.length} currencies — revenue is never converted or
              blended between them.
            </p>
          )}

          {topListing && (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Award className="w-4 h-4 text-finland shrink-0" aria-hidden />
              <span>
                <span className="font-medium text-ink">{topListing.title}</span> is your top earner this window
                {isMultiCurrency ? ` in ${topListing.currency}` : ''} at{' '}
                {formatMoney(topListing.revenue, topListing.currency)}.
              </span>
            </div>
          )}

          <div>
            <h2 className="font-display text-[1.125rem] font-semibold tracking-tight text-ink mb-3">By listing</h2>
            <ul className="space-y-2">
              {listingRows.map((row) => {
                const currencyTotal = revenueTotalByCurrency.get(row.currency) ?? 0;
                const share = currencyTotal > 0 ? Math.round((row.revenue / currencyTotal) * 100) : 0;
                const listing = listingById[row.listingId];
                const isStay = listing ? inventoryFamilyFromListing(listing) === 'stay' : false;
                return (
                  <li key={`${row.listingId}-${row.currency}`}>
                    <div className="tv-metric-tile">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink truncate leading-snug">
                            {row.title}
                            {isMultiCurrency ? (
                              <span className="text-ink-muted font-normal"> · {row.currency}</span>
                            ) : null}
                          </p>
                          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
                            {`${isStay ? 'Stay' : 'Tour'} · ${row.bookingsCount} paid · ${row.guestsCount} guest${row.guestsCount === 1 ? '' : 's'} · ${share}% of ${row.currency}`}
                          </p>
                        </div>
                        <p className="font-display text-[1.05rem] font-semibold tabular-nums tracking-tight text-ink shrink-0">
                          {formatMoney(row.revenue, row.currency)}
                        </p>
                      </div>
                      <div className="mt-3 h-1 w-full rounded-full bg-black/[0.06] overflow-hidden" aria-hidden>
                        <div
                          className="h-full rounded-full bg-finland transition-all duration-300 motion-reduce:transition-none"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            navigateSupplierUrl(
                              `${PARTNER_APP_BASE}/bookings?listing=${encodeURIComponent(row.listingId)}&view=all`
                            )
                          }
                          className="lux-flat min-h-11 rounded-md px-3 py-1.5 text-xs font-semibold text-finland ring-1 ring-finland/20 hover:bg-finland/5"
                        >
                          Bookings
                        </button>
                        <button
                          type="button"
                          onClick={() => openSupplierCalendar(row.listingId)}
                          className="lux-flat min-h-11 rounded-md px-3 py-1.5 text-xs font-semibold text-ink-muted ring-1 ring-black/[0.08] hover:text-ink"
                        >
                          Calendar
                        </button>
                      </div>
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
