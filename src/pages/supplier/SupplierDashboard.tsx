import { useState, useEffect, useMemo } from 'react';
import { Calendar, CalendarDays, DollarSign, MapPin, ArrowRight, Star, CheckCircle, Circle, X } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchSupplierEarnings } from '../../data/supabase-earnings';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import { aggregateReviewRatings, fetchReviewsForSupplierListings } from '../../data/supabase-reviews';
import { fetchSupplierProfile } from '../../data/supabase-supplier-profile';
import { isSupplierBusinessProfileComplete, isSupplierPayoutConfigured } from '../../lib/supplierOnboarding';
import SupplierPortalNoticePanel from '../../components/supplier/SupplierPortalNoticePanel';

interface SupplierDashboardProps {
  onNavigateToListings?: () => void;
  onNavigateToSettings?: () => void;
  onNavigateToBookings?: () => void;
  /** When false, setup is complete and the banner is hidden. */
  showSupplierSetupBanner?: boolean;
  supplierSetupDoneCount?: number;
  supplierSetupNextLabel?: string;
  onSupplierSetupNext?: () => void;
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

/** Monday-start week containing `d`; returns 7 dates at local midnight. */
function weekDaysMondayStart(d: Date): Date[] {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = copy.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  copy.setDate(copy.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(copy);
    x.setDate(copy.getDate() + i);
    return x;
  });
}

export default function SupplierDashboard({
  onNavigateToListings,
  onNavigateToSettings,
  onNavigateToBookings,
  showSupplierSetupBanner = false,
  supplierSetupDoneCount = 0,
  supplierSetupNextLabel = '',
  onSupplierSetupNext,
}: SupplierDashboardProps) {
  const { user, isSupabase } = useSupplierAuth();
  /** Published / live on Traverion only — drafts excluded (see My listings for all rows). */
  const [publishedListingsCount, setPublishedListingsCount] = useState<number | null>(null);
  const [listingTitlesById, setListingTitlesById] = useState<Record<string, string>>({});
  const [supplierBookings, setSupplierBookings] = useState<BookingRow[]>([]);
  const [earnings, setEarnings] = useState<Awaited<ReturnType<typeof fetchSupplierEarnings>>>([]);
  const [providerRating, setProviderRating] = useState<{ avg: number; count: number }>({ avg: 0, count: 0 });
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchSupplierProfile>> | null>(null);
  const [quickStartDismissed, setQuickStartDismissed] = useState(false);

  const quickStartDismissStorageKey = user?.id ? `supplier_quickstart_done_dismissed_${user.id}` : null;

  useEffect(() => {
    if (!quickStartDismissStorageKey) {
      setQuickStartDismissed(false);
      return;
    }
    setQuickStartDismissed(localStorage.getItem(quickStartDismissStorageKey) === '1');
  }, [quickStartDismissStorageKey]);

  useEffect(() => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setPublishedListingsCount(0);
      setListingTitlesById({});
      setSupplierBookings([]);
      return;
    }
    Promise.all([fetchMyListings(uid), fetchBookingsForSupplier(uid)])
      .then(([listings, bookings]) => {
        setPublishedListingsCount(listings.filter((t) => t.status === 'published').length);
        setListingTitlesById(Object.fromEntries(listings.map((t) => [t.id, t.title])));
        setSupplierBookings(bookings);
      })
      .catch(() => {
        setPublishedListingsCount(0);
        setListingTitlesById({});
        setSupplierBookings([]);
      });
  }, [isSupabase, user?.id]);

  useEffect(() => {
    const uid = user?.id;
    if (isSupabase && uid) {
      fetchSupplierEarnings(uid).then(setEarnings).catch(() => setEarnings([]));
    } else {
      setEarnings([]);
    }
  }, [isSupabase, user?.id]);

  useEffect(() => {
    const uid = user?.id;
    if (isSupabase && uid) {
      fetchReviewsForSupplierListings(uid)
        .then((reviewRows) => {
          const { avg, count } = aggregateReviewRatings(reviewRows.map((r) => r.rating));
          setProviderRating({ avg, count });
        })
        .catch(() => setProviderRating({ avg: 0, count: 0 }));
    } else {
      setProviderRating({ avg: 0, count: 0 });
    }
  }, [isSupabase, user?.id]);

  useEffect(() => {
    const uid = user?.id;
    if (isSupabase && uid) {
      fetchSupplierProfile(uid).then(setProfile);
    } else {
      setProfile(null);
    }
  }, [isSupabase, user?.id]);

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const todayYmd = localYmd(now);
  const weekDays = weekDaysMondayStart(now);

  const bookingsCountThisMonth = useMemo(() => {
    return supplierBookings.filter((b) => {
      if (!b.booking_date) return false;
      const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b.booking_date);
      if (!p) return false;
      return Number(p[1]) === thisYear && Number(p[2]) === thisMonth;
    }).length;
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
      .filter((e) => isPeriodInMonth(e.period_start, e.period_end, thisYear, thisMonth))
      .reduce((sum, e) => sum + Number(e.amount), 0);
  }, [earnings, thisYear, thisMonth]);

  const currency = earnings[0]?.currency ?? 'USD';

  const netEarningsDisplay = `${currency === 'USD' ? '$' : ''}${earningsThisMonth.toFixed(0)}${currency !== 'USD' ? ` ${currency}` : ''}`;

  const stats = [
    { label: 'Bookings this month', value: String(bookingsCountThisMonth), icon: Calendar, color: 'bg-green-500/10 text-green-600' },
    {
      label: 'Review rating',
      value: `${providerRating.avg.toFixed(1)} (${providerRating.count} ${providerRating.count === 1 ? 'review' : 'reviews'})`,
      icon: Star,
      color: 'bg-amber-500/10 text-amber-600',
    },
    { label: 'Active listings', value: publishedListingsCount !== null ? String(publishedListingsCount) : '—', icon: MapPin, color: 'bg-finland/10 text-finland' },
    { label: 'Net earnings this month', value: netEarningsDisplay, icon: DollarSign, color: 'bg-finland/10 text-finland' },
  ];

  const healthChecks = useMemo(() => {
    const hasPublishedListing = (publishedListingsCount ?? 0) > 0;
    const hasPayoutMethod = isSupplierPayoutConfigured(profile);
    const payoutVerifiedByTraverion =
      (profile?.payout_verification_status ?? '').trim().toLowerCase() === 'verified';
    const hasCompanyProfile = isSupplierBusinessProfileComplete(profile);
    const verificationStatus = (profile?.verification_status ?? '').trim().toLowerCase();
    const businessVerifiedByTraverion = verificationStatus === 'verified';
    const verificationInReview =
      hasCompanyProfile && !businessVerifiedByTraverion && verificationStatus !== 'rejected';
    const hasBookingsThisMonth = bookingsCountThisMonth > 0;
    const hasReviews = providerRating.count > 0;

    const checks = [
      {
        id: 'listing',
        title: 'First listing published',
        done: hasPublishedListing,
        descriptionDone: 'Your products are live in the marketplace.',
        descriptionTodo: 'Add your first listing so travelers can discover your tours.',
        cta: 'Go to listings',
        onClick: onNavigateToListings,
      },
      {
        id: 'payout',
        title: 'Payout verified by Traverion',
        done: hasPayoutMethod && payoutVerifiedByTraverion,
        descriptionDone: 'IBAN/BIC approved for payouts.',
        descriptionTodo:
          hasPayoutMethod && !payoutVerifiedByTraverion
            ? 'Your bank details are saved and under review (or were rejected—update and save again in Settings).'
            : 'Enter IBAN and BIC under Payment & payouts in Settings and save to submit for verification.',
        cta: 'Open settings',
        onClick: onNavigateToSettings,
      },
      {
        id: 'company',
        title: 'Business verified by Traverion',
        done: businessVerifiedByTraverion,
        descriptionDone: 'Your business information is approved (separate from payout verification).',
        descriptionTodo:
          verificationStatus === 'rejected'
            ? 'Verification was not approved—update your business profile and documents in Settings.'
            : verificationInReview
              ? 'Your profile is submitted and under review by Traverion.'
              : 'Complete your business profile and documents in Settings, then wait for manual approval.',
        cta: 'Open settings',
        onClick: onNavigateToSettings,
      },
      {
        id: 'bookings',
        title: 'Bookings this month',
        done: hasBookingsThisMonth,
        descriptionDone: `${bookingsCountThisMonth} booking${bookingsCountThisMonth === 1 ? '' : 's'} this calendar month.`,
        descriptionTodo: 'No bookings this month yet. Refresh title/photos and add availability to improve conversion.',
      },
      {
        id: 'reviews',
        title: 'Review momentum',
        done: hasReviews,
        descriptionDone: `${providerRating.count} review${providerRating.count === 1 ? '' : 's'} with ${providerRating.avg.toFixed(1)} average rating.`,
        descriptionTodo: 'No reviews yet. Ask recent guests for feedback after completed tours.',
      },
    ];

    return { checks };
  }, [
    publishedListingsCount,
    profile,
    bookingsCountThisMonth,
    providerRating.count,
    providerRating.avg,
    onNavigateToListings,
    onNavigateToSettings,
  ]);

  const quickStart = useMemo(() => {
    const setupChecks = healthChecks.checks.slice(0, 3);
    const next = setupChecks.find((c) => !c.done) ?? null;
    return {
      checks: setupChecks,
      doneCount: setupChecks.filter((c) => c.done).length,
      total: setupChecks.length,
      next,
    };
  }, [healthChecks.checks]);

  const allQuickStartDone = quickStart.doneCount === quickStart.total;
  const showQuickStartCard =
    Boolean(isSupabase && user) && (!allQuickStartDone || !quickStartDismissed);

  const dismissQuickStartCard = () => {
    if (!quickStartDismissStorageKey) return;
    localStorage.setItem(quickStartDismissStorageKey, '1');
    setQuickStartDismissed(true);
  };

  return (
    <div className="space-y-5 sm:space-y-6 w-full min-w-0">
      {showSupplierSetupBanner && onSupplierSetupNext && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 sm:p-5 shadow-md ring-1 ring-amber-900/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Finish supplier setup ({supplierSetupDoneCount}/3)
            </p>
            <p className="text-xs text-amber-950 mt-0.5">
              Listing live, payout details saved, and business profile completed in Settings.
            </p>
          </div>
          <button
            type="button"
            onClick={onSupplierSetupNext}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg border-2 border-finland bg-finland text-white text-sm font-semibold shadow-sm hover:bg-finland-dark shrink-0"
          >
            {supplierSetupNextLabel}
          </button>
        </div>
      )}

      <div className="flex items-start gap-3 sm:gap-4">
        {profile?.business_logo_url ? (
          <img
            src={profile.business_logo_url}
            alt={
              profile.company_legal_name?.trim() ||
              profile.display_name?.trim() ||
              'Your business logo'
            }
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover border border-gray-200 bg-white shadow-sm flex-shrink-0"
          />
        ) : null}
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-semibold tracking-tight text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-600 mt-0.5 sm:mt-1">Key metrics and today&apos;s schedule</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 min-w-0 shadow-sm"
          >
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
              <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-500 leading-snug">{label}</p>
              <p className="text-lg sm:text-xl font-semibold text-gray-900 tabular-nums truncate">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {showQuickStartCard && (
        <div className="rounded-xl border-2 border-slate-200 bg-white p-5 sm:p-6 shadow-md ring-1 ring-slate-900/5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Quick start</h2>
              <p className="text-sm text-gray-700 mt-0.5">Complete these essentials first, then run day-to-day from bookings.</p>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              {allQuickStartDone && (
                <button
                  type="button"
                  onClick={dismissQuickStartCard}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-gray-600 hover:bg-slate-50 hover:text-gray-900 shadow-sm"
                  aria-label="Hide quick start checklist"
                  title="Hide checklist"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-finland/25 bg-finland/15 text-finland text-sm font-semibold shadow-sm">
                {quickStart.doneCount}/{quickStart.total} completed
              </div>
            </div>
          </div>

          <ul className="space-y-3">
            {quickStart.checks.map((check) => (
              <li
                key={check.id}
                className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-xl border-2 px-4 py-3 shadow-sm ${
                  check.done
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-amber-300 bg-amber-50'
                }`}
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  {check.done ? (
                    <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5 sm:mt-0" strokeWidth={2.25} />
                  ) : (
                    <Circle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5 sm:mt-0" strokeWidth={2} />
                  )}
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${check.done ? 'text-emerald-900' : 'text-amber-950'}`}>{check.title}</p>
                    <p className={`text-xs mt-0.5 ${check.done ? 'text-emerald-800' : 'text-amber-900/90'}`}>
                      {check.done ? check.descriptionDone : check.descriptionTodo}
                    </p>
                  </div>
                </div>
                {!check.done && check.onClick && (
                  <button
                    type="button"
                    onClick={check.onClick}
                    className="sm:ml-auto inline-flex items-center justify-center gap-1 rounded-lg border-2 border-finland bg-finland px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-finland-dark transition-colors"
                  >
                    {check.cta}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {quickStart.next && quickStart.next.onClick && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={quickStart.next.onClick}
                className="inline-flex items-center gap-1 text-sm font-semibold text-finland hover:text-finland-dark hover:underline"
              >
                Continue setup: {quickStart.next.title}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {isSupabase && user && <SupplierPortalNoticePanel userId={user.id} />}

      {isSupabase && user && (
        <div className="rounded-xl border-2 border-slate-200 bg-white p-5 sm:p-6 shadow-md ring-1 ring-slate-900/5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-finland/10 text-finland flex items-center justify-center flex-shrink-0">
                <CalendarDays className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Today</h2>
                <p className="text-sm text-gray-600 mt-0.5">
                  {now.toLocaleDateString(undefined, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {todayTotalBookings === 0
                    ? 'No bookings on your calendar for today.'
                    : `${todayTotalBookings} booking${todayTotalBookings === 1 ? '' : 's'} today${todayScheduleRows.length > 0 ? ` across ${todayScheduleRows.length} listing${todayScheduleRows.length === 1 ? '' : 's'}` : ''}.`}
                </p>
              </div>
            </div>
            {onNavigateToBookings && (
              <button
                type="button"
                onClick={onNavigateToBookings}
                className="inline-flex items-center gap-1 text-sm font-semibold text-finland hover:text-finland-dark hover:underline shrink-0"
              >
                Open bookings
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex gap-1 sm:gap-2 justify-between mb-5 pb-5 border-b border-slate-200 overflow-x-auto">
            {weekDays.map((d) => {
              const ymd = localYmd(d);
              const isToday = ymd === todayYmd;
              return (
                <div
                  key={ymd}
                  className={`flex flex-col items-center min-w-[2.75rem] sm:min-w-[3.25rem] rounded-lg px-1 py-2 text-center ${
                    isToday ? 'bg-finland text-white shadow-md ring-2 ring-finland/30' : 'bg-slate-50 text-gray-600'
                  }`}
                >
                  <span className={`text-[10px] sm:text-xs font-medium uppercase ${isToday ? 'text-white/90' : 'text-gray-500'}`}>
                    {d.toLocaleDateString(undefined, { weekday: 'short' })}
                  </span>
                  <span className={`text-base sm:text-lg font-bold tabular-nums ${isToday ? '' : 'text-gray-900'}`}>
                    {d.getDate()}
                  </span>
                </div>
              );
            })}
          </div>

          {todayScheduleRows.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              No listings with bookings today. When travelers book for this date, they will appear here with counts.
            </p>
          ) : (
            <ul className="space-y-2">
              {todayScheduleRows.map((row) => (
                <li
                  key={row.listingId}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border-2 border-slate-200 bg-slate-50/80 px-4 py-3"
                >
                  <p className="text-sm font-semibold text-gray-900 min-w-0">{row.title}</p>
                  <div className="flex items-center gap-3 shrink-0 text-sm">
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
          )}
        </div>
      )}
    </div>
  );
}
