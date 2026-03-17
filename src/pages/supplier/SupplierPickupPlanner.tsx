/**
 * Supplier: pickup planner – list bookings with meeting point / pickup, filter by date.
 */
import { useState, useEffect, useCallback } from 'react';
import { MapPin, ClipboardList, AlertCircle, RefreshCw } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchBookingsForSupplier } from '../../data/supabase-bookings';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchListingById } from '../../data/supabase-listings';
import type { BookingRow } from '../../data/supabase-bookings';

export default function SupplierPickupPlanner() {
  const { user, isSupabase } = useSupplierAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [listingTitles, setListingTitles] = useState<Record<string, string>>({});
  const [meetingPoints, setMeetingPoints] = useState<Record<string, string>>({});
  const [pickupInstructions, setPickupInstructions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabase || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [bookingsList, listings] = await Promise.all([
        fetchBookingsForSupplier(user.id),
        fetchMyListings(user.id),
      ]);
      setBookings(bookingsList);
      const titles: Record<string, string> = {};
      listings.forEach((l) => { titles[l.id] = l.title; });
      setListingTitles(titles);
      const listingIds = [...new Set(bookingsList.map((b) => b.listing_id))];
      const points: Record<string, string> = {};
      const instructions: Record<string, string> = {};
      for (const lid of listingIds) {
        const listing = await fetchListingById(lid);
        if (listing) {
          points[lid] = listing.meetingPoint ?? '';
          instructions[lid] = listing.pickupInstructions ?? '';
        }
      }
      setMeetingPoints(points);
      setPickupInstructions(instructions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pickup data');
    } finally {
      setLoading(false);
    }
  }, [isSupabase, user]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = bookings.filter((b) => {
    if (b.status === 'cancelled') return false;
    if (dateFrom && b.booking_date && b.booking_date < dateFrom) return false;
    if (dateTo && b.booking_date && b.booking_date > dateTo) return false;
    return true;
  });

  const sorted = [...filtered].sort(
    (a, b) => (a.booking_date ?? '').localeCompare(b.booking_date ?? '') || a.created_at.localeCompare(b.created_at)
  );

  if (!isSupabase || !user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Pickup planner</h1>
        <p className="text-gray-600 mt-1">View bookings with meeting point and pickup details. Set these on each listing.</p>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm flex items-center justify-between gap-4">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</span>
          <button type="button" onClick={() => load()} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-100 text-red-800 font-medium hover:bg-red-200">
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From date</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To date</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-500">Loading…</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900">No bookings in range</h2>
          <p className="text-gray-500 mt-1">Confirmed or pending bookings with dates in the selected range will appear here.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Listing</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Guest</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Guests</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Meeting point</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Pickup instructions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sorted.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {b.booking_date ? new Date(b.booking_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {listingTitles[b.listing_id] ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {b.guest_name ?? b.guest_email ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{b.guests ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px]">
                      {meetingPoints[b.listing_id] ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-finland flex-shrink-0" />
                          {meetingPoints[b.listing_id]}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate" title={pickupInstructions[b.listing_id]}>
                      {pickupInstructions[b.listing_id] || '—'}
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
