/**
 * Supplier: pickup planner – bookings with meeting / pickup, filters, CSV, deep link to edit listing pickup fields.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardList,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Download,
  ChevronDown,
  ArrowLeft,
  MapPin,
  Users,
  Clock,
  Filter,
  CheckCircle2,
} from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import {
  fetchBookingsForSupplier,
  updateBookingStatus,
  acknowledgeBooking,
  updateBookingSchedule,
} from '../../data/supabase-bookings';
import { fetchMyListings, fetchListingById, pgTimeToHm } from '../../data/supabase-listings';
import type { BookingRow } from '../../data/supabase-bookings';
import { openSupplierListingEditor, openSupplierBooking } from '../../lib/supplierPortalNavigation';
import { decrementAvailabilityBooked } from '../../data/supabase-availability';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import { SUPPLIER_PAGE_CLASS } from '../../components/supplier/supplierUi';

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type ListingGuideMeta = {
  duration: string;
  bestTime: string;
  startLocation: string;
  defaultStartTime?: string;
  pickupWindowMin: number;
  pickupWindowMax: number;
};
type RefundChoice = 'full_refund' | 'no_refund' | 'reschedule';

const CANCELLATION_REASONS = [
  { id: 'customer_request', label: 'Customer requested cancellation' },
  { id: 'force_majeure', label: 'Force majeure' },
  { id: 'operational', label: 'Operational reasons' },
];

const REFUND_CHOICES: { id: RefundChoice; label: string }[] = [
  { id: 'full_refund', label: 'Full refund' },
  { id: 'no_refund', label: 'No refund' },
  { id: 'reschedule', label: 'Offer reschedule' },
];

function parseYmdLocal(ymd: string): Date | null {
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Hours from now until start of local calendar day for the booking date (negative = past). */
function hoursUntilBookingDayStart(ymd: string | null | undefined): number | null {
  if (!ymd) return null;
  const d = parseYmdLocal(ymd);
  if (!d) return null;
  return (d.getTime() - Date.now()) / (1000 * 60 * 60);
}

function formatPickupSectionDate(ymd: string): string {
  const d = parseYmdLocal(ymd);
  if (!d) return ymd;
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function guideScheduleSummary(meta: ListingGuideMeta | undefined): string {
  if (!meta) return '';
  const parts: string[] = [];
  if (meta.duration && meta.duration !== '—') parts.push(meta.duration);
  if (meta.bestTime && meta.bestTime !== '—') parts.push(meta.bestTime);
  if (meta.defaultStartTime) {
    parts.push(`Start ${meta.defaultStartTime}`);
    parts.push(`Pickup ${meta.pickupWindowMin}–${meta.pickupWindowMax} min before`);
  }
  if (meta.startLocation && meta.startLocation !== '—') parts.push(meta.startLocation);
  return parts.join(' · ');
}

function bookingTimesLine(b: BookingRow): string | null {
  const s = b.start_time ? pgTimeToHm(b.start_time) : '';
  const p = b.pickup_time ? pgTimeToHm(b.pickup_time) : '';
  if (!s && !p) return null;
  if (s && p) return `Start ${s} · Pickup ${p}`;
  if (s) return `Start ${s}`;
  return `Pickup ${p}`;
}

function plannerInputClass(): string {
  return 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-finland focus:ring-2 focus:ring-finland/25 outline-none transition-shadow';
}

function bookingStatusStyles(status: string): string {
  if (status === 'confirmed') return 'bg-emerald-50 text-emerald-800 ring-emerald-200/80';
  if (status === 'pending') return 'bg-amber-50 text-amber-900 ring-amber-200/80';
  if (status === 'cancelled') return 'bg-red-50 text-red-800 ring-red-200/80';
  return 'bg-slate-100 text-slate-700 ring-slate-200/80';
}

type PlannerBookingCardProps = {
  booking: BookingRow;
  listingTitle: string;
  guideMeta: ListingGuideMeta | undefined;
  missingPickup: boolean;
  urgentSoon?: boolean;
  showActivityDate?: boolean;
  onOpen: () => void;
};

function PlannerBookingCard({
  booking,
  listingTitle,
  guideMeta,
  missingPickup,
  urgentSoon,
  showActivityDate,
  onOpen,
}: PlannerBookingCardProps) {
  const guestsN = Number(booking.guests ?? 0);
  const activityParsed = booking.booking_date ? parseYmdLocal(booking.booking_date) : null;
  const actDate =
    showActivityDate && activityParsed
      ? activityParsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
      : null;
  const times = bookingTimesLine(booking);
  const guide = guideScheduleSummary(guideMeta);

  return (
    <article
      className={`group rounded-2xl border p-4 transition-all duration-200 ease-out hover:shadow-md ${
        urgentSoon
          ? 'border-red-200 bg-red-50/40 hover:border-red-300'
          : missingPickup
            ? 'border-amber-200/90 bg-amber-50/30 hover:border-amber-300'
            : 'border-gray-200 bg-white hover:border-finland/25'
      }`}
    >
      {urgentSoon && (
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Starts within 24 hours — pickup details still incomplete
        </p>
      )}
      {!urgentSoon && missingPickup && (
        <p className="mb-2 text-xs font-semibold text-amber-800">Meeting or pickup copy incomplete for this listing</p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-gray-900">{listingTitle}</h3>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset ${bookingStatusStyles(booking.status)}`}
            >
              {booking.status}
            </span>
          </div>

          <p className="text-sm text-gray-800">
            {booking.guest_name ?? booking.guest_email ?? 'Guest'}
            {actDate ? <span className="text-gray-500"> · {actDate}</span> : null}
          </p>

          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-gray-400" aria-hidden />
              <span className="font-semibold tabular-nums text-gray-800">{guestsN}</span> guest{guestsN === 1 ? '' : 's'}
            </span>
            {times ? (
              <span className="inline-flex items-center gap-1 font-medium text-finland">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {times}
              </span>
            ) : null}
          </div>

          {guide ? <p className="line-clamp-2 text-xs text-gray-500">{guide}</p> : null}
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-finland px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-finland-dark active:scale-[0.98]"
        >
          Pickup details
        </button>
      </div>
    </article>
  );
}

export default function SupplierPickupPlanner() {
  const { user, isSupabase } = useSupplierAuth();
  const { role } = useSupplierRole();
  const canEditBookings = canManageBookings(role);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [listingTitles, setListingTitles] = useState<Record<string, string>>({});
  const [meetingPoints, setMeetingPoints] = useState<Record<string, string>>({});
  const [pickupInstructions, setPickupInstructions] = useState<Record<string, string>>({});
  const [listingGuideMeta, setListingGuideMeta] = useState<Record<string, ListingGuideMeta>>({});
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelRefund, setCancelRefund] = useState<RefundChoice | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [listingFilterId, setListingFilterId] = useState('');
  const [needsPickupOnly, setNeedsPickupOnly] = useState(false);
  const [sortDate, setSortDate] = useState<'asc' | 'desc'>('asc');
  const [dateSectionOpen, setDateSectionOpen] = useState<Record<string, boolean>>({});
  const [scheduleDraft, setScheduleDraft] = useState({ start: '', pickup: '' });
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [bookingsList, listings] = await Promise.all([
        fetchBookingsForSupplier(uid),
        fetchMyListings(uid),
      ]);
      setBookings(bookingsList);
      const titles: Record<string, string> = {};
      const points: Record<string, string> = {};
      const instructions: Record<string, string> = {};
      const guideMeta: Record<string, ListingGuideMeta> = {};
      listings.forEach((l) => {
        titles[l.id] = l.title;
        points[l.id] = l.meetingPoint?.trim() ?? '';
        instructions[l.id] = l.pickupInstructions?.trim() ?? '';
        guideMeta[l.id] = {
          duration: l.duration?.trim() || '—',
          bestTime: l.bestTime?.trim() || '—',
          startLocation: l.startLocation?.trim() || '—',
          defaultStartTime: l.defaultStartTime,
          pickupWindowMin: l.pickupWindowMinutesBeforeMin ?? 0,
          pickupWindowMax: l.pickupWindowMinutesBeforeMax ?? 30,
        };
      });
      const listingIds = [...new Set(bookingsList.map((b) => b.listing_id))];
      for (const lid of listingIds) {
        if (titles[lid]) continue;
        const listing = await fetchListingById(lid);
        if (listing) {
          titles[lid] = listing.title;
          points[lid] = listing.meetingPoint?.trim() ?? '';
          instructions[lid] = listing.pickupInstructions?.trim() ?? '';
          guideMeta[lid] = {
            duration: listing.duration?.trim() || '—',
            bestTime: listing.bestTime?.trim() || '—',
            startLocation: listing.startLocation?.trim() || '—',
            defaultStartTime: listing.defaultStartTime,
            pickupWindowMin: listing.pickupWindowMinutesBeforeMin ?? 0,
            pickupWindowMax: listing.pickupWindowMinutesBeforeMax ?? 30,
          };
        }
      }
      setListingTitles(titles);
      setMeetingPoints(points);
      setPickupInstructions(instructions);
      setListingGuideMeta(guideMeta);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pickup data');
    } finally {
      setLoading(false);
    }
  }, [isSupabase, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  /** Active pickup work only: hide cancelled (status narrowing was removed as non-essential UI). */
  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (b.status === 'cancelled') return false;

      const bd = b.booking_date;
      if (dateFrom && bd && bd < dateFrom) return false;
      if (dateTo && bd && bd > dateTo) return false;
      if ((dateFrom || dateTo) && !bd) return false;
      return true;
    });
  }, [bookings, dateFrom, dateTo]);

  const sorted = useMemo(
    () =>
      [...filtered].sort(
        (a, b) =>
          (a.booking_date ?? '').localeCompare(b.booking_date ?? '') || a.created_at.localeCompare(b.created_at)
      ),
    [filtered]
  );

  const needsPickupInfo = useCallback((listingId: string) => {
    const m = (meetingPoints[listingId] ?? '').trim();
    const p = (pickupInstructions[listingId] ?? '').trim();
    return m.length + p.length < 20;
  }, [meetingPoints, pickupInstructions]);

  const listBookings = useMemo(() => {
    let rows = sorted;
    if (listingFilterId) rows = rows.filter((b) => b.listing_id === listingFilterId);
    if (needsPickupOnly) rows = rows.filter((b) => needsPickupInfo(b.listing_id));
    const cmp = (a: BookingRow, b: BookingRow) =>
      (a.booking_date ?? '').localeCompare(b.booking_date ?? '') || a.created_at.localeCompare(b.created_at);
    return sortDate === 'asc' ? [...rows].sort(cmp) : [...rows].sort((a, b) => cmp(b, a));
  }, [sorted, listingFilterId, needsPickupOnly, sortDate, needsPickupInfo]);

  const bookingsGroupedByDate = useMemo(() => {
    const withDate: BookingRow[] = [];
    const noDate: BookingRow[] = [];
    for (const b of listBookings) {
      if (b.booking_date) withDate.push(b);
      else noDate.push(b);
    }
    const byDay = new Map<string, BookingRow[]>();
    for (const b of withDate) {
      const d = b.booking_date as string;
      const arr = byDay.get(d) ?? [];
      arr.push(b);
      byDay.set(d, arr);
    }
    const orderedKeys = [...byDay.keys()].sort((a, b) => (sortDate === 'asc' ? a.localeCompare(b) : b.localeCompare(a)));
    return { byDay, orderedKeys, noDate };
  }, [listBookings, sortDate]);

  const listingSelectOptions = useMemo(
    () =>
      Object.entries(listingTitles)
        .map(([id, title]) => ({ id, title }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [listingTitles]
  );

  const selectedBooking = useMemo(
    () => sorted.find((b) => b.id === selectedBookingId) ?? null,
    [sorted, selectedBookingId]
  );

  useEffect(() => {
    if (!selectedBooking) return;
    setScheduleDraft({
      start: selectedBooking.start_time ? pgTimeToHm(selectedBooking.start_time) ?? '' : '',
      pickup: selectedBooking.pickup_time ? pgTimeToHm(selectedBooking.pickup_time) ?? '' : '',
    });
  }, [selectedBooking?.id, selectedBooking?.start_time, selectedBooking?.pickup_time]);

  useEffect(() => {
    if (!selectedBookingId) {
      setCancelReason('');
      setCancelRefund('');
    }
  }, [selectedBookingId]);

  useEffect(() => {
    if (!actionFeedback) return;
    const timer = window.setTimeout(() => setActionFeedback(null), 4000);
    return () => window.clearTimeout(timer);
  }, [actionFeedback]);

  const showActionFeedback = (type: 'success' | 'error', text: string) => {
    setActionFeedback({ type, text });
  };

  const actionFeedbackBanner = actionFeedback ? (
    <div
      className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${
        actionFeedback.type === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-red-200 bg-red-50 text-red-700'
      }`}
      role="status"
    >
      {actionFeedback.type === 'success' ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
      )}
      {actionFeedback.text}
    </div>
  ) : null;

  const handleSaveScheduleTimes = async () => {
    if (!canEditBookings || !selectedBooking || selectedBooking.status === 'cancelled') return;
    setUpdatingId(selectedBooking.id);
    const startTrim = scheduleDraft.start.trim();
    const pickupTrim = scheduleDraft.pickup.trim();
    const ok = await updateBookingSchedule(selectedBooking.id, {
      start_time: startTrim || null,
      pickup_time: pickupTrim || null,
    });
    if (ok) {
      setBookings((prev) =>
        prev.map((b) =>
          b.id === selectedBooking.id
            ? {
                ...b,
                start_time: startTrim ? `${startTrim}:00` : null,
                pickup_time: pickupTrim ? `${pickupTrim}:00` : null,
              }
            : b
        )
      );
      showActionFeedback('success', 'Times saved for this booking.');
    } else {
      showActionFeedback('error', 'Could not save times. Try again.');
    }
    setUpdatingId(null);
  };

  const exportCsv = () => {
    const headers = [
      'Date',
      'Status',
      'Listing',
      'Guest',
      'Guests',
      'Start time',
      'Pickup time',
      'Meeting point',
      'Pickup instructions',
    ];
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = listBookings.map((b) =>
      [
        b.booking_date ?? '',
        b.status,
        listingTitles[b.listing_id] ?? '',
        b.guest_name ?? b.guest_email ?? '',
        String(b.guests ?? ''),
        b.start_time ? pgTimeToHm(b.start_time) ?? '' : '',
        b.pickup_time ? pgTimeToHm(b.pickup_time) ?? '' : '',
        meetingPoints[b.listing_id] ?? '',
        pickupInstructions[b.listing_id] ?? '',
      ].map((c) => escape(String(c))).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pickup-planner-${toYmd(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAcknowledgeSelected = async () => {
    if (!canEditBookings) return;
    if (!selectedBooking || selectedBooking.status === 'cancelled' || selectedBooking.acknowledged_at) return;
    setUpdatingId(selectedBooking.id);
    const ok = await acknowledgeBooking(selectedBooking.id);
    if (ok) {
      setBookings((prev) =>
        prev.map((b) =>
          b.id === selectedBooking.id ? { ...b, acknowledged_at: new Date().toISOString() } : b
        )
      );
      showActionFeedback('success', 'Booking acknowledged.');
    } else {
      showActionFeedback('error', 'Could not acknowledge booking. Try again.');
    }
    setUpdatingId(null);
  };

  const handleConfirmSelected = async () => {
    if (!canEditBookings) return;
    if (!selectedBooking || selectedBooking.status === 'confirmed' || selectedBooking.status === 'cancelled') return;
    setUpdatingId(selectedBooking.id);
    const ok = await updateBookingStatus(selectedBooking.id, 'confirmed');
    if (ok) {
      setBookings((prev) =>
        prev.map((b) => (b.id === selectedBooking.id ? { ...b, status: 'confirmed' } : b))
      );
      showActionFeedback('success', 'Booking confirmed.');
    } else {
      showActionFeedback('error', 'Could not confirm booking. Try again.');
    }
    setUpdatingId(null);
  };

  const handleCancelSelected = async () => {
    if (!canEditBookings) return;
    if (!selectedBooking || selectedBooking.status === 'cancelled' || !cancelReason) return;
    setUpdatingId(selectedBooking.id);
    const previousStatus = selectedBooking.status;
    const ok = await updateBookingStatus(selectedBooking.id, 'cancelled', {
      cancellation_reason: cancelReason,
      refund_choice: cancelRefund || undefined,
    });
    if (ok) {
      if (previousStatus === 'confirmed' && selectedBooking.booking_date) {
        await decrementAvailabilityBooked(selectedBooking.listing_id, selectedBooking.booking_date);
      }
      setBookings((prev) =>
        prev.map((b) =>
          b.id === selectedBooking.id
            ? {
                ...b,
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                cancellation_reason: cancelReason,
                refund_choice: cancelRefund || b.refund_choice,
              }
            : b
        )
      );
      showActionFeedback('success', 'Booking cancelled.');
    } else {
      showActionFeedback('error', 'Could not cancel booking. Try again.');
    }
    setUpdatingId(null);
  };

  const plannerStats = useMemo(() => {
    const guestTotal = listBookings.reduce((sum, b) => sum + Number(b.guests ?? 0), 0);
    const needsPickup = listBookings.filter((b) => needsPickupInfo(b.listing_id)).length;
    return { bookings: listBookings.length, guests: guestTotal, needsPickup };
  }, [listBookings, needsPickupInfo]);

  if (!user) return null;

  if (selectedBooking) {
    const listingTitle = listingTitles[selectedBooking.listing_id] ?? 'Listing';
    const guideMeta = listingGuideMeta[selectedBooking.listing_id];
    const activityDate = selectedBooking.booking_date
      ? formatPickupSectionDate(selectedBooking.booking_date)
      : 'No activity date';

    return (
      <div className="space-y-6 max-w-3xl w-full min-w-0 animate-fade-in-up">
        <button
          type="button"
          onClick={() => setSelectedBookingId(null)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-finland hover:text-finland-dark transition-colors"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          Back to pickup planner
        </button>

        {actionFeedbackBanner}

        <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pickup details</p>
              <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-gray-900">{listingTitle}</h1>
              <p className="mt-1 text-sm text-gray-600">
                {selectedBooking.guest_name ?? selectedBooking.guest_email ?? 'Guest'} · {activityDate}
              </p>
            </div>
            <span
              className={`inline-flex self-start rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${bookingStatusStyles(selectedBooking.status)}`}
            >
              {selectedBooking.status}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-700 border-t border-gray-100 pt-4">
            <span>
              <span className="font-semibold tabular-nums text-gray-900">{selectedBooking.guests ?? '—'}</span> guests
            </span>
            {bookingTimesLine(selectedBooking) ? (
              <span className="inline-flex items-center gap-1 font-medium text-finland">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {bookingTimesLine(selectedBooking)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-br from-slate-50/90 to-white">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-finland" aria-hidden />
                Customer
              </h2>
            </div>
            <div className="p-5 sm:p-6 space-y-3">
              <p className="text-sm font-semibold text-gray-900">
                {selectedBooking.guest_name ?? selectedBooking.guest_email ?? '—'}
              </p>
              {selectedBooking.guest_name && selectedBooking.guest_email ? (
                <p className="text-sm text-gray-600 break-all">{selectedBooking.guest_email}</p>
              ) : null}
              <div className="rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-3">
                <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-finland" aria-hidden />
                  Address and special requests
                </p>
                <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">
                  {selectedBooking.special_requests || 'No special requests or address notes.'}
                </p>
              </div>
            </div>
          </div>

          {guideMeta ? (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-br from-slate-50/90 to-white">
                <h2 className="text-base font-semibold text-gray-900">Experience timing and location</h2>
              </div>
              <div className="p-5 sm:p-6 space-y-2 text-sm text-gray-800">
                {guideScheduleSummary(guideMeta) ? (
                  <>
                    <p>
                      <span className="text-gray-500">Duration:</span> {guideMeta.duration}
                    </p>
                    <p>
                      <span className="text-gray-500">Typical time / season:</span> {guideMeta.bestTime}
                    </p>
                    <p>
                      <span className="text-gray-500">Start location:</span> {guideMeta.startLocation}
                    </p>
                  </>
                ) : (
                  <p className="text-gray-600">
                    Add duration, typical time, and start location on the listing for clearer timing context.
                  </p>
                )}
                {guideMeta.defaultStartTime ? (
                  <p className="text-xs text-gray-600 pt-2 border-t border-gray-100">
                    Listing default start {guideMeta.defaultStartTime}. Assign pickup between {guideMeta.pickupWindowMin}–
                    {guideMeta.pickupWindowMax} minutes before.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {selectedBooking.status !== 'cancelled' && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-br from-slate-50/90 to-white">
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-finland" aria-hidden />
                  Times for this booking
                </h2>
                <p className="text-sm text-gray-600 mt-0.5">Adjust start and pickup if this instance differs from the listing default.</p>
              </div>
              <div className="p-5 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Start</label>
                    <input
                      type="time"
                      value={scheduleDraft.start}
                      onChange={(e) => setScheduleDraft((d) => ({ ...d, start: e.target.value }))}
                      disabled={!canEditBookings}
                      className={plannerInputClass()}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Pickup</label>
                    <input
                      type="time"
                      value={scheduleDraft.pickup}
                      onChange={(e) => setScheduleDraft((d) => ({ ...d, pickup: e.target.value }))}
                      disabled={!canEditBookings}
                      className={plannerInputClass()}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSaveScheduleTimes}
                  disabled={!canEditBookings || updatingId === selectedBooking.id}
                  className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-finland text-white text-sm font-semibold hover:bg-finland-dark disabled:opacity-50 transition-colors"
                >
                  {updatingId === selectedBooking.id ? 'Saving…' : 'Save times'}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-600">Meeting point</p>
              <p className="text-sm text-gray-800 mt-2">
                {meetingPoints[selectedBooking.listing_id] || (
                  <span className="text-amber-700 font-medium">Missing — edit on listing</span>
                )}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-600">Pickup instructions</p>
              <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">
                {pickupInstructions[selectedBooking.listing_id] || (
                  <span className="text-amber-700 font-medium">Missing — edit on listing</span>
                )}
              </p>
            </div>
          </div>

          {selectedBooking.status !== 'cancelled' && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 space-y-3">
              <p className="text-sm font-semibold text-amber-900">Cancel booking</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-amber-900 mb-1.5">Reason</label>
                  <select
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className={plannerInputClass()}
                  >
                    <option value="">Select reason</option>
                    {CANCELLATION_REASONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-amber-900 mb-1.5">Refund option</label>
                  <select
                    value={cancelRefund}
                    onChange={(e) => setCancelRefund(e.target.value as RefundChoice | '')}
                    className={plannerInputClass()}
                  >
                    <option value="">Choose refund option</option>
                    {REFUND_CHOICES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-gray-50/80 px-5 py-4 sm:px-6 space-y-3">
          <div className="flex flex-wrap gap-2">
            {selectedBooking.status !== 'cancelled' && (
              <>
                {!selectedBooking.acknowledged_at && (
                  <button
                    type="button"
                    disabled={!canEditBookings || updatingId === selectedBooking.id}
                    onClick={handleAcknowledgeSelected}
                    className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    Acknowledge
                  </button>
                )}
                {selectedBooking.status !== 'confirmed' && (
                  <button
                    type="button"
                    disabled={!canEditBookings || updatingId === selectedBooking.id}
                    onClick={handleConfirmSelected}
                    className="px-4 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                  >
                    Confirm
                  </button>
                )}
                <button
                  type="button"
                  disabled={!canEditBookings || updatingId === selectedBooking.id || !cancelReason}
                  onClick={handleCancelSelected}
                  className="px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60"
                >
                  Cancel booking
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => openSupplierBooking(selectedBooking.id)}
              className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Open in bookings
            </button>
            <button
              type="button"
              onClick={() => openSupplierListingEditor(selectedBooking.listing_id, 'meeting')}
              className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Edit meeting
            </button>
            <button
              type="button"
              onClick={() => openSupplierListingEditor(selectedBooking.listing_id, 'schedule')}
              className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Edit schedule
            </button>
            <button
              type="button"
              onClick={() => openSupplierListingEditor(selectedBooking.listing_id, 'pickup')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-finland text-white text-sm font-semibold hover:bg-finland-dark"
            >
              <ExternalLink className="w-4 h-4" aria-hidden />
              Edit pickup
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-finland/10 flex items-center justify-center flex-shrink-0">
            <ClipboardList className="w-6 h-6 text-finland" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">Pickup planner</h1>
            <p className="mt-1 text-sm text-gray-600 leading-relaxed">
              Plan guest pickups day by day. Filter your bookings, then open <strong className="font-semibold text-gray-800">Pickup details</strong> to set times and review meeting info.
            </p>
            {!canEditBookings && (
              <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Your role is {role}. You can view plans, but booking actions are restricted.
              </p>
            )}
          </div>
        </div>

        {!loading && listBookings.length > 0 && (
          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-gray-100 pt-5">
            <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-center">
              <p className="text-lg font-bold tabular-nums text-gray-900">{plannerStats.bookings}</p>
              <p className="text-[11px] font-medium text-gray-500">Bookings</p>
            </div>
            <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-center">
              <p className="text-lg font-bold tabular-nums text-gray-900">{plannerStats.guests}</p>
              <p className="text-[11px] font-medium text-gray-500">Guests</p>
            </div>
            <div className={`rounded-xl px-3 py-2.5 text-center ${plannerStats.needsPickup > 0 ? 'bg-amber-50' : 'bg-emerald-50/80'}`}>
              <p className={`text-lg font-bold tabular-nums ${plannerStats.needsPickup > 0 ? 'text-amber-900' : 'text-emerald-800'}`}>
                {plannerStats.needsPickup}
              </p>
              <p className={`text-[11px] font-medium ${plannerStats.needsPickup > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                Need pickup info
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm flex items-center justify-between gap-4">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </span>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-100 text-red-800 font-medium hover:bg-red-200"
          >
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </div>
      )}

      {actionFeedbackBanner}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 pt-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Filter className="h-3.5 w-3.5" aria-hidden />
            Filters
          </div>
          {!loading && listBookings.length > 0 && (
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </button>
          )}
        </div>

        <div className="p-4 sm:p-5 pt-3 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Listing</label>
              <select
                value={listingFilterId}
                onChange={(e) => setListingFilterId(e.target.value)}
                className={plannerInputClass()}
              >
                <option value="">All listings</option>
                {listingSelectOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={plannerInputClass()} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={plannerInputClass()} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Sort</label>
              <select
                value={sortDate}
                onChange={(e) => setSortDate(e.target.value as 'asc' | 'desc')}
                className={plannerInputClass()}
              >
                <option value="asc">Earliest first</option>
                <option value="desc">Latest first</option>
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-700 hover:border-amber-200 transition-colors sm:col-span-2">
              <input
                type="checkbox"
                checked={needsPickupOnly}
                onChange={(e) => setNeedsPickupOnly(e.target.checked)}
                className="rounded border-gray-300 text-finland focus:ring-finland"
              />
              <span>
                <span className="font-medium text-gray-900">Needs pickup details only</span>
                <span className="block text-xs text-gray-500">Show bookings missing meeting point or instructions</span>
              </span>
            </label>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4 animate-pulse">
          <div className="h-5 w-40 rounded-lg bg-gray-200" />
          <div className="space-y-3">
            <div className="h-24 rounded-2xl bg-gray-100" />
            <div className="h-24 rounded-2xl bg-gray-100" />
            <div className="h-24 rounded-2xl bg-gray-100" />
          </div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white py-14 text-center px-6 animate-scale-in">
          <ClipboardList className="mx-auto mb-3 h-12 w-12 text-gray-300" aria-hidden />
          <h2 className="text-lg font-semibold text-gray-900">No bookings match</h2>
          <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
            Widen the date range or clear listing filters. Cancelled bookings are hidden here.
          </p>
          <button
            type="button"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
            className="mt-5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Clear dates
          </button>
        </div>
      ) : listBookings.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white py-12 text-center px-6 animate-scale-in">
          <p className="text-base font-semibold text-gray-900">Nothing in this view</p>
          <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
            Clear the listing filter or turn off &quot;Needs pickup details only&quot; to see more bookings.
          </p>
          <button
            type="button"
            onClick={() => {
              setListingFilterId('');
              setNeedsPickupOnly(false);
              setSortDate('asc');
            }}
            className="mt-5 rounded-xl bg-finland px-4 py-2.5 text-sm font-semibold text-white hover:bg-finland-dark"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-4 animate-fade-in">
          {bookingsGroupedByDate.orderedKeys.length === 0 && bookingsGroupedByDate.noDate.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
              No dated bookings in this filtered set.
            </div>
          ) : (
            <>
              {bookingsGroupedByDate.orderedKeys.map((ymd, sectionIndex) => {
                const sectionOpen = dateSectionOpen[ymd] !== false;
                const dayRows = bookingsGroupedByDate.byDay.get(ymd) ?? [];
                const dayGuestTotal = dayRows.reduce((sum, b) => sum + Number(b.guests ?? 0), 0);
                const dayNeedsPickup = dayRows.filter((b) => needsPickupInfo(b.listing_id)).length;
                return (
                  <section
                    key={ymd}
                    className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"
                    style={{ animation: `fade-in-up 0.5s ease-out ${Math.min(sectionIndex, 4) * 0.06}s both` }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setDateSectionOpen((prev) => {
                          const open = prev[ymd] !== false;
                          return { ...prev, [ymd]: !open };
                        })
                      }
                      className="flex w-full items-center justify-between gap-3 px-4 py-3.5 sm:px-5 text-left bg-gradient-to-r from-slate-50/90 to-white hover:from-slate-100/80 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{formatPickupSectionDate(ymd)}</p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {dayRows.length} booking{dayRows.length === 1 ? '' : 's'} · {dayGuestTotal} guest
                          {dayGuestTotal === 1 ? '' : 's'}
                          {dayNeedsPickup > 0 ? (
                            <span className="text-amber-700 font-medium"> · {dayNeedsPickup} need pickup info</span>
                          ) : null}
                        </p>
                      </div>
                      <ChevronDown
                        className={`h-5 w-5 shrink-0 text-gray-400 transition-transform duration-300 ease-out ${
                          sectionOpen ? 'rotate-0' : '-rotate-90'
                        }`}
                        aria-hidden
                      />
                    </button>
                    <div
                      className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                        sectionOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="space-y-3 border-t border-gray-100 p-4 sm:p-5">
                          {dayRows.map((b) => {
                            const missing = needsPickupInfo(b.listing_id);
                            const hrs = hoursUntilBookingDayStart(b.booking_date);
                            const urgentSoon = hrs !== null && hrs > 0 && hrs <= 24 && missing;
                            return (
                              <PlannerBookingCard
                                key={b.id}
                                booking={b}
                                listingTitle={listingTitles[b.listing_id] ?? 'Listing'}
                                guideMeta={listingGuideMeta[b.listing_id]}
                                missingPickup={missing}
                                urgentSoon={urgentSoon}
                                onOpen={() => setSelectedBookingId(b.id)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </section>
                );
              })}
              {bookingsGroupedByDate.noDate.length > 0 && (
                <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() =>
                      setDateSectionOpen((prev) => {
                        const k = '__nodate';
                        const open = prev[k] !== false;
                        return { ...prev, [k]: !open };
                      })
                    }
                    className="flex w-full items-center justify-between gap-3 px-4 py-3.5 sm:px-5 text-left bg-gradient-to-r from-slate-50/90 to-white hover:from-slate-100/80 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-900">No activity date</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {bookingsGroupedByDate.noDate.length} booking{bookingsGroupedByDate.noDate.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-gray-400 transition-transform duration-300 ease-out ${
                        dateSectionOpen.__nodate !== false ? 'rotate-0' : '-rotate-90'
                      }`}
                      aria-hidden
                    />
                  </button>
                  <div
                    className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                      dateSectionOpen.__nodate !== false ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="space-y-3 border-t border-gray-100 p-4 sm:p-5">
                        {bookingsGroupedByDate.noDate.map((b) => (
                          <PlannerBookingCard
                            key={b.id}
                            booking={b}
                            listingTitle={listingTitles[b.listing_id] ?? 'Listing'}
                            guideMeta={listingGuideMeta[b.listing_id]}
                            missingPickup={needsPickupInfo(b.listing_id)}
                            onOpen={() => setSelectedBookingId(b.id)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

    </div>
  );
}
