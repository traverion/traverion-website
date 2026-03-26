import { useState, useEffect, useMemo } from 'react';
import { BarChart3, Calendar, DollarSign, MapPin, Plus, ArrowRight, Star, CheckCircle, Circle, ListChecks, Activity } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchSupplierEarnings } from '../../data/supabase-earnings';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import { fetchReviewsForSupplierListings } from '../../data/supabase-reviews';
import { fetchSupplierProfile } from '../../data/supabase-supplier-profile';
import { fetchSupplierBookingEvents, fetchSupplierBookingMessages } from '../../data/supabase-booking-events';

interface SupplierDashboardProps {
  onNavigateToListings?: () => void;
  onNavigateToSettings?: () => void;
}

function isPeriodInMonth(periodStart: string, periodEnd: string, year: number, month: number): boolean {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  return start <= last && end >= first;
}

export default function SupplierDashboard({ onNavigateToListings, onNavigateToSettings }: SupplierDashboardProps) {
  const { user, isSupabase } = useSupplierAuth();
  const [listingsCount, setListingsCount] = useState<number | null>(null);
  const [earnings, setEarnings] = useState<Awaited<ReturnType<typeof fetchSupplierEarnings>>>([]);
  const [bookingsCountThisMonth, setBookingsCountThisMonth] = useState<number | null>(null);
  const [providerRating, setProviderRating] = useState<{ avg: number; count: number } | null>(null);
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchSupplierProfile>> | null>(null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof fetchReviewsForSupplierListings>>>([]);
  const [activityItems, setActivityItems] = useState<Array<{ at: string; title: string; details?: string }>>([]);

  useEffect(() => {
    if (isSupabase && user) {
      fetchMyListings(user.id).then((list) => setListingsCount(list.length)).catch(() => setListingsCount(0));
    } else {
      setListingsCount(0);
    }
  }, [isSupabase, user]);

  useEffect(() => {
    if (isSupabase && user) {
      fetchSupplierEarnings(user.id).then(setEarnings).catch(() => setEarnings([]));
    } else {
      setEarnings([]);
    }
  }, [isSupabase, user]);

  useEffect(() => {
    if (isSupabase && user) {
      fetchBookingsForSupplier(user.id)
        .then((bookings) => {
          setBookings(bookings);
          const now = new Date();
          const y = now.getFullYear();
          const m = now.getMonth() + 1;
          const count = bookings.filter((b) => {
            if (!b.booking_date) return false;
            const d = new Date(b.booking_date);
            return d.getFullYear() === y && d.getMonth() + 1 === m;
          }).length;
          setBookingsCountThisMonth(count);
        })
        .catch(() => setBookingsCountThisMonth(0));
    } else {
      setBookingsCountThisMonth(0);
    }
  }, [isSupabase, user]);

  useEffect(() => {
    if (isSupabase && user) {
      fetchReviewsForSupplierListings(user.id)
        .then((reviews) => {
          setReviews(reviews);
          if (reviews.length === 0) {
            setProviderRating(null);
            return;
          }
          const sum = reviews.reduce((a, r) => a + r.rating, 0);
          setProviderRating({
            avg: Math.round((sum / reviews.length) * 10) / 10,
            count: reviews.length,
          });
        })
        .catch(() => setProviderRating(null));
    } else {
      setProviderRating(null);
      setReviews([]);
    }
  }, [isSupabase, user]);

  useEffect(() => {
    if (isSupabase && user) {
      fetchSupplierProfile(user.id).then(setProfile);
    } else {
      setProfile(null);
    }
  }, [isSupabase, user]);

  useEffect(() => {
    const loadActivity = async () => {
      if (!isSupabase || !user) {
        setActivityItems([]);
        return;
      }
      const bookingIds = bookings.map((b) => b.id);
      const [events, messages] = await Promise.all([
        fetchSupplierBookingEvents(user.id, bookingIds),
        fetchSupplierBookingMessages(user.id),
      ]);
      const eventItems = events.map((e) => ({
        at: e.created_at,
        title:
          e.event_type === 'acknowledged'
            ? 'Booking acknowledged'
            : e.event_type === 'status_confirmed'
              ? 'Booking confirmed'
              : e.event_type === 'status_cancelled'
                ? 'Booking cancelled'
                : e.event_type === 'note'
                  ? 'Ops note updated'
                  : 'Booking event',
        details: e.details ?? undefined,
      }));
      const messageItems = messages.map((m) => ({
        at: m.created_at,
        title: `Message ${m.delivery_status ?? 'queued'}: ${m.subject}`,
        details: `${m.recipients.length} recipient${m.recipients.length === 1 ? '' : 's'}`,
      }));
      setActivityItems(
        [...eventItems, ...messageItems]
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 12)
      );
    };
    loadActivity();
  }, [isSupabase, user, bookings]);

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;

  const earningsThisMonth = useMemo(() => {
    return earnings
      .filter((e) => isPeriodInMonth(e.period_start, e.period_end, thisYear, thisMonth))
      .reduce((sum, e) => sum + Number(e.amount), 0);
  }, [earnings, thisYear, thisMonth]);

  const earningsPending = useMemo(() => {
    return earnings
      .filter((e) => e.status === 'pending')
      .reduce((sum, e) => sum + Number(e.amount), 0);
  }, [earnings]);

  const currency = earnings[0]?.currency ?? 'USD';

  const stats = [
    { label: 'Active listings', value: listingsCount !== null ? String(listingsCount) : '—', icon: MapPin, color: 'bg-finland/10 text-finland' },
    { label: 'Bookings this month', value: bookingsCountThisMonth !== null ? String(bookingsCountThisMonth) : '—', icon: Calendar, color: 'bg-green-500/10 text-green-600' },
    { label: 'Provider rating', value: providerRating ? `${providerRating.avg} (${providerRating.count} reviews)` : '—', icon: Star, color: 'bg-amber-500/10 text-amber-600' },
    { label: 'Earnings this month', value: `${currency === 'USD' ? '$' : ''}${earningsThisMonth.toFixed(0)}${currency !== 'USD' ? ` ${currency}` : ''}`, icon: DollarSign, color: 'bg-finland/10 text-finland' },
    { label: 'Earnings (pending)', value: `${currency === 'USD' ? '$' : ''}${earningsPending.toFixed(0)}${currency !== 'USD' ? ` ${currency}` : ''}`, icon: DollarSign, color: 'bg-amber-500/10 text-amber-600' },
  ];

  const healthChecks = useMemo(() => {
    const hasListings = (listingsCount ?? 0) > 0;
    const hasPayoutMethod = !!profile?.payout_method && profile.payout_method !== 'none';
    const hasCompanyProfile = !!profile?.company_legal_name?.trim();
    const hasBookingsThisMonth = (bookingsCountThisMonth ?? 0) > 0;
    const hasReviews = (providerRating?.count ?? 0) > 0;

    const checks = [
      {
        id: 'listing',
        title: 'First listing published',
        done: hasListings,
        descriptionDone: 'Your products are live in the marketplace.',
        descriptionTodo: 'Add your first listing so travelers can discover your tours.',
        cta: 'Go to listings',
        onClick: onNavigateToListings,
      },
      {
        id: 'payout',
        title: 'Payout method configured',
        done: hasPayoutMethod,
        descriptionDone: 'Payout destination is configured.',
        descriptionTodo: 'Set up bank transfer or PayPal for faster payout processing.',
        cta: 'Open settings',
        onClick: onNavigateToSettings,
      },
      {
        id: 'company',
        title: 'Company profile completed',
        done: hasCompanyProfile,
        descriptionDone: 'Business details are on file.',
        descriptionTodo: 'Add legal company details to improve trust and verification readiness.',
        cta: 'Open settings',
        onClick: onNavigateToSettings,
      },
      {
        id: 'bookings',
        title: 'Bookings this month',
        done: hasBookingsThisMonth,
        descriptionDone: `${bookingsCountThisMonth} booking${bookingsCountThisMonth === 1 ? '' : 's'} this month.`,
        descriptionTodo: 'No bookings this month yet. Refresh title/photos and add availability to improve conversion.',
      },
      {
        id: 'reviews',
        title: 'Review momentum',
        done: hasReviews,
        descriptionDone: `${providerRating?.count ?? 0} review${providerRating?.count === 1 ? '' : 's'} with ${providerRating?.avg.toFixed(1)} average rating.`,
        descriptionTodo: 'No reviews yet. Ask recent guests for feedback after completed tours.',
      },
    ];

    const setupChecks = checks.slice(0, 3);
    const setupScore = Math.round((setupChecks.filter((c) => c.done).length / setupChecks.length) * 100);

    return { checks, setupScore };
  }, [
    listingsCount,
    profile?.payout_method,
    profile?.company_legal_name,
    bookingsCountThisMonth,
    providerRating?.count,
    providerRating?.avg,
    onNavigateToListings,
    onNavigateToSettings,
  ]);

  const needsAction = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const unacknowledged = bookings.filter((b) => !b.acknowledged_at && b.status !== 'cancelled');
    const pending = bookings.filter((b) => b.status === 'pending');
    const todayBookings = bookings.filter((b) => b.booking_date === today && b.status !== 'cancelled');
    const lowRatingUnreplied = reviews.filter((r) => r.rating <= 3).length;
    return {
      unacknowledged,
      pending,
      todayBookings,
      lowRatingUnreplied,
    };
  }, [bookings, reviews]);

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Overview of your tours and activities</p>
      </div>

      {isSupabase && user && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Quick start</h2>
              <p className="text-sm text-gray-600">Complete these essentials first, then run day-to-day from bookings.</p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-finland/10 text-finland text-sm font-semibold">
              {quickStart.doneCount}/{quickStart.total} completed
            </div>
          </div>

          <ul className="space-y-2">
            {quickStart.checks.map((check) => (
              <li
                key={check.id}
                className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-lg border px-3 py-2.5 ${
                  check.done ? 'border-green-100 bg-green-50/40' : 'border-amber-100 bg-amber-50/40'
                }`}
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  {check.done ? (
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5 sm:mt-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5 sm:mt-0" />
                  )}
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${check.done ? 'text-gray-700' : 'text-gray-900'}`}>{check.title}</p>
                    <p className="text-xs text-gray-500">{check.done ? check.descriptionDone : check.descriptionTodo}</p>
                  </div>
                </div>
                {!check.done && check.onClick && (
                  <button
                    type="button"
                    onClick={check.onClick}
                    className="sm:ml-auto inline-flex items-center gap-1 text-sm font-medium text-finland hover:underline"
                  >
                    {check.cta}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {quickStart.next && quickStart.next.onClick && (
            <div className="mt-3">
              <button
                type="button"
                onClick={quickStart.next.onClick}
                className="inline-flex items-center gap-1 text-sm font-medium text-finland hover:underline"
              >
                Continue setup: {quickStart.next.title}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4"
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{label}</p>
              <p className="text-xl font-semibold text-gray-900">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {isSupabase && user && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <ListChecks className="w-5 h-5 text-finland" />
              <h2 className="text-base font-semibold text-gray-900">Needs action</h2>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                <span className="text-gray-700">Unacknowledged bookings</span>
                <span className="font-semibold text-gray-900">{needsAction.unacknowledged.length}</span>
              </li>
              <li className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                <span className="text-gray-700">Pending confirmations</span>
                <span className="font-semibold text-gray-900">{needsAction.pending.length}</span>
              </li>
              <li className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                <span className="text-gray-700">Active bookings today</span>
                <span className="font-semibold text-gray-900">{needsAction.todayBookings.length}</span>
              </li>
              <li className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                <span className="text-gray-700">Low-rating reviews to handle</span>
                <span className="font-semibold text-gray-900">{needsAction.lowRatingUnreplied}</span>
              </li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-finland" />
              <h2 className="text-base font-semibold text-gray-900">Activity feed</h2>
            </div>
            {activityItems.length === 0 ? (
              <p className="text-sm text-gray-500">No recent supplier activity yet.</p>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {activityItems.map((item, idx) => (
                  <li key={`${item.at}-${idx}`} className="border border-gray-200 rounded-lg px-3 py-2">
                    <p className="text-sm font-medium text-gray-900">{item.title}</p>
                    {item.details && <p className="text-xs text-gray-600 mt-0.5">{item.details}</p>}
                    <p className="text-xs text-gray-400 mt-1">{new Date(item.at).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {listingsCount === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-finland/10 text-finland mb-4">
            <MapPin className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Add your first listing</h2>
          <p className="text-gray-600 mb-6 max-w-sm mx-auto">
            Create a tour or activity to start appearing on Traverion. Travelers can then find and book your experience.
          </p>
          <button
            type="button"
            onClick={onNavigateToListings}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add listing
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center gap-2 text-gray-500 mb-4">
          <BarChart3 className="w-5 h-5" />
          <span className="font-medium">Bookings over time</span>
        </div>
        <div className="h-48 flex items-center justify-center border border-dashed border-gray-200 rounded-lg bg-gray-50">
          <p className="text-gray-400 text-sm">Bookings will appear here once you have activity</p>
        </div>
      </div>
    </div>
  );
}
