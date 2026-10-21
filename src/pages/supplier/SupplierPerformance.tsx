import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { Info, TrendingUp } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import {
  fetchSupplierCommercialSnapshots,
  type BookingCommercialSnapshotRow,
} from '../../data/supabase-earnings';
import { fetchReviewsForSupplierListings } from '../../data/supabase-reviews';
import { fetchListingTrafficCounts, type ListingTrafficCounts } from '../../data/supabase-listing-traffic';
import type { TourPackage } from '../../types/tour';
import {
  SUPPLIER_PAGE_CLASS,
  SupplierEmptyState,
  SupplierStatSkeletonGrid,
  SupplierListSkeleton,
} from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import { formatMoney } from '../../lib/money';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE, PARTNER_CREATE_PATH } from '../../lib/partnerPortalPaths';
import { AnalyticsBarChart, AnalyticsLineChart } from '../../components/supplier/analytics/AnalyticsCharts';
import AnalyticsListingTable from '../../components/supplier/analytics/AnalyticsListingTable';
import {
  ANALYTICS_RANGE_OPTIONS,
  ANALYTICS_SECTIONS,
  aggregateLeadTimes,
  aggregateListingRows,
  aggregateMoneyByCurrency,
  aggregatePartySizes,
  averageLeadTimeDays,
  buildEarningsSeries,
  busiestBookingDay,
  cancellationStats,
  completedServiceCount,
  filterAnalyticsBookings,
  listingMetaFromPackage,
  parseAnalyticsBasis,
  parseAnalyticsProductType,
  parseAnalyticsRange,
  parseAnalyticsSection,
  percentChange,
  previousAnalyticsRange,
  resolveAnalyticsDateRange,
  type AnalyticsDateBasis,
  type AnalyticsListingMeta,
  type AnalyticsProductType,
  type AnalyticsRangeKey,
  type AnalyticsSection,
} from '../../lib/partner-analytics';
import { isCollectedBooking, isPaidPaymentStatus } from '../../lib/payment-states';

const PERFORMANCE_LOAD_ERROR =
  'We could not load analytics. Check your connection and try again.';

function Delta({ current, previous }: { current: number; previous: number }) {
  const pct = percentChange(current, previous);
  if (pct == null) return <p className="tv-analytics-delta tv-analytics-delta--flat">No prior baseline</p>;
  const up = pct > 0.05;
  const down = pct < -0.05;
  return (
    <p className={`tv-analytics-delta ${up ? 'tv-analytics-delta--up' : down ? 'tv-analytics-delta--down' : 'tv-analytics-delta--flat'}`}>
      {up ? '↑' : down ? '↓' : '→'} {Math.abs(pct).toFixed(0)}% vs prior period
    </p>
  );
}

function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[#073b83] hover:bg-[#f0f4fa]"
        aria-label="More information"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open ? (
        <span role="tooltip" className="absolute left-0 top-[calc(100%+4px)] z-20 w-56 rounded-lg border border-[#e5e7eb] bg-white px-2.5 py-2 text-left text-[12px] leading-snug text-[#3f3f46] shadow-sm">
          {text}
        </span>
      ) : null}
    </span>
  );
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    section: parseAnalyticsSection(params.get('section') ?? params.get('tab')),
    range: parseAnalyticsRange(params.get('range') ?? params.get('window')),
    basis: parseAnalyticsBasis(params.get('basis')),
    productType: parseAnalyticsProductType(params.get('type')),
    listingId: params.get('listing')?.trim() || '',
    customFrom: params.get('from')?.trim() || '',
    customTo: params.get('to')?.trim() || '',
    detailListing: params.get('detail')?.trim() || '',
  };
}

export default function SupplierPerformance() {
  const { user, isSupabase } = useSupplierAuth();
  const [listings, setListings] = useState<TourPackage[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [snapshots, setSnapshots] = useState<BookingCommercialSnapshotRow[]>([]);
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof fetchReviewsForSupplierListings>>>([]);
  const [traffic, setTraffic] = useState<ListingTrafficCounts[]>([]);
  const [trafficAvailable, setTrafficAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initial = typeof window !== 'undefined' ? readUrlState() : null;
  const [section, setSection] = useState<AnalyticsSection>(initial?.section ?? 'summary');
  const [rangeKey, setRangeKey] = useState<AnalyticsRangeKey>(initial?.range ?? '30d');
  const [basis, setBasis] = useState<AnalyticsDateBasis>(initial?.basis ?? 'booking');
  const [productType, setProductType] = useState<AnalyticsProductType>(initial?.productType ?? 'all');
  const [listingId, setListingId] = useState(initial?.listingId ?? '');
  const [customFrom, setCustomFrom] = useState(initial?.customFrom ?? '');
  const [customTo, setCustomTo] = useState(initial?.customTo ?? '');
  const [detailListingId, setDetailListingId] = useState(initial?.detailListing ?? '');
  const [salesSeries, setSalesSeries] = useState<'net' | 'gross' | 'commission'>('net');
  const loadGenRef = useRef(0);
  const hubUserIdRef = useRef<string | null>(null);
  const hasDataRef = useRef(false);

  const pushUrl = useCallback(
    (next: {
      section?: AnalyticsSection;
      range?: AnalyticsRangeKey;
      basis?: AnalyticsDateBasis;
      productType?: AnalyticsProductType;
      listingId?: string;
      customFrom?: string;
      customTo?: string;
      detailListingId?: string;
    }, replace = false) => {
      const url = new URL(window.location.href);
      const s = next.section ?? section;
      const r = next.range ?? rangeKey;
      const b = next.basis ?? basis;
      const t = next.productType ?? productType;
      const l = next.listingId ?? listingId;
      const from = next.customFrom ?? customFrom;
      const to = next.customTo ?? customTo;
      const detail = next.detailListingId ?? detailListingId;
      if (s === 'summary') url.searchParams.delete('section');
      else url.searchParams.set('section', s);
      url.searchParams.delete('tab');
      if (r === '30d') url.searchParams.delete('range');
      else url.searchParams.set('range', r);
      url.searchParams.delete('window');
      if (b === 'booking') url.searchParams.delete('basis');
      else url.searchParams.set('basis', b);
      if (t === 'all') url.searchParams.delete('type');
      else url.searchParams.set('type', t);
      if (!l) url.searchParams.delete('listing');
      else url.searchParams.set('listing', l);
      if (r === 'custom' && from) url.searchParams.set('from', from);
      else url.searchParams.delete('from');
      if (r === 'custom' && to) url.searchParams.set('to', to);
      else url.searchParams.delete('to');
      if (!detail) url.searchParams.delete('detail');
      else url.searchParams.set('detail', detail);
      const href = `${url.pathname}${url.search}`;
      if (replace) window.history.replaceState({}, '', href);
      else window.history.pushState({}, '', href);
    },
    [section, rangeKey, basis, productType, listingId, customFrom, customTo, detailListingId]
  );

  const load = useCallback(async () => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setListings([]);
      setBookings([]);
      setSnapshots([]);
      setReviews([]);
      setTraffic([]);
      setTrafficAvailable(false);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const gen = ++loadGenRef.current;
    if (hasDataRef.current) setRefreshing(true);
    else setLoading(true);
    setError(null);
    const settled = await Promise.allSettled([
      fetchMyListings(uid),
      fetchBookingsForSupplier(uid),
      fetchSupplierCommercialSnapshots(uid),
      fetchReviewsForSupplierListings(uid),
    ]);
    if (gen !== loadGenRef.current) return;
    if (settled[0].status === 'fulfilled') setListings(settled[0].value);
    if (settled[1].status === 'fulfilled') setBookings(settled[1].value);
    if (settled[2].status === 'fulfilled') setSnapshots(settled[2].value);
    if (settled[3].status === 'fulfilled') setReviews(settled[3].value);
    if (settled[0].status === 'fulfilled' || settled[1].status === 'fulfilled') {
      hasDataRef.current = true;
    }
    if (settled[0].status === 'rejected' || settled[1].status === 'rejected') {
      setError(PERFORMANCE_LOAD_ERROR);
    }
    setLoading(false);
    setRefreshing(false);
  }, [isSupabase, user?.id]);

  useLayoutEffect(() => {
    if (!user?.id) {
      hubUserIdRef.current = null;
      loadGenRef.current += 1;
      hasDataRef.current = false;
      setListings([]);
      setBookings([]);
      setSnapshots([]);
      setReviews([]);
      setTraffic([]);
      setLoading(false);
      return;
    }
    if (hubUserIdRef.current !== user.id) {
      hubUserIdRef.current = user.id;
      loadGenRef.current += 1;
      hasDataRef.current = false;
      setListings([]);
      setBookings([]);
      setSnapshots([]);
      setReviews([]);
      setTraffic([]);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onPop = () => {
      const state = readUrlState();
      setSection(state.section);
      setRangeKey(state.range);
      setBasis(state.basis);
      setProductType(state.productType);
      setListingId(state.listingId);
      setCustomFrom(state.customFrom);
      setCustomTo(state.customTo);
      setDetailListingId(state.detailListing);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const dateRange = useMemo(
    () => resolveAnalyticsDateRange(rangeKey, customFrom || null, customTo || null),
    [rangeKey, customFrom, customTo]
  );
  const priorRange = useMemo(
    () => previousAnalyticsRange(dateRange.from, dateRange.to),
    [dateRange.from, dateRange.to]
  );

  const listingsById = useMemo(() => {
    const map: Record<string, AnalyticsListingMeta> = {};
    for (const listing of listings) {
      map[listing.id] = listingMetaFromPackage(listing);
    }
    return map;
  }, [listings]);

  const snapshotsByBookingId = useMemo(() => {
    const map: Record<string, (typeof snapshots)[number]> = {};
    for (const row of snapshots) map[row.booking_id] = row;
    return map;
  }, [snapshots]);

  const filteredPaid = useMemo(
    () =>
      filterAnalyticsBookings({
        bookings,
        listingsById,
        from: dateRange.from,
        to: dateRange.to,
        basis,
        productType,
        listingId: listingId || null,
        collectedOnly: true,
      }),
    [bookings, listingsById, dateRange, basis, productType, listingId]
  );

  const priorPaid = useMemo(
    () =>
      filterAnalyticsBookings({
        bookings,
        listingsById,
        from: priorRange.from,
        to: priorRange.to,
        basis,
        productType,
        listingId: listingId || null,
        collectedOnly: true,
      }),
    [bookings, listingsById, priorRange, basis, productType, listingId]
  );

  const windowAllBookings = useMemo(
    () =>
      filterAnalyticsBookings({
        bookings,
        listingsById,
        from: dateRange.from,
        to: dateRange.to,
        basis,
        productType,
        listingId: listingId || null,
        collectedOnly: false,
      }),
    [bookings, listingsById, dateRange, basis, productType, listingId]
  );

  useEffect(() => {
    const ids = listings.map((l) => l.id);
    if (ids.length === 0) {
      setTraffic([]);
      setTrafficAvailable(false);
      return;
    }
    let cancelled = false;
    void fetchListingTrafficCounts({ listingIds: ids, from: dateRange.from, to: dateRange.to })
      .then((res) => {
        if (cancelled) return;
        setTraffic(res.counts);
        setTrafficAvailable(res.available);
      })
      .catch(() => {
        if (!cancelled) {
          setTraffic([]);
          setTrafficAvailable(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [listings, dateRange.from, dateRange.to]);

  const moneyNow = useMemo(
    () => aggregateMoneyByCurrency(filteredPaid, snapshotsByBookingId),
    [filteredPaid, snapshotsByBookingId]
  );
  const moneyPrior = useMemo(
    () => aggregateMoneyByCurrency(priorPaid, snapshotsByBookingId),
    [priorPaid, snapshotsByBookingId]
  );
  const primary = moneyNow[0] ?? null;
  const primaryPrior = moneyPrior.find((m) => m.currency === primary?.currency) ?? moneyPrior[0] ?? null;

  const listingRows = useMemo(
    () =>
      aggregateListingRows({
        bookings: filteredPaid,
        snapshotsByBookingId,
        listingsById,
        cancelledInWindow: windowAllBookings.filter(
          (b) => (b.status ?? '').toLowerCase() === 'cancelled' && isPaidPaymentStatus(b.payment_status)
        ),
      }),
    [filteredPaid, snapshotsByBookingId, listingsById, windowAllBookings]
  );

  const series = useMemo(() => {
    if (!primary) return [];
    return buildEarningsSeries({
      bookings: filteredPaid,
      snapshotsByBookingId,
      basis,
      from: dateRange.from,
      to: dateRange.to,
      currency: primary.currency,
    });
  }, [filteredPaid, snapshotsByBookingId, basis, dateRange, primary]);

  const cancelStats = useMemo(
    () => cancellationStats({ paidBookings: filteredPaid, allBookingsInWindow: windowAllBookings }),
    [filteredPaid, windowAllBookings]
  );

  const leadTimes = useMemo(() => aggregateLeadTimes(filteredPaid), [filteredPaid]);
  const partySizes = useMemo(() => aggregatePartySizes(filteredPaid), [filteredPaid]);
  const avgLead = useMemo(() => averageLeadTimeDays(filteredPaid), [filteredPaid]);
  const busyDay = useMemo(() => busiestBookingDay(filteredPaid, basis), [filteredPaid, basis]);
  const completed = useMemo(() => completedServiceCount(filteredPaid), [filteredPaid]);

  const trafficTotals = useMemo(() => {
    const scoped = listingId ? traffic.filter((t) => t.listingId === listingId) : traffic;
    return scoped.reduce(
      (acc, row) => ({
        impressions: acc.impressions + row.impressions,
        views: acc.views + row.views,
        bookStarts: acc.bookStarts + row.bookStarts,
        bookCompletes: acc.bookCompletes + row.bookCompletes,
      }),
      { impressions: 0, views: 0, bookStarts: 0, bookCompletes: 0 }
    );
  }, [traffic, listingId]);

  const reviewStats = useMemo(() => {
    if (reviews.length === 0) return null;
    const scoped = listingId ? reviews.filter((r) => r.listing_id === listingId) : reviews;
    if (scoped.length === 0) return null;
    const sum = scoped.reduce((a, r) => a + Number(r.rating || 0), 0);
    const dist = [0, 0, 0, 0, 0];
    for (const r of scoped) {
      const star = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 0)));
      dist[star - 1] += 1;
    }
    return {
      avg: sum / scoped.length,
      count: scoped.length,
      dist,
    };
  }, [reviews, listingId]);

  const highlights = useMemo(() => {
    const items: string[] = [];
    if (listingRows[0]) {
      items.push(
        `${listingRows[0].title} is your highest-earning listing at ${formatMoney(listingRows[0].net, listingRows[0].currency)}.`
      );
    }
    if (busyDay) {
      const label = new Date(`${busyDay.day}T12:00:00`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      items.push(`${label} was your busiest ${basis === 'service' ? 'service' : 'booking'} day (${busyDay.count}).`);
    }
    if (avgLead != null) {
      items.push(`Average booking lead time is ${avgLead.toFixed(1)} days.`);
    }
    if (primary && primaryPrior) {
      const pct = percentChange(primary.net, primaryPrior.net);
      if (pct != null) {
        items.push(
          `Net earnings ${pct >= 0 ? 'increased' : 'decreased'} ${Math.abs(pct).toFixed(0)}% versus the previous period.`
        );
      }
    }
    return items.slice(0, 4);
  }, [listingRows, busyDay, avgLead, primary, primaryPrior, basis]);

  const tourStaySplit = useMemo(() => {
    let tour = 0;
    let stay = 0;
    for (const row of listingRows) {
      if (row.productType === 'Stay') stay += row.net;
      else if (row.productType === 'Tour') tour += row.net;
    }
    return { tour, stay };
  }, [listingRows]);

  const detailMeta = detailListingId ? listingsById[detailListingId] : null;
  const detailRows = useMemo(
    () => listingRows.filter((row) => row.listingId === detailListingId),
    [listingRows, detailListingId]
  );
  const detailPaid = useMemo(
    () => filteredPaid.filter((b) => b.listing_id === detailListingId),
    [filteredPaid, detailListingId]
  );
  const detailSeries = useMemo(() => {
    const currency = detailRows[0]?.currency ?? primary?.currency;
    if (!currency || !detailListingId) return [];
    return buildEarningsSeries({
      bookings: detailPaid,
      snapshotsByBookingId,
      basis,
      from: dateRange.from,
      to: dateRange.to,
      currency,
    });
  }, [detailPaid, snapshotsByBookingId, basis, dateRange, detailRows, primary, detailListingId]);

  const openListingDetail = (id: string) => {
    setDetailListingId(id);
    pushUrl({ detailListingId: id });
  };

  const closeListingDetail = () => {
    setDetailListingId('');
    pushUrl({ detailListingId: '' }, true);
  };

  const hasAnyPaid = bookings.some(isCollectedBooking);

  return (
    <div className={`${SUPPLIER_PAGE_CLASS} tv-analytics font-sans`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-sans text-lg font-bold tracking-tight text-[#18181b]">Analytics</h1>
          <p className="mt-0.5 text-[12px] text-[#71717a]">Understand your performance and grow your business.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] font-semibold text-[#71717a]">
            Date range
            <select
              className="tv-input mt-1 h-10 w-auto min-w-[10rem]"
              value={rangeKey}
              onChange={(e) => {
                const next = parseAnalyticsRange(e.target.value);
                setRangeKey(next);
                pushUrl({ range: next });
              }}
              aria-label="Date range"
            >
              {ANALYTICS_RANGE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          {rangeKey === 'custom' ? (
            <>
              <label className="text-[11px] font-semibold text-[#71717a]">
                From
                <input
                  type="date"
                  className="tv-input mt-1 h-10"
                  value={customFrom}
                  onChange={(e) => {
                    setCustomFrom(e.target.value);
                    pushUrl({ customFrom: e.target.value, range: 'custom' });
                  }}
                />
              </label>
              <label className="text-[11px] font-semibold text-[#71717a]">
                To
                <input
                  type="date"
                  className="tv-input mt-1 h-10"
                  value={customTo}
                  onChange={(e) => {
                    setCustomTo(e.target.value);
                    pushUrl({ customTo: e.target.value, range: 'custom' });
                  }}
                />
              </label>
            </>
          ) : null}
        </div>
      </div>

      <div className="tv-analytics-tabs" role="tablist" aria-label="Analytics sections">
        {ANALYTICS_SECTIONS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={section === tab.id}
            onClick={() => {
              setSection(tab.id);
              pushUrl({ section: tab.id });
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tv-analytics-filters">
        <label>
          Listing
          <select
            className="tv-input"
            value={listingId}
            onChange={(e) => {
              setListingId(e.target.value);
              pushUrl({ listingId: e.target.value });
            }}
            aria-label="Listing filter"
          >
            <option value="">All listings</option>
            {listings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Product type
          <select
            className="tv-input"
            value={productType}
            onChange={(e) => {
              const next = parseAnalyticsProductType(e.target.value);
              setProductType(next);
              pushUrl({ productType: next });
            }}
            aria-label="Product type"
          >
            <option value="all">All</option>
            <option value="tour">Tours & Activities</option>
            <option value="stay">Stays</option>
          </select>
        </label>
        <label>
          Date basis <InfoTip text="Booking date uses checkout time. Service date uses departure for tours and check-in for stays. Multi-night stays are attributed to check-in, not prorated by night." />
          <select
            className="tv-input"
            value={basis}
            onChange={(e) => {
              const next = parseAnalyticsBasis(e.target.value);
              setBasis(next);
              pushUrl({ basis: next });
            }}
            aria-label="Date basis"
          >
            <option value="booking">Booking date</option>
            <option value="service">Experience / stay date</option>
          </select>
        </label>
        <p className="self-end pb-2 text-[12px] text-[#71717a]">
          {dateRange.label}
          {dateRange.from && dateRange.to ? ` · ${dateRange.from} → ${dateRange.to}` : ''}
          {refreshing ? ' · Updating…' : ''}
        </p>
      </div>

      {error ? (
        <ErrorState className="py-6" title="Analytics unavailable" body={error} retry={{ onClick: () => void load() }} />
      ) : null}

      {loading && !error && listings.length === 0 && bookings.length === 0 ? (
        <div className="space-y-6">
          <SupplierStatSkeletonGrid count={4} />
          <SupplierListSkeleton rows={3} />
        </div>
      ) : null}

      {!loading && !error && !hasAnyPaid && listings.length === 0 ? (
        <SupplierEmptyState
          icon={TrendingUp}
          title="No listings yet"
          body="Analytics uses the same paid bookings as Income. Create a listing to start collecting bookings."
          action={
            <button type="button" onClick={() => navigateSupplierUrl(PARTNER_CREATE_PATH)} className="tv-btn-primary">
              Create a listing
            </button>
          }
        />
      ) : null}

      {!loading && !error && !hasAnyPaid && listings.length > 0 ? (
        <div className="tv-analytics-empty">
          {/* Phase 1652: View bookings when unpaid-only. Phase 1673: Your listings when zero bookings. */}
          <p className="font-semibold text-[#18181b]">
            {bookings.length > 0 ? 'No paid bookings in this window' : 'No paid bookings yet'}
          </p>
          <p className="mt-1 text-[13px] text-[#71717a]">
            Your performance will appear here after your first paid booking. Unpaid checkouts are never counted.
          </p>
          {bookings.length > 0 ? (
            <button
              type="button"
              className="tv-btn-secondary mt-3 h-9 px-3 text-[13px]"
              onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings`)}
            >
              View bookings
            </button>
          ) : (
            <button
              type="button"
              className="tv-btn-ghost mt-3 h-9 px-3 text-[13px]"
              onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`)}
            >
              Your listings
            </button>
          )}
        </div>
      ) : null}

      {!loading && !error && hasAnyPaid && filteredPaid.length === 0 && !detailListingId ? (
        <div className="tv-analytics-empty">
          <p className="font-semibold text-[#18181b]">No results for these filters</p>
          <p className="mt-1 text-[13px] text-[#71717a]">Try a wider date range or clear the listing filter.</p>
          <button
            type="button"
            className="tv-btn-secondary mt-3 h-9 px-3 text-[13px]"
            onClick={() => {
              setRangeKey('all');
              setListingId('');
              pushUrl({ range: 'all', listingId: '' }, true);
            }}
          >
            Show all time
          </button>
        </div>
      ) : null}

      {detailListingId && detailMeta ? (
        <div className="mx-auto w-full max-w-[1180px] space-y-4">
          <button type="button" className="text-[13px] font-semibold text-[#073b83]" onClick={closeListingDetail}>
            ← Back to {ANALYTICS_SECTIONS.find((s) => s.id === section)?.label ?? 'Analytics'}
          </button>
          <div>
            <h2 className="font-sans text-base font-bold text-[#18181b]">{detailMeta.title}</h2>
            <p className="text-[12px] text-[#71717a]">
              {detailMeta.family === 'stay' ? 'Stay' : detailMeta.family === 'tour' ? 'Tour' : 'Listing'} · {dateRange.label}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {(
              [
                ['Gross sales', detailRows.reduce((s, r) => s + r.gross, 0)],
                ['Net earnings', detailRows.reduce((s, r) => s + r.net, 0)],
                ['Paid bookings', detailPaid.length],
                ['Guests', detailPaid.reduce((s, b) => s + (Number(b.guests) > 0 ? Number(b.guests) : 0), 0)],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="tv-metric-tile">
                <p className="tv-metric-tile__label">{label}</p>
                <p className="tv-metric-tile__value">
                  {typeof value === 'number' && label.includes('bookings') === false && label !== 'Guests'
                    ? formatMoney(value, detailRows[0]?.currency ?? primary?.currency ?? 'EUR')
                    : value}
                </p>
              </div>
            ))}
          </div>
          <div className="tv-analytics-panel">
            <h3 className="tv-analytics-panel__title">Earnings trend</h3>
            <div className="mt-3">
              <AnalyticsLineChart
                points={detailSeries.map((p) => ({ key: p.key, label: p.label, value: p.net }))}
                currency={detailRows[0]?.currency ?? 'EUR'}
                ariaLabel="Listing earnings trend"
              />
            </div>
          </div>
          <div className="tv-analytics-panel">
            <h3 className="tv-analytics-panel__title">Lead time</h3>
            <div className="mt-3">
              <AnalyticsBarChart
                bars={aggregateLeadTimes(detailPaid)
                  .filter((b) => b.count > 0)
                  .map((b) => ({ key: b.bucket, label: b.label, value: b.count }))}
                ariaLabel="Listing lead time"
              />
            </div>
          </div>
        </div>
      ) : null}

      {!detailListingId && hasAnyPaid && (filteredPaid.length > 0 || section === 'score' || section === 'bookings') ? (
        <div className="mx-auto w-full max-w-[1180px] space-y-4">
          {section === 'summary' && primary ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <div className="tv-metric-tile">
                  <p className="tv-metric-tile__label">Net earnings</p>
                  <p className="tv-metric-tile__value">{formatMoney(primary.net, primary.currency)}</p>
                  {primaryPrior ? <Delta current={primary.net} previous={primaryPrior.net} /> : null}
                </div>
                <div className="tv-metric-tile">
                  <p className="tv-metric-tile__label">Paid bookings</p>
                  <p className="tv-metric-tile__value">{primary.bookings}</p>
                  {primaryPrior ? <Delta current={primary.bookings} previous={primaryPrior.bookings} /> : null}
                </div>
                <div className="tv-metric-tile">
                  <p className="tv-metric-tile__label">Guests</p>
                  <p className="tv-metric-tile__value">{primary.guests}</p>
                  {primaryPrior ? <Delta current={primary.guests} previous={primaryPrior.guests} /> : null}
                </div>
                <div className="tv-metric-tile">
                  <p className="tv-metric-tile__label">
                    Average booking <InfoTip text="Average supplier net earnings per paid booking in the selected range and currency." />
                  </p>
                  <p className="tv-metric-tile__value">
                    {formatMoney(primary.bookings > 0 ? primary.net / primary.bookings : 0, primary.currency)}
                  </p>
                </div>
              </div>
              {moneyNow.length > 1 ? (
                <p className="text-[12px] text-[#71717a]">
                  Multiple currencies in this range — amounts are never converted or blended. Showing {primary.currency}.
                </p>
              ) : null}
              <div className="tv-analytics-panel">
                <h2 className="tv-analytics-panel__title">Earnings trend</h2>
                <div className="mt-3">
                  <AnalyticsLineChart
                    points={series.map((p) => ({ key: p.key, label: p.label, value: p.net }))}
                    currency={primary.currency}
                    ariaLabel="Net earnings over time"
                  />
                </div>
              </div>
              <div>
                <h2 className="font-sans text-sm font-bold text-[#18181b]">Top listings</h2>
                <div className="mt-2">
                  <AnalyticsListingTable rows={listingRows} mode="summary" onOpenListing={openListingDetail} />
                </div>
              </div>
              {highlights.length > 0 ? (
                <div>
                  <h2 className="font-sans text-sm font-bold text-[#18181b]">Business highlights</h2>
                  <ul className="tv-analytics-highlights mt-2">
                    {highlights.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}

          {section === 'sales' && primary ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <div className="tv-metric-tile">
                  <p className="tv-metric-tile__label">Gross sales</p>
                  <p className="tv-metric-tile__value">{formatMoney(primary.gross, primary.currency)}</p>
                </div>
                <div className="tv-metric-tile">
                  <p className="tv-metric-tile__label">Traverion commission</p>
                  <p className="tv-metric-tile__value">{formatMoney(primary.commission, primary.currency)}</p>
                </div>
                <div className="tv-metric-tile">
                  <p className="tv-metric-tile__label">Net earnings</p>
                  <p className="tv-metric-tile__value">{formatMoney(primary.net, primary.currency)}</p>
                </div>
                <div className="tv-metric-tile">
                  <p className="tv-metric-tile__label">Average sale</p>
                  <p className="tv-metric-tile__value">
                    {formatMoney(primary.bookings > 0 ? primary.gross / primary.bookings : 0, primary.currency)}
                  </p>
                </div>
              </div>
              <div className="tv-analytics-panel">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="tv-analytics-panel__title">Sales trend</h2>
                  <div className="flex gap-1">
                    {(['net', 'gross', 'commission'] as const).map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={`h-8 rounded-md px-2.5 text-[12px] font-semibold ${salesSeries === key ? 'bg-[#f0f4fa] text-[#073b83]' : 'text-[#52525b]'}`}
                        onClick={() => setSalesSeries(key)}
                      >
                        {key === 'net' ? 'Net' : key === 'gross' ? 'Gross' : 'Commission'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3">
                  <AnalyticsLineChart
                    points={series.map((p) => ({
                      key: p.key,
                      label: p.label,
                      value: salesSeries === 'gross' ? p.gross : salesSeries === 'commission' ? p.commission : p.net,
                    }))}
                    currency={primary.currency}
                    ariaLabel="Sales trend"
                  />
                </div>
              </div>
              <div>
                <h2 className="font-sans text-sm font-bold text-[#18181b]">Sales by listing</h2>
                <div className="mt-2">
                  <AnalyticsListingTable rows={listingRows} mode="sales" onOpenListing={openListingDetail} />
                </div>
              </div>
              <div className="tv-analytics-panel">
                <h2 className="tv-analytics-panel__title">Sales insights</h2>
                <ul className="mt-2 space-y-1.5 text-[13px] text-[#3f3f46]">
                  {listingRows[0] ? (
                    <li>
                      Highest-earning listing: {listingRows[0].title} ({formatMoney(listingRows[0].net, listingRows[0].currency)})
                    </li>
                  ) : null}
                  {series.length > 0 ? (
                    <li>
                      Best period: {[...series].sort((a, b) => b.net - a.net)[0]?.label} (
                      {formatMoney([...series].sort((a, b) => b.net - a.net)[0]?.net ?? 0, primary.currency)})
                    </li>
                  ) : null}
                  {tourStaySplit.tour + tourStaySplit.stay > 0 ? (
                    <li>
                      Distribution — Tours {formatMoney(tourStaySplit.tour, primary.currency)} · Stays{' '}
                      {formatMoney(tourStaySplit.stay, primary.currency)}
                    </li>
                  ) : null}
                </ul>
              </div>
            </>
          ) : null}

          {section === 'bookings' ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <div className="tv-metric-tile">
                  <p className="tv-metric-tile__label">Paid bookings</p>
                  <p className="tv-metric-tile__value">{filteredPaid.length}</p>
                </div>
                <div className="tv-metric-tile">
                  <p className="tv-metric-tile__label">Guests</p>
                  <p className="tv-metric-tile__value">
                    {filteredPaid.reduce((s, b) => s + (Number(b.guests) > 0 ? Number(b.guests) : 0), 0)}
                  </p>
                </div>
                <div className="tv-metric-tile">
                  <p className="tv-metric-tile__label">Cancellation rate</p>
                  <p className="tv-metric-tile__value">
                    {cancelStats.rate == null ? '—' : `${Math.round(cancelStats.rate * 100)}%`}
                  </p>
                </div>
                <div className="tv-metric-tile">
                  <p className="tv-metric-tile__label">Avg. lead time</p>
                  <p className="tv-metric-tile__value">{avgLead == null ? '—' : `${avgLead.toFixed(1)}d`}</p>
                </div>
              </div>
              <div className="tv-analytics-panel">
                <h2 className="tv-analytics-panel__title">Customer journey</h2>
                {!trafficAvailable ? (
                  <p className="mt-2 text-[13px] text-[#71717a]">
                    Tracking data is not yet available for this period. Visitor analytics will appear as listing traffic is collected.
                  </p>
                ) : (
                  <div className="tv-analytics-funnel mt-3">
                    {(
                      [
                        ['Impressions', trafficTotals.impressions, null as number | null],
                        [
                          'Views',
                          trafficTotals.views,
                          trafficTotals.impressions > 0 ? trafficTotals.views / trafficTotals.impressions : null,
                        ],
                        [
                          'Checkout started',
                          trafficTotals.bookStarts,
                          trafficTotals.views > 0 ? trafficTotals.bookStarts / trafficTotals.views : null,
                        ],
                        [
                          'Paid bookings',
                          filteredPaid.length,
                          trafficTotals.bookStarts > 0 ? filteredPaid.length / trafficTotals.bookStarts : null,
                        ],
                      ] as const
                    ).map(([label, value, rate]) => (
                      <div key={label} className="tv-analytics-funnel__step">
                        <span className="text-[11px] font-semibold text-[#71717a]">{label}</span>
                        <strong>{value || (trafficAvailable ? 0 : '—')}</strong>
                        <p className="tv-analytics-funnel__rate">
                          {rate == null ? '—' : `${Math.round(rate * 100)}% from prior step`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="tv-analytics-panel">
                <h2 className="tv-analytics-panel__title">Booking trends</h2>
                <div className="mt-3">
                  <AnalyticsLineChart
                    points={series.map((p) => ({ key: p.key, label: p.label, value: p.bookings }))}
                    currency={primary?.currency ?? 'EUR'}
                    ariaLabel="Booking volume over time"
                    emptyLabel="No bookings in this range"
                  />
                </div>
              </div>
              <div className="tv-analytics-panel">
                <h2 className="tv-analytics-panel__title">Cancellations</h2>
                <p className="mt-2 text-[13px] text-[#3f3f46]">
                  {cancelStats.cancelled} cancelled paid bookings
                  {cancelStats.cancelled > 0
                    ? ` · ${cancelStats.customerCancelled} customer · ${cancelStats.supplierCancelled} supplier/partner`
                    : ''}
                  .
                </p>
              </div>
              <div>
                <h2 className="font-sans text-sm font-bold text-[#18181b]">Listing performance</h2>
                <div className="mt-2">
                  <AnalyticsListingTable rows={listingRows} mode="bookings" onOpenListing={openListingDetail} />
                </div>
              </div>
            </>
          ) : null}

          {section === 'customers' ? (
            <>
              <div className="tv-analytics-panel">
                <h2 className="tv-analytics-panel__title">Customer markets</h2>
                <p className="mt-2 text-[13px] text-[#71717a]">
                  Customer country is not yet captured on bookings in a reliable way. Markets will appear here once country is recorded at checkout.
                </p>
              </div>
              <div className="tv-analytics-panel">
                <h2 className="tv-analytics-panel__title">Booking lead time</h2>
                <p className="mt-1 text-[12px] text-[#71717a]">
                  Time from booking creation to departure (tours) or check-in (stays).
                </p>
                <div className="mt-3">
                  <AnalyticsBarChart
                    bars={leadTimes.filter((b) => b.count > 0).map((b) => ({ key: b.bucket, label: b.label, value: b.count }))}
                    ariaLabel="Lead time distribution"
                    emptyLabel="No lead-time data in this range"
                  />
                </div>
              </div>
              <div className="tv-analytics-panel">
                <h2 className="tv-analytics-panel__title">Group sizes</h2>
                <div className="mt-3">
                  <AnalyticsBarChart
                    bars={partySizes.filter((b) => b.count > 0).map((b) => ({ key: b.bucket, label: b.label, value: b.count }))}
                    ariaLabel="Party size distribution"
                  />
                </div>
              </div>
              <div className="tv-analytics-panel">
                <h2 className="tv-analytics-panel__title">Customer insights</h2>
                <ul className="mt-2 space-y-1.5 text-[13px] text-[#3f3f46]">
                  <li>
                    Average party size:{' '}
                    {filteredPaid.length
                      ? (
                          filteredPaid.reduce((s, b) => s + (Number(b.guests) > 0 ? Number(b.guests) : 0), 0) /
                          filteredPaid.length
                        ).toFixed(1)
                      : '—'}
                  </li>
                  <li>Average lead time: {avgLead == null ? '—' : `${avgLead.toFixed(1)} days`}</li>
                  <li>
                    Same-day bookings:{' '}
                    {filteredPaid.length
                      ? `${Math.round(((leadTimes.find((b) => b.bucket === 'same_day')?.count ?? 0) / filteredPaid.length) * 100)}%`
                      : '—'}
                  </li>
                </ul>
              </div>
            </>
          ) : null}

          {section === 'score' ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <div className="tv-metric-tile">
                  <p className="tv-metric-tile__label">Customer rating</p>
                  <p className="tv-metric-tile__value">
                    {reviewStats ? reviewStats.avg.toFixed(1) : '—'}
                  </p>
                  <p className="mt-1.5 text-[11px] text-[#71717a]">
                    {reviewStats ? `${reviewStats.count} verified review${reviewStats.count === 1 ? '' : 's'}` : 'No reviews yet'}
                  </p>
                </div>
                <div className="tv-metric-tile">
                  <p className="tv-metric-tile__label">Completed bookings</p>
                  <p className="tv-metric-tile__value">{completed}</p>
                </div>
                <div className="tv-metric-tile">
                  <p className="tv-metric-tile__label">Supplier cancellations</p>
                  <p className="tv-metric-tile__value">{cancelStats.supplierCancelled}</p>
                </div>
                <div className="tv-metric-tile">
                  <p className="tv-metric-tile__label">Completion rate</p>
                  <p className="tv-metric-tile__value">
                    {filteredPaid.length
                      ? `${Math.round((completed / filteredPaid.length) * 100)}%`
                      : '—'}
                  </p>
                </div>
              </div>
              <div className="tv-analytics-panel">
                <h2 className="tv-analytics-panel__title">Rating distribution</h2>
                {!reviewStats ? (
                  <p className="mt-2 text-[13px] text-[#71717a]">
                    Customer feedback will appear here once your listings receive reviews.
                  </p>
                ) : (
                  <div className="mt-3">
                    <AnalyticsBarChart
                      bars={[5, 4, 3, 2, 1].map((star) => ({
                        key: String(star),
                        label: `${star} star${star === 1 ? '' : 's'}`,
                        value: reviewStats.dist[star - 1],
                      }))}
                      ariaLabel="Star rating distribution"
                    />
                  </div>
                )}
              </div>
              <div className="tv-analytics-panel">
                <h2 className="tv-analytics-panel__title">Reliability</h2>
                <p className="mt-2 text-[13px] text-[#3f3f46]">
                  Supplier-initiated cancellation rate:{' '}
                  {cancelStats.rate == null && cancelStats.supplierCancelled === 0
                    ? '—'
                    : `${cancelStats.supplierCancelled} of ${cancelStats.cancelled + filteredPaid.length} paid outcomes`}
                  .
                </p>
                <p className="mt-2 text-[12px] text-[#71717a]">
                  Supplier Score uses verified reviews and operational metrics. A composite Traverion score will be added once its formula and fairness rules are formally defined — this page does not invent one.
                </p>
              </div>
              {primaryPrior && cancelStats.supplierCancelled > 0 ? (
                <div className="tv-analytics-panel">
                  <h2 className="tv-analytics-panel__title">Improvement opportunities</h2>
                  <p className="mt-2 text-[13px] text-[#3f3f46]">
                    You have {cancelStats.supplierCancelled} supplier/partner cancellation
                    {cancelStats.supplierCancelled === 1 ? '' : 's'} in this period. Reducing cancellations protects guest trust and review quality.
                  </p>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
