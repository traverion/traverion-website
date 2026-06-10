import { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, CalendarDays, DollarSign, MapPin, ArrowRight, Star, AlertCircle, RefreshCw, LayoutDashboard } from 'lucide-react';
import {
  SUPPLIER_PAGE_CLASS,
  SUPPLIER_SECTION_HEADER_CLASS,
  SUPPLIER_STAT_GRID_CLASS,
  SupplierStatSkeletonGrid,
} from '../../components/supplier/supplierUi';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchSupplierEarnings } from '../../data/supabase-earnings';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import { aggregateReviewRatings, fetchReviewsForSupplierListings } from '../../data/supabase-reviews';
import { fetchSupplierProfile } from '../../data/supabase-supplier-profile';
import SupplierPortalNoticePanel from '../../components/supplier/SupplierPortalNoticePanel';

interface SupplierDashboardProps {
  onNavigateToBookings?: () => void;
}

function isPeriodInMonth(periodStart: string, periodEnd: string, year: number, month: number): boolean {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  return start <= last && end >= first;
}

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** `created_at` ISO falls in this local calendar month. */
function createdInLocalCalendarMonth(iso: string, year: number, month: number): boolean {
  const d = new Date(iso);
  return d.getFullYear() === year && d.getMonth() + 1 === month;
}

/** Activity date (YYYY-MM-DD) falls in this calendar month. */
function activityDateInCalendarMonth(bookingDateYmd: string | null, year: number, month: number): boolean {
  if (!bookingDateYmd) return false;
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bookingDateYmd);
  if (!p) return false;
  return Number(p[1]) === year && Number(p[2]) === month;
}

function isNonCancelledBooking(status: string): boolean {
  return status !== 'cancelled';
}

export default function SupplierDashboard({ onNavigateToBookings }: SupplierDashboardProps) {
  const { user, isSupabase } = useSupplierAuth();
  /** Published / live on Traverion only — drafts excluded (see My listings for all rows). */
  const [publishedListingsCount, setPublishedListingsCount] = useState<number | null>(null);
  const [listingTitlesById, setListingTitlesById] = useState<Record<string, string>>({});
  const [supplierBookings, setSupplierBookings] = useState<BookingRow[]>([]);
  const [earnings, setEarnings] = useState<Awaited<ReturnType<typeof fetchSupplierEarnings>>>([]);
  const [providerRating, setProviderRating] = useState<{ avg: number; count: number }>({ avg: 0, count: 0 });
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchSupplierProfile>> | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const reloadDashboard = useCallback(async () => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setPublishedListingsCount(0);
      setListingTitlesById({});
      setSupplierBookings([]);
      setEarnings([]);
      setProviderRating({ avg: 0, count: 0 });
      setProfile(null);
      setDashboardError(null);
      setDashboardLoading(false);
      return;
    }
    setDashboardLoading(true);
    setDashboardError(null);
    const settled = await Promise.allSettled([
      fetchMyListings(uid),
      fetchBookingsForSupplier(uid),
      fetchSupplierEarnings(uid),
      fetchReviewsForSupplierListings(uid),
      fetchSupplierProfile(uid),
    ]);
    const failures: string[] = [];
    const failureDetails: string[] = [];
    const noteFailure = (key: string, reason: unknown) => {
      failures.push(key);
      const msg = reason instanceof Error ? reason.message : String(reason);
      failureDetails.push(`${key}: ${msg}`);
    };
    if (settled[0].status === 'fulfilled') {
      const listings = settled[0].value;
      setPublishedListingsCount(listings.filter((t) => t.status === 'published').length);
      setListingTitlesById(Object.fromEntries(listings.map((t) => [t.id, t.title])));
    } else {
      noteFailure('listings', settled[0].reason);
      setPublishedListingsCount(0);
      setListingTitlesById({});
    }
    if (settled[1].status === 'fulfilled') {
      setSupplierBookings(settled[1].value);
    } else {
      noteFailure('bookings', settled[1].reason);
      setSupplierBookings([]);
    }
    if (settled[2].status === 'fulfilled') {
      setEarnings(settled[2].value);
    } else {
      noteFailure('earnings', settled[2].reason);
      setEarnings([]);
    }
    if (settled[3].status === 'fulfilled') {
      const reviewRows = settled[3].value;
      setProviderRating(aggregateReviewRatings(reviewRows.map((r) => r.rating)));
    } else {
      noteFailure('reviews', settled[3].reason);
      setProviderRating({ avg: 0, count: 0 });
    }
    if (settled[4].status === 'fulfilled') {
      setProfile(settled[4].value);
    } else {
      noteFailure('profile', settled[4].reason);
      setProfile(null);
    }
    if (failures.length > 0) {
      const critical = failures.includes('bookings') || failures.includes('earnings');
      const detail =
        failureDetails.length > 0
          ? ` Details: ${failureDetails.slice(0, 2).join(' · ')}${failureDetails.length > 2 ? ' …' : ''}`
          : '';
      setDashboardError(
        critical
          ? `Bookings or earnings could not be loaded. Check your connection and try again.${detail}`
          : `Some profile or review data could not be refreshed.${detail}`
      );
    }
    setDashboardLoading(false);
  }, [isSupabase, user?.id]);

  useEffect(() => {
    void reloadDashboard();
  }, [reloadDashboard]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void reloadDashboard();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reloadDashboard]);

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const todayYmd = localYmd(now);
  const newBookingsThisMonth = useMemo(() => {
    return supplierBookings.filter(
      (b) => isNonCancelledBooking(b.status) && createdInLocalCalendarMonth(b.created_at, thisYear, thisMonth)
    ).length;
  }, [supplierBookings, thisYear, thisMonth]);

  const departuresScheduledThisMonth = useMemo(() => {
    return supplierBookings.filter(
      (b) =>
        isNonCancelledBooking(b.status) &&
        activityDateInCalendarMonth(b.booking_date, thisYear, thisMonth)
    ).length;
  }, [supplierBookings, thisYear, thisMonth]);

  const grossCollectedNewBookingsThisMonth = useMemo(() => {
    const rows = supplierBookings.filter(
      (b) =>
        isNonCancelledBooking(b.status) &&
        createdInLocalCalendarMonth(b.created_at, thisYear, thisMonth) &&
        b.amount_paid != null &&
        Number.isFinite(Number(b.amount_paid)) &&
        Number(b.amount_paid) > 0
    );
    if (rows.length === 0) return { sum: 0, currency: null as string | null, mixedCurrency: false };
    const byCur = new Map<string, number>();
    for (const b of rows) {
      const c = (b.currency ?? 'USD').trim() || 'USD';
      byCur.set(c, (byCur.get(c) ?? 0) + Number(b.amount_paid));
    }
    if (byCur.size > 1) {
      return { sum: 0, currency: null, mixedCurrency: true };
    }
    const [currency, sum] = [...byCur.entries()][0];
    return { sum, currency, mixedCurrency: false };
  }, [supplierBookings, thisYear, thisMonth]);

  const todayScheduleRows = useMemo(() => {
    const active = supplierBookings.filter(
      (b) => b.booking_date === todayYmd && b.status !== 'cancelled'
    );
    const byListing = new Map<string, { bookings: number; guests: number }>();
    for (const b of active) {
      const cur = byListing.get(b.listing_id) ?? { bookings: 0, guests: 0 };
      cur.bookings += 1;
      cur.guests += Math.max(1, Number(b.guests) || 1);
      byListing.set(b.listing_id, cur);
    }
    return [...byListing.entries()]
      .map(([listingId, agg]) => ({
        listingId,
        title: listingTitlesById[listingId] ?? 'Listing',
        ...agg,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [supplierBookings, listingTitlesById, todayYmd]);

  const todayTotalBookings = useMemo(
    () => todayScheduleRows.reduce((s, r) => s + r.bookings, 0),
    [todayScheduleRows]
  );

  const earningsThisMonth = useMemo(() => {
    return earnings
      .filter(
        (e) =>
          e.status !== 'cancelled' &&
          isPeriodInMonth(e.period_start, e.period_end, thisYear, thisMonth)
      )
      .reduce((sum, e) => sum + Number(e.amount), 0);
  }, [earnings, thisYear, thisMonth]);

  const currency = useMemo(() => {
    const row = earnings.find((e) => e.status !== 'cancelled');
    return row?.currency ?? earnings[0]?.currency ?? 'USD';
  }, [earnings]);

  const netEarningsDisplay = `${currency === 'USD' ? '$' : ''}${earningsThisMonth.toFixed(0)}${currency !== 'USD' ? ` ${currency}` : ''}`;

  const bookingsStatCaption =
    departuresScheduledThisMonth > 0
      ? `${departuresScheduledThisMonth} trip date${departuresScheduledThisMonth === 1 ? '' : 's'} this calendar month`
      : undefined;

  const earningsStatCaption = (() => {
    if (grossCollectedNewBookingsThisMonth.mixedCurrency) {
      return 'New bookings this month use multiple currencies—see Bookings for amounts.';
    }
    if (grossCollectedNewBookingsThisMonth.sum > 0 && grossCollectedNewBookingsThisMonth.currency) {
      const c = grossCollectedNewBookingsThisMonth.currency;
      const sym = c === 'USD' ? '$' : '';
      const tail = c === 'USD' ? '' : ` ${c}`;
      return `${sym}${grossCollectedNewBookingsThisMonth.sum.toFixed(0)}${tail} on Stripe (new orders). Net above is payout accrual.`;
    }
    return earningsThisMonth > 0 ? 'Accrued payouts for this month.' : undefined;
  })();

  const reviewStatValue =
    providerRating.count > 0
      ? `${providerRating.avg.toFixed(1)} (${providerRating.count} ${providerRating.count === 1 ? 'review' : 'reviews'})`
      : 'No reviews yet';

  const stats: {
    label: string;
    value: string;
    icon: typeof Calendar;
    color: string;
    caption?: string;
  }[] = [
    {
      label: 'Bookings this month',
      value: String(newBookingsThisMonth),
      caption: bookingsStatCaption,
      icon: Calendar,
      color: 'bg-green-500/10 text-green-600',
    },
    {
      label: 'Review rating',
      value: reviewStatValue,
      icon: Star,
      color: 'bg-amber-500/10 text-amber-600',
    },
    { label: 'Active listings', value: publishedListingsCount !== null ? String(publishedListingsCount) : '—', icon: MapPin, color: 'bg-finland/10 text-finland' },
    {
      label: 'Net earnings this month',
      value: netEarningsDisplay,
      caption: earningsStatCaption,
      icon: DollarSign,
      color: 'bg-finland/10 text-finland',
    },
  ];

  const businessLabel =
    profile?.company_legal_name?.trim() || profile?.display_name?.trim() || null;

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <div className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4 min-w-0">
            {profile?.business_logo_url ? (
              <img
                src={profile.business_logo_url}
                alt={
                  profile.company_legal_name?.trim() ||
                  profile.display_name?.trim() ||
                  'Your business logo'
                }
                className="w-12 h-12 rounded-2xl object-cover border border-gray-200 bg-white shadow-sm flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-finland/10 flex items-center justify-center flex-shrink-0">
                <LayoutDashboard className="w-6 h-6 text-finland" aria-hidden />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
                {businessLabel ? businessLabel : 'Dashboard'}
              </h1>
              <p className="mt-1 text-sm text-gray-600 leading-relaxed">
                {businessLabel ? 'Your supplier overview' : "Key metrics and today's schedule at a glance."}
              </p>
            </div>
          </div>
          {isSupabase && user && (
            <button
              type="button"
              onClick={() => void reloadDashboard()}
              disabled={dashboardLoading}
              className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 shrink-0 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${dashboardLoading ? 'animate-spin' : ''}`} aria-hidden />
              Refresh data
            </button>
          )}
        </div>
      </div>

      {dashboardError && isSupabase && user && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <span className="flex items-start gap-2 min-w-0">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
            <span>{dashboardError}</span>
          </span>
          <button
            type="button"
            onClick={() => void reloadDashboard()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100/80 shrink-0"
          >
            <RefreshCw className="w-4 h-4" aria-hidden />
            Retry
          </button>
        </div>
      )}

      {dashboardLoading && publishedListingsCount === null ? (
        <SupplierStatSkeletonGrid count={4} />
      ) : (
        <div className={SUPPLIER_STAT_GRID_CLASS}>
          {stats.map(({ label, value, icon: Icon, color, caption }) => (
            <div
              key={label}
              className="flex min-h-[5.5rem] w-full min-w-0 items-center gap-3 sm:gap-4 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm transition-all duration-200 hover:shadow-md sm:min-h-[6.25rem]"
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12 ${color}`}>
                <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium leading-snug text-gray-500 sm:text-sm">{label}</p>
                <p className="mt-0.5 text-lg font-semibold leading-tight text-gray-900 tabular-nums sm:text-xl">{value}</p>
                {caption ? (
                  <p className="mt-1 text-[11px] leading-snug text-gray-500 sm:text-xs">{caption}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {isSupabase && user && <SupplierPortalNoticePanel userId={user.id} />}

      {isSupabase && user && (
        <div className="w-full min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className={`${SUPPLIER_SECTION_HEADER_CLASS} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-finland/10 text-finland">
                <CalendarDays className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900">Today</h2>
                <p className="mt-0.5 text-sm text-gray-600">
                  {now.toLocaleDateString(undefined, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
            {onNavigateToBookings && (
              <button
                type="button"
                onClick={onNavigateToBookings}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-xl border border-finland/20 bg-finland/5 px-4 py-2 text-sm font-semibold text-finland transition-colors hover:bg-finland/10 sm:self-center"
              >
                Open bookings
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {todayScheduleRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center border-t border-gray-100 bg-slate-50/50 px-5 py-10 text-center sm:px-6">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-200/80">
                <CalendarDays className="h-6 w-6 text-gray-300" aria-hidden />
              </div>
              <p className="text-sm font-medium text-gray-700">Nothing scheduled for today</p>
              <p className="mt-1 max-w-md text-sm text-gray-500">
                Trip-date bookings will show here grouped by listing.
              </p>
            </div>
          ) : (
            <>
              <p className="border-b border-gray-100 px-5 py-2.5 text-xs text-gray-500 sm:px-6">
                {todayTotalBookings} booking{todayTotalBookings === 1 ? '' : 's'} across{' '}
                {todayScheduleRows.length} listing{todayScheduleRows.length === 1 ? '' : 's'}
              </p>
              <ul className="divide-y divide-gray-100">
                {todayScheduleRows.map((row) => (
                  <li
                    key={row.listingId}
                    className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                  >
                    <p className="min-w-0 text-sm font-semibold text-gray-900">{row.title}</p>
                    <div className="flex shrink-0 items-center gap-4 text-sm">
                      <span className="tabular-nums font-semibold text-finland">
                        {row.bookings} booking{row.bookings === 1 ? '' : 's'}
                      </span>
                      <span className="text-gray-500">
                        {row.guests} guest{row.guests === 1 ? '' : 's'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
