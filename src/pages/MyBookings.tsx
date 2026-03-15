/**
 * Consumer: list of the logged-in user's bookings with status.
 * RLS ensures only rows where guest_email = auth user email are returned.
 */
import { useState, useEffect, useCallback } from 'react';
import { Calendar, Users, MapPin, LogIn, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchMyBookings, type BookingRow } from '../data/supabase-bookings';
import { fetchListingTitlesByIds } from '../data/supabase-listings';

interface MyBookingsProps {
  onNavigate: (page: string) => void;
  onTourSelect?: (tour: { id: string }) => void;
}

export default function MyBookings({ onNavigate, onTourSelect }: MyBookingsProps) {
  const { user, requestAuth } = useAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured() || !user?.email) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const list = await fetchMyBookings();
    setBookings(list);
    const ids = [...new Set(list.map((b) => b.listing_id))];
    const titleMap = await fetchListingTitlesByIds(ids);
    setTitles(titleMap);
    setLoading(false);
  }, [user?.email]);

  useEffect(() => {
    if (user) load();
    else setLoading(false);
  }, [user, load]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-gray-50 pt-24 pb-12">
        <div className="max-w-2xl mx-auto px-4">
          <p className="text-gray-600">Bookings are not available in this configuration.</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 pt-24 pb-12">
        <div className="max-w-xl mx-auto px-4 text-center">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10">
            <Calendar className="w-14 h-14 text-gray-300 mx-auto mb-4" />
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Your bookings</h1>
            <p className="text-gray-600 mb-6">Log in to see your reservations and their status (pending, confirmed, or cancelled).</p>
            <button
              type="button"
              onClick={() => requestAuth()}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark"
            >
              <LogIn className="w-5 h-5" />
              Log in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Your bookings</h1>
            <p className="text-gray-600 mt-1">View status of your tour and activity reservations.</p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Loading your bookings…</p>
          </div>
        ) : bookings.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Calendar className="w-14 h-14 text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">No bookings yet</h2>
            <p className="text-gray-600 mb-6">When you book a tour or activity, it will appear here with its status.</p>
            <button
              type="button"
              onClick={() => onNavigate('packages')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark"
            >
              <MapPin className="w-5 h-5" />
              Browse tours
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((b) => (
              <div
                key={b.id}
                className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {titles[b.listing_id] ?? 'Tour'}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {b.booking_date ? new Date(b.booking_date).toLocaleDateString() : 'Date TBC'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {b.guests} {b.guests === 1 ? 'guest' : 'guests'}
                    </span>
                  </div>
                  {b.special_requests && (
                    <p className="mt-2 text-sm text-gray-500 line-clamp-2">{b.special_requests}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 sm:flex-shrink-0">
                  <span
                    className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
                      b.status === 'confirmed'
                        ? 'bg-green-100 text-green-800'
                        : b.status === 'cancelled'
                        ? 'bg-gray-100 text-gray-600'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {b.status}
                  </span>
                  {onTourSelect && (
                    <button
                      type="button"
                      onClick={() => onTourSelect({ id: b.listing_id })}
                      className="text-sm text-finland hover:underline"
                    >
                      View tour
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
