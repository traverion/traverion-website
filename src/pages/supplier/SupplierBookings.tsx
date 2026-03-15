import { useState, useEffect, useCallback } from 'react';
import { Calendar, Mail, RefreshCw } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchBookingsForSupplier, updateBookingStatus, type BookingRow } from '../../data/supabase-bookings';
import { fetchMyListings } from '../../data/supabase-listings';

export default function SupplierBookings() {
  const { user, isSupabase } = useSupplierAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [listingTitles, setListingTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabase || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [bookingsList, listings] = await Promise.all([
      fetchBookingsForSupplier(user.id),
      fetchMyListings(user.id),
    ]);
    setBookings(bookingsList);
    const titles: Record<string, string> = {};
    listings.forEach((l) => { titles[l.id] = l.title; });
    setListingTitles(titles);
    setLoading(false);
  }, [isSupabase, user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatusChange = async (bookingId: string, status: 'pending' | 'confirmed' | 'cancelled') => {
    setUpdatingId(bookingId);
    const ok = await updateBookingStatus(bookingId, status);
    if (ok) {
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status } : b))
      );
    }
    setUpdatingId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Bookings</h1>
          <p className="text-gray-600 mt-1">View and manage incoming bookings for your listings.</p>
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

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-500">Loading bookings…</p>
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 mb-4">
            <Calendar className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">No bookings yet</h2>
          <p className="text-gray-500 mt-1 max-w-sm mx-auto">
            When travelers book your experiences, they’ll appear here with status: pending, confirmed, or cancelled.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                  <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Listing</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Guest</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Guests</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Requests</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {listingTitles[b.listing_id] ?? (
                        <span className="text-gray-400">Listing</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-1.5">
                        {b.guest_name && <span className="text-gray-900">{b.guest_name}</span>}
                        {b.guest_email && (
                          <span className="text-gray-500 flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5" />
                            {b.guest_email}
                          </span>
                        )}
                        {!b.guest_name && !b.guest_email && <span className="text-gray-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {b.booking_date ? new Date(b.booking_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{b.guests ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[180px] truncate" title={b.special_requests ?? undefined}>
                      {b.special_requests ? b.special_requests : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${
                          b.status === 'confirmed'
                            ? 'bg-green-100 text-green-800'
                            : b.status === 'cancelled'
                            ? 'bg-gray-100 text-gray-600'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {b.status !== 'cancelled' && (
                        <div className="flex items-center justify-end gap-1">
                          {updatingId === b.id ? (
                            <span className="text-xs text-gray-500">Updating…</span>
                          ) : (
                            <>
                              {b.status !== 'confirmed' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(b.id, 'confirmed')}
                                  className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200"
                                >
                                  Confirm
                                </button>
                              )}
                              {b.status !== 'cancelled' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(b.id, 'cancelled')}
                                  className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                                >
                                  Cancel
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
