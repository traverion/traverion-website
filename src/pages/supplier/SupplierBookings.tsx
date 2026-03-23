import { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, Mail, RefreshCw, CheckCircle, MessageCircle, Trash2, FileText, AlertCircle, Download } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import {
  fetchBookingsForSupplier,
  updateBookingStatus,
  acknowledgeBooking,
  batchCancelBookings,
  type BookingRow,
} from '../../data/supabase-bookings';
import { fetchMyListings } from '../../data/supabase-listings';
import { decrementAvailabilityBooked } from '../../data/supabase-availability';

const CANCELLATION_REASONS = [
  { id: 'customer_request', label: 'Customer requested cancellation' },
  { id: 'force_majeure', label: 'Force majeure' },
  { id: 'operational', label: 'Operational reasons' },
];

const REFUND_CHOICES = [
  { id: 'full_refund', label: 'Full refund' },
  { id: 'no_refund', label: 'No refund' },
  { id: 'reschedule', label: 'Offer reschedule' },
];

export default function SupplierBookings() {
  const { user, isSupabase } = useSupplierAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [listingTitles, setListingTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState<BookingRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelRefund, setCancelRefund] = useState<string>('');
  const [batchModal, setBatchModal] = useState(false);
  const [batchListingId, setBatchListingId] = useState('');
  const [batchDateFrom, setBatchDateFrom] = useState('');
  const [batchDateTo, setBatchDateTo] = useState('');
  const [batchReason, setBatchReason] = useState('');
  const [batchRefund, setBatchRefund] = useState('');
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [view, setView] = useState<'all' | 'pending' | 'needs_ack' | 'upcoming' | 'cancelled'>('all');
  const [filterListingId, setFilterListingId] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCancelModal, setBulkCancelModal] = useState(false);
  const [bulkCancelReason, setBulkCancelReason] = useState('');
  const [bulkCancelRefund, setBulkCancelRefund] = useState('');
  const [bulkActionSubmitting, setBulkActionSubmitting] = useState(false);
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [isSupabase, user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatusChange = async (booking: BookingRow, status: 'pending' | 'confirmed' | 'cancelled', options?: { cancellation_reason?: string; refund_choice?: 'full_refund' | 'no_refund' | 'reschedule' }) => {
    setUpdatingId(booking.id);
    const previousStatus = booking.status;
    const ok = await updateBookingStatus(booking.id, status, options);
    if (ok) {
      if (status === 'cancelled' && previousStatus === 'confirmed' && booking.booking_date) {
        await decrementAvailabilityBooked(booking.listing_id, booking.booking_date);
      }
      setBookings((prev) =>
        prev.map((b) => (b.id === booking.id ? { ...b, status, cancelled_at: status === 'cancelled' ? new Date().toISOString() : null, cancellation_reason: options?.cancellation_reason ?? b.cancellation_reason, refund_choice: options?.refund_choice ?? b.refund_choice } : b))
      );
      setCancelModal(null);
      setCancelReason('');
      setCancelRefund('');
    }
    setUpdatingId(null);
  };

  const handleAcknowledge = async (booking: BookingRow) => {
    setUpdatingId(booking.id);
    const ok = await acknowledgeBooking(booking.id);
    if (ok) {
      setBookings((prev) =>
        prev.map((b) => (b.id === booking.id ? { ...b, acknowledged_at: new Date().toISOString() } : b))
      );
    }
    setUpdatingId(null);
  };

  const handleBatchCancel = async () => {
    if (!user || !batchListingId || !batchDateFrom || !batchDateTo || !batchReason) return;
    setBatchSubmitting(true);
    const res = await batchCancelBookings(user.id, {
      listingIds: [batchListingId],
      dateFrom: batchDateFrom,
      dateTo: batchDateTo,
      cancellation_reason: batchReason,
      refund_choice: batchRefund as 'full_refund' | 'no_refund' | 'reschedule' | undefined,
    });
    setBatchSubmitting(false);
    if (res.count > 0) {
      for (const b of bookings) {
        if (b.listing_id === batchListingId && b.booking_date && b.booking_date >= batchDateFrom && b.booking_date <= batchDateTo && b.status !== 'cancelled') {
          await decrementAvailabilityBooked(b.listing_id, b.booking_date);
        }
      }
      load();
      setBatchModal(false);
      setBatchListingId('');
      setBatchDateFrom('');
      setBatchDateTo('');
      setBatchReason('');
      setBatchRefund('');
    }
  };

  const listingOptions = Object.entries(listingTitles).map(([id, title]) => ({ id, title }));
  const todayIso = new Date().toISOString().slice(0, 10);

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (view === 'pending' && b.status !== 'pending') return false;
      if (view === 'needs_ack' && !!b.acknowledged_at) return false;
      if (view === 'upcoming') {
        if (!b.booking_date) return false;
        if (b.booking_date < todayIso) return false;
        if (b.status === 'cancelled') return false;
      }
      if (view === 'cancelled' && b.status !== 'cancelled') return false;
      if (filterListingId && b.listing_id !== filterListingId) return false;
      if (filterDateFrom && (!b.booking_date || b.booking_date < filterDateFrom)) return false;
      if (filterDateTo && (!b.booking_date || b.booking_date > filterDateTo)) return false;
      return true;
    });
  }, [bookings, view, filterListingId, filterDateFrom, filterDateTo, todayIso]);

  const selectedBookings = useMemo(
    () => filteredBookings.filter((b) => selectedIds.includes(b.id)),
    [filteredBookings, selectedIds]
  );

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllVisible = () => {
    const ids = filteredBookings.map((b) => b.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) => (allSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
  };

  const clearSelection = () => setSelectedIds([]);

  const handleBulkAcknowledge = async () => {
    const targets = selectedBookings.filter((b) => !b.acknowledged_at && b.status !== 'cancelled');
    if (targets.length === 0) return;
    setBulkActionSubmitting(true);
    await Promise.all(targets.map((b) => acknowledgeBooking(b.id)));
    setBookings((prev) =>
      prev.map((b) => (targets.some((t) => t.id === b.id) ? { ...b, acknowledged_at: new Date().toISOString() } : b))
    );
    setBulkActionSubmitting(false);
    clearSelection();
  };

  const handleBulkConfirm = async () => {
    const targets = selectedBookings.filter((b) => b.status !== 'confirmed' && b.status !== 'cancelled');
    if (targets.length === 0) return;
    setBulkActionSubmitting(true);
    await Promise.all(targets.map((b) => updateBookingStatus(b.id, 'confirmed')));
    setBookings((prev) => prev.map((b) => (targets.some((t) => t.id === b.id) ? { ...b, status: 'confirmed' } : b)));
    setBulkActionSubmitting(false);
    clearSelection();
  };

  const handleBulkCancelSelected = async () => {
    if (!bulkCancelReason) return;
    const targets = selectedBookings.filter((b) => b.status !== 'cancelled');
    if (targets.length === 0) return;
    setBulkActionSubmitting(true);
    for (const b of targets) {
      const previousStatus = b.status;
      await updateBookingStatus(b.id, 'cancelled', {
        cancellation_reason: bulkCancelReason,
        refund_choice: bulkCancelRefund as 'full_refund' | 'no_refund' | 'reschedule' | undefined,
      });
      if (previousStatus === 'confirmed' && b.booking_date) {
        await decrementAvailabilityBooked(b.listing_id, b.booking_date);
      }
    }
    setBookings((prev) =>
      prev.map((b) =>
        targets.some((t) => t.id === b.id)
          ? {
              ...b,
              status: 'cancelled',
              cancelled_at: new Date().toISOString(),
              cancellation_reason: bulkCancelReason,
              refund_choice: bulkCancelRefund || b.refund_choice,
            }
          : b
      )
    );
    setBulkActionSubmitting(false);
    setBulkCancelModal(false);
    setBulkCancelReason('');
    setBulkCancelRefund('');
    clearSelection();
  };

  const handleExportCsv = () => {
    const exportRows = filteredBookings.filter((b) => {
      if (exportDateFrom && (!b.booking_date || b.booking_date < exportDateFrom)) return false;
      if (exportDateTo && (!b.booking_date || b.booking_date > exportDateTo)) return false;
      return true;
    });
    const escapeCsv = (value: string | number | null | undefined) => {
      const str = String(value ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) return `"${str.replace(/"/g, '""')}"`;
      return str;
    };
    const header = ['booking_id', 'listing', 'guest_name', 'guest_email', 'booking_date', 'guests', 'status', 'acknowledged', 'special_requests'];
    const lines = exportRows.map((b) =>
      [
        b.id,
        listingTitles[b.listing_id] ?? b.listing_id,
        b.guest_name,
        b.guest_email,
        b.booking_date,
        b.guests,
        b.status,
        b.acknowledged_at ? 'yes' : 'no',
        b.special_requests,
      ]
        .map(escapeCsv)
        .join(',')
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supplier-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Bookings</h1>
          <p className="text-gray-600 mt-1">View and manage incoming bookings for your listings.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setBatchModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <Trash2 className="w-4 h-4" />
            Batch cancel
          </button>
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
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'All' },
            { id: 'pending', label: 'Pending' },
            { id: 'needs_ack', label: 'Needs ack' },
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'cancelled', label: 'Cancelled' },
          ].map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setView(v.id as typeof view);
                setSelectedIds([]);
              }}
              className={`px-3 py-1.5 rounded-full text-sm border ${
                view === v.id ? 'bg-finland/10 text-finland border-finland/20' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select
            value={filterListingId}
            onChange={(e) => setFilterListingId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white text-sm"
          >
            <option value="">All listings</option>
            {listingOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.title}</option>
            ))}
          </select>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland text-sm"
          />
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland text-sm"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm flex items-center justify-between gap-4">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</span>
          <button type="button" onClick={() => load()} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-100 text-red-800 font-medium hover:bg-red-200">Try again</button>
        </div>
      )}

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
            When travelers book your experiences, they’ll appear here as confirmed. You can request cancellation (with reason and refund choice) if needed.
          </p>
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <h2 className="text-lg font-semibold text-gray-900">No matching bookings</h2>
          <p className="text-gray-500 mt-1">Try a different view or clear date/listing filters.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/70 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleSelectAllVisible}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >
                {filteredBookings.length > 0 && filteredBookings.every((b) => selectedIds.includes(b.id)) ? 'Unselect all' : 'Select all'}
              </button>
              <span className="text-sm text-gray-600">{selectedIds.length} selected</span>
              <button
                type="button"
                onClick={handleBulkAcknowledge}
                disabled={selectedIds.length === 0 || bulkActionSubmitting}
                className="px-3 py-1.5 rounded-lg border border-blue-200 text-sm text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
              >
                Acknowledge selected
              </button>
              <button
                type="button"
                onClick={handleBulkConfirm}
                disabled={selectedIds.length === 0 || bulkActionSubmitting}
                className="px-3 py-1.5 rounded-lg border border-green-200 text-sm text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-50"
              >
                Confirm selected
              </button>
              <button
                type="button"
                onClick={() => setBulkCancelModal(true)}
                disabled={selectedIds.length === 0 || bulkActionSubmitting}
                className="px-3 py-1.5 rounded-lg border border-red-200 text-sm text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
              >
                Cancel selected
              </button>
              {selectedIds.length > 0 && (
                <button type="button" onClick={clearSelection} className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600">Export range:</span>
              <input
                type="date"
                value={exportDateFrom}
                onChange={(e) => setExportDateFrom(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="date"
                value={exportDateTo}
                onChange={(e) => setExportDateTo(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <input
                      type="checkbox"
                      checked={filteredBookings.length > 0 && filteredBookings.every((b) => selectedIds.includes(b.id))}
                      onChange={toggleSelectAllVisible}
                      aria-label="Select all visible bookings"
                    />
                  </th>
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
                {filteredBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(b.id)}
                        onChange={() => toggleSelected(b.id)}
                        aria-label={`Select booking ${b.id}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {listingTitles[b.listing_id] ?? <span className="text-gray-400">Listing</span>}
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
                      {b.acknowledged_at && (
                        <span className="ml-1 text-xs text-gray-500" title="Acknowledged">✓</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {b.status !== 'cancelled' && (
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          {b.guest_email && (
                            <a
                              href={`mailto:${b.guest_email}?subject=Your booking – ${listingTitles[b.listing_id] ?? 'Tour'}`}
                              className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 inline-flex items-center gap-1"
                              title="Contact customer"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              Contact
                            </a>
                          )}
                          {!b.acknowledged_at && (
                            <button
                              type="button"
                              onClick={() => handleAcknowledge(b)}
                              disabled={updatingId === b.id}
                              className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 inline-flex items-center gap-1 disabled:opacity-50"
                              title="Acknowledge booking"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Ack
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setCancelModal(b)}
                            disabled={updatingId === b.id}
                            className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                          >
                            Cancel
                          </button>
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

      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Request cancellation</h3>
            <p className="text-sm text-gray-600 mb-4">
              Cancel booking for {listingTitles[cancelModal.listing_id]} – {cancelModal.guest_email ?? cancelModal.guest_name ?? 'Guest'}?
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                >
                  <option value="">Select reason</option>
                  {CANCELLATION_REASONS.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Refund</label>
                <select
                  value={cancelRefund}
                  onChange={(e) => setCancelRefund(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                >
                  <option value="">Select option</option>
                  {REFUND_CHOICES.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setCancelModal(null); setCancelReason(''); setCancelRefund(''); }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!cancelReason || updatingId === cancelModal.id}
                onClick={() => handleStatusChange(cancelModal, 'cancelled', {
                  cancellation_reason: cancelReason,
                  refund_choice: cancelRefund as 'full_refund' | 'no_refund' | 'reschedule' | undefined,
                })}
                className="px-4 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
              >
                {updatingId === cancelModal.id ? 'Cancelling…' : 'Confirm cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {batchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Batch cancel</h3>
            <p className="text-sm text-gray-600 mb-4">Cancel all bookings for one listing in a date range.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Listing</label>
                <select
                  value={batchListingId}
                  onChange={(e) => setBatchListingId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                >
                  <option value="">Select listing</option>
                  {listingOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.title}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From date</label>
                  <input
                    type="date"
                    value={batchDateFrom}
                    onChange={(e) => setBatchDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To date</label>
                  <input
                    type="date"
                    value={batchDateTo}
                    onChange={(e) => setBatchDateTo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <select
                  value={batchReason}
                  onChange={(e) => setBatchReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                >
                  <option value="">Select reason</option>
                  {CANCELLATION_REASONS.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Refund</label>
                <select
                  value={batchRefund}
                  onChange={(e) => setBatchRefund(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                >
                  <option value="">Select option</option>
                  {REFUND_CHOICES.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setBatchModal(false); setBatchListingId(''); setBatchDateFrom(''); setBatchDateTo(''); setBatchReason(''); setBatchRefund(''); }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                type="button"
                disabled={!batchListingId || !batchDateFrom || !batchDateTo || !batchReason || batchSubmitting}
                onClick={handleBatchCancel}
                className="px-4 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
              >
                {batchSubmitting ? 'Cancelling…' : 'Cancel bookings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cancel selected bookings</h3>
            <p className="text-sm text-gray-600 mb-4">
              You are cancelling {selectedBookings.filter((b) => b.status !== 'cancelled').length} selected booking(s).
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <select
                  value={bulkCancelReason}
                  onChange={(e) => setBulkCancelReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                >
                  <option value="">Select reason</option>
                  {CANCELLATION_REASONS.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Refund</label>
                <select
                  value={bulkCancelRefund}
                  onChange={(e) => setBulkCancelRefund(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland bg-white"
                >
                  <option value="">Select option</option>
                  {REFUND_CHOICES.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setBulkCancelModal(false);
                  setBulkCancelReason('');
                  setBulkCancelRefund('');
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!bulkCancelReason || bulkActionSubmitting}
                onClick={handleBulkCancelSelected}
                className="px-4 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
              >
                {bulkActionSubmitting ? 'Cancelling…' : 'Confirm cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <FileText className="w-5 h-5 text-finland" />
          Sample voucher
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          This is how a booking voucher could look for your guests. When payment is integrated, vouchers can be generated per booking.
        </p>
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 max-w-md bg-gray-50/50">
          <div className="text-center border-b border-gray-200 pb-4 mb-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Traverion</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">Booking voucher</p>
          </div>
          <div className="space-y-2 text-sm">
            <p><span className="text-gray-500">Reference:</span> <span className="font-mono">TRV-XXXXXX</span></p>
            <p><span className="text-gray-500">Guest:</span> Guest name</p>
            <p><span className="text-gray-500">Date:</span> —</p>
            <p><span className="text-gray-500">Experience:</span> Your listing title</p>
          </div>
          <div className="mt-6 h-16 bg-gray-200 rounded flex items-center justify-center text-gray-500 text-xs">
            QR code / Barcode
          </div>
        </div>
      </div>
    </div>
  );
}
