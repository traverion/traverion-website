import { useState, useEffect, useMemo } from 'react';
import { BarChart3, Calendar, DollarSign, MapPin, Plus, ArrowRight, Star, CheckCircle, Circle } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchSupplierEarnings } from '../../data/supabase-earnings';
import { fetchBookingsForSupplier } from '../../data/supabase-bookings';
import { fetchReviewsForSupplierListings } from '../../data/supabase-reviews';
import { fetchSupplierProfile } from '../../data/supabase-supplier-profile';

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
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchSupplierProfile>>(null);

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
    }
  }, [isSupabase, user]);

  useEffect(() => {
    if (isSupabase && user) {
      fetchSupplierProfile(user.id).then(setProfile);
    } else {
      setProfile(null);
    }
  }, [isSupabase, user]);

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Overview of your tours and activities</p>
      </div>

      {isSupabase && user && (listingsCount === 0 || !profile?.payout_method || profile.payout_method === 'none' || !profile?.company_legal_name?.trim()) && (
        <div className="bg-finland/5 border border-finland/20 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Get set up</h2>
          <ul className="space-y-2">
            {listingsCount === 0 && (
              <li className="flex items-center gap-3">
                <Circle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span className="text-gray-700">Add your first listing</span>
                {onNavigateToListings && (
                  <button type="button" onClick={onNavigateToListings} className="ml-auto text-sm font-medium text-finland hover:underline">
                    Go to listings
                  </button>
                )}
              </li>
            )}
            {listingsCount !== 0 && (
              <li className="flex items-center gap-3 text-gray-500">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span>Add your first listing</span>
              </li>
            )}
            {(!profile?.payout_method || profile.payout_method === 'none') && (
              <li className="flex items-center gap-3">
                <Circle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span className="text-gray-700">Set payout method</span>
                {onNavigateToSettings && (
                  <button type="button" onClick={onNavigateToSettings} className="ml-auto text-sm font-medium text-finland hover:underline">
                    Settings
                  </button>
                )}
              </li>
            )}
            {profile?.payout_method && profile.payout_method !== 'none' && (
              <li className="flex items-center gap-3 text-gray-500">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span>Set payout method</span>
              </li>
            )}
            {!profile?.company_legal_name?.trim() && (
              <li className="flex items-center gap-3">
                <Circle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span className="text-gray-700">Complete company profile</span>
                {onNavigateToSettings && (
                  <button type="button" onClick={onNavigateToSettings} className="ml-auto text-sm font-medium text-finland hover:underline">
                    Settings
                  </button>
                )}
              </li>
            )}
            {profile?.company_legal_name?.trim() && (
              <li className="flex items-center gap-3 text-gray-500">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span>Complete company profile</span>
              </li>
            )}
          </ul>
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
