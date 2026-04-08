/**
 * Supplier: pickup planner – bookings with meeting / pickup, filters, CSV, deep link to edit listing pickup fields.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ClipboardList,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Download,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Info,
  MapPin,
  Users,
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

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type PlannerView = 'table' | 'calendar';
type CalendarRange = 'day' | 'week';

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

function startOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() + n);
  return copy;
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
  const [view, setView] = useState<PlannerView>('table');
  const prevViewRef = useRef<PlannerView>('table');
  const [calendarRange, setCalendarRange] = useState<CalendarRange>('week');
  const [calendarAnchorDate, setCalendarAnchorDate] = useState<string>(toYmd(new Date()));
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

  const setPreset = (preset: 'today' | 'week' | 'month' | 'clear') => {
    if (preset === 'clear') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    const now = new Date();
    if (preset === 'today') {
      const s = toYmd(now);
      setDateFrom(s);
      setDateTo(s);
      return;
    }
    if (preset === 'week') {
      setDateFrom(toYmd(now));
      const end = new Date(now);
      end.setDate(end.getDate() + 7);
      setDateTo(toYmd(end));
      return;
    }
    setDateFrom(toYmd(now));
    const end = new Date(now);
    end.setDate(end.getDate() + 30);
    setDateTo(toYmd(end));
  };

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

  const effectiveCalendarDate = useMemo(
    () => parseYmdLocal(calendarAnchorDate) ?? new Date(),
    [calendarAnchorDate]
  );

  const calendarDates = useMemo(() => {
    if (calendarRange === 'day') {
      return [new Date(effectiveCalendarDate.getFullYear(), effectiveCalendarDate.getMonth(), effectiveCalendarDate.getDate())];
    }
    const start = startOfWeek(effectiveCalendarDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [calendarRange, effectiveCalendarDate]);

  const calendarBookingsByDate = useMemo(() => {
    const byDate: Record<string, BookingRow[]> = {};
    calendarDates.forEach((d) => {
      byDate[toYmd(d)] = [];
    });
    for (const b of listBookings) {
      if (!b.booking_date) continue;
      if (byDate[b.booking_date]) byDate[b.booking_date].push(b);
    }
    Object.keys(byDate).forEach((k) => {
      byDate[k].sort(
        (a, b) => a.created_at.localeCompare(b.created_at)
      );
    });
    return byDate;
  }, [calendarDates, listBookings]);

  /** When switching to Calendar, jump the visible week/day if no bookings fall in the current range (common “toggle does nothing” case). */
  useEffect(() => {
    const prev = prevViewRef.current;
    prevViewRef.current = view;
    if (prev === 'calendar' || view !== 'calendar' || listBookings.length === 0) return;

    const dated = listBookings
      .map((b) => b.booking_date)
      .filter((d): d is string => !!d)
      .sort();
    if (dated.length === 0) return;

    const anchor = parseYmdLocal(calendarAnchorDate) ?? new Date();
    let rangeStartYmd: string;
    let rangeEndYmd: string;
    if (calendarRange === 'day') {
      rangeStartYmd = toYmd(anchor);
      rangeEndYmd = rangeStartYmd;
    } else {
      const wk = startOfWeek(anchor);
      rangeStartYmd = toYmd(wk);
      rangeEndYmd = toYmd(addDays(wk, 6));
    }

    const hasInRange = dated.some((d) => d >= rangeStartYmd && d <= rangeEndYmd);
    if (!hasInRange) {
      setCalendarAnchorDate(dated[0]);
    }
  }, [view, listBookings, calendarRange, calendarAnchorDate]);

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

  const shiftCalendar = (direction: -1 | 1) => {
    const anchor = parseYmdLocal(calendarAnchorDate) ?? new Date();
    const delta = calendarRange === 'day' ? 1 : 7;
    setCalendarAnchorDate(toYmd(addDays(anchor, direction * delta)));
  };

  const jumpCalendarToday = () => {
    setCalendarAnchorDate(toYmd(new Date()));
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
    }
    setUpdatingId(null);
  };

  const calendarLabel = useMemo(() => {
    if (calendarRange === 'day') {
      return effectiveCalendarDate.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
    const first = calendarDates[0];
    const last = calendarDates[calendarDates.length - 1];
    const firstLabel = first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const lastLabel = last.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${firstLabel} - ${lastLabel}`;
  }, [calendarDates, calendarRange, effectiveCalendarDate]);

  if (!user) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">Pickup planner</h1>
        <p className="mt-0.5 text-sm text-gray-600">
          Filter by date and listing, then use <strong>Pickup details</strong> on each booking to manage guest contact, pickup
          times, and meeting information for that customer.
        </p>
        {!canEditBookings && (
          <p className="mt-1 text-xs text-amber-700">
            Your role is {role}. You can view pickup plans, but booking status actions are restricted.
          </p>
        )}
      </div>

      <div className="flex gap-2.5 rounded-lg border border-sky-200/80 bg-sky-50/90 px-3 py-2 text-sm text-sky-950">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden />
        <p>
          Only bookings that match your filters below are shown. Meeting point and pickup instructions are shared across
          all bookings on the same listing.
        </p>
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

      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
            <button
              type="button"
              onClick={() => setView('table')}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'table' ? 'bg-white text-finland shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setView('calendar')}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'calendar' ? 'bg-white text-finland shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <CalendarDays className="h-4 w-4" />
              Calendar
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!loading && (
              <>
                {listBookings.length > 0 && (
                  <button
                    type="button"
                    onClick={exportCsv}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="h-4 w-4" />
                    Export CSV
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2 border-t border-gray-100 pt-3">
          <div>
            <label className="block text-xs font-medium text-gray-500">Listing</label>
            <select
              value={listingFilterId}
              onChange={(e) => setListingFilterId(e.target.value)}
              className="mt-0.5 min-w-[11rem] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:ring-2 focus:ring-finland"
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
            <label className="block text-xs font-medium text-gray-500">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-0.5 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-finland"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-0.5 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-finland"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 pb-1 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={needsPickupOnly}
              onChange={(e) => setNeedsPickupOnly(e.target.checked)}
              className="rounded border-gray-300 text-finland focus:ring-finland"
            />
            Needs pickup details
          </label>
          <div>
            <label className="block text-xs font-medium text-gray-500">Sort by date</label>
            <select
              value={sortDate}
              onChange={(e) => setSortDate(e.target.value as 'asc' | 'desc')}
              className="mt-0.5 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:ring-2 focus:ring-finland"
            >
              <option value="asc">Earliest first</option>
              <option value="desc">Latest first</option>
            </select>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-50 pt-2 text-xs text-gray-500">
          <span className="font-medium text-gray-600">Quick range</span>
          <button
            type="button"
            onClick={() => setPreset('today')}
            className="rounded border border-gray-200 px-2 py-1 text-gray-700 hover:bg-gray-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setPreset('week')}
            className="rounded border border-gray-200 px-2 py-1 text-gray-700 hover:bg-gray-50"
          >
            +7 days
          </button>
          <button
            type="button"
            onClick={() => setPreset('month')}
            className="rounded border border-gray-200 px-2 py-1 text-gray-700 hover:bg-gray-50"
          >
            +30 days
          </button>
          <button
            type="button"
            onClick={() => setPreset('clear')}
            className="rounded border border-gray-200 px-2 py-1 text-gray-500 hover:bg-gray-50"
          >
            All dates
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      ) : view === 'calendar' ? (
        sorted.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <ClipboardList className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-900">No bookings match</h2>
          <p className="mt-1 text-sm text-gray-500">
            Try widening the date range or adjusting listing filters. Bookings without an activity date are hidden when a date
            range is set. Cancelled bookings are excluded here.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex flex-wrap items-center gap-2 justify-between">
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white">
              <button
                type="button"
                onClick={() => setCalendarRange('day')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                  calendarRange === 'day' ? 'bg-finland/10 text-finland' : 'text-gray-600'
                }`}
              >
                Day
              </button>
              <button
                type="button"
                onClick={() => setCalendarRange('week')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                  calendarRange === 'week' ? 'bg-finland/10 text-finland' : 'text-gray-600'
                }`}
              >
                Week
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => shiftCalendar(-1)}
                className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100"
                aria-label="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <p className="text-sm font-medium text-gray-800 min-w-[13rem] text-center">{calendarLabel}</p>
              <button
                type="button"
                onClick={() => shiftCalendar(1)}
                className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100"
                aria-label="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={jumpCalendarToday}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-100"
              >
                Today
              </button>
            </div>
          </div>
          <div className={`grid gap-3 p-4 ${calendarRange === 'day' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4'}`}>
            {calendarDates.map((d) => {
              const key = toYmd(d);
              const dayBookings = calendarBookingsByDate[key] ?? [];
              const dayGuests = dayBookings.reduce((sum, b) => sum + Number(b.guests ?? 0), 0);
              const pickupGaps = dayBookings.filter((b) => needsPickupInfo(b.listing_id)).length;
              const dayName = d.toLocaleDateString(undefined, { weekday: 'short' });
              const dayNumber = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              return (
                <section key={key} className="border border-gray-200 rounded-lg overflow-hidden">
                  <header className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-800">{dayName}</p>
                      <p className="text-xs text-gray-500">{dayNumber}</p>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      {dayBookings.length} booking{dayBookings.length === 1 ? '' : 's'} · {dayGuests} guest{dayGuests === 1 ? '' : 's'}
                      {pickupGaps > 0 ? (
                        <span className="text-amber-700 font-medium"> · {pickupGaps} missing pickup/meeting</span>
                      ) : null}
                    </p>
                  </header>
                  <div className="p-2 space-y-2 min-h-20">
                    {dayBookings.length === 0 ? (
                      <p className="text-xs text-gray-400 px-1 py-2">No bookings</p>
                    ) : (
                      dayBookings.map((b) => {
                        const spots = Number(b.guests ?? 0);
                        return (
                          <div
                            key={b.id}
                            className={`flex items-stretch gap-2 rounded-md border px-2 py-2 ${
                              needsPickupInfo(b.listing_id)
                                ? 'border-amber-200 bg-amber-50'
                                : 'border-gray-200 bg-white'
                            }`}
                          >
                            <div className="min-w-0 flex-1 text-left">
                              <p className="text-xs font-semibold text-gray-800 truncate">
                                {listingTitles[b.listing_id] ?? 'Listing'}
                              </p>
                              <p className="text-xs text-gray-600 truncate">
                                {b.guest_name ?? b.guest_email ?? 'Guest'}
                              </p>
                              <p className="text-xs text-gray-800 mt-0.5">
                                <span className="font-semibold tabular-nums">{spots}</span> spot{spots === 1 ? '' : 's'} booked
                              </p>
                              <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                                {meetingPoints[b.listing_id] || 'Meeting point missing'}
                              </p>
                              {bookingTimesLine(b) ? (
                                <p className="text-[11px] text-finland/90 font-medium mt-0.5 truncate">{bookingTimesLine(b)}</p>
                              ) : null}
                              {guideScheduleSummary(listingGuideMeta[b.listing_id]) ? (
                                <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                                  {guideScheduleSummary(listingGuideMeta[b.listing_id])}
                                </p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedBookingId(b.id)}
                              className="shrink-0 self-center rounded-md bg-finland px-2 py-1.5 text-[11px] font-medium text-white hover:bg-finland-dark"
                            >
                              Pickup details
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
        )
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <ClipboardList className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-900">No bookings match</h2>
          <p className="mt-1 text-sm text-gray-500">
            Try widening the date range or adjusting listing filters. Bookings without an activity date are hidden when a date
            range is set. Cancelled bookings are excluded here.
          </p>
        </div>
      ) : listBookings.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-10 text-center">
          <p className="text-sm font-medium text-gray-900">Nothing in this view</p>
          <p className="mt-1 px-4 text-sm text-gray-500">
            Clear the listing filter or uncheck &quot;Needs pickup details&quot; to see all rows that match your dates.
          </p>
          <button
            type="button"
            onClick={() => {
              setListingFilterId('');
              setNeedsPickupOnly(false);
              setSortDate('asc');
            }}
            className="mt-4 px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Clear quick filters
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {bookingsGroupedByDate.orderedKeys.length === 0 && bookingsGroupedByDate.noDate.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">No dated bookings in this filtered set.</div>
          ) : (
            <>
              {bookingsGroupedByDate.orderedKeys.map((ymd) => {
                const sectionOpen = dateSectionOpen[ymd] !== false;
                const dayRows = bookingsGroupedByDate.byDay.get(ymd) ?? [];
                const dayGuestTotal = dayRows.reduce((sum, b) => sum + Number(b.guests ?? 0), 0);
                return (
                  <div key={ymd} className="border-b border-gray-100 last:border-b-0">
                    <button
                      type="button"
                      onClick={() =>
                        setDateSectionOpen((prev) => {
                          const open = prev[ymd] !== false;
                          return { ...prev, [ymd]: !open };
                        })
                      }
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50/80"
                    >
                      <span className="text-sm font-semibold text-gray-900">{formatPickupSectionDate(ymd)}</span>
                      <span className="flex items-center gap-2 text-xs text-gray-500">
                        {dayRows.length} booking{dayRows.length === 1 ? '' : 's'} · {dayGuestTotal} guest
                        {dayGuestTotal === 1 ? '' : 's'}
                        <ChevronDown
                          className={`h-4 w-4 text-gray-400 transition-transform ${sectionOpen ? 'rotate-0' : '-rotate-90'}`}
                        />
                      </span>
                    </button>
                    {sectionOpen && (
                      <ul className="divide-y divide-gray-100 border-t border-gray-50">
                        {dayRows.map((b) => {
                          const missing = needsPickupInfo(b.listing_id);
                          const hrs = hoursUntilBookingDayStart(b.booking_date);
                          const urgentSoon = hrs !== null && hrs > 0 && hrs <= 24 && missing;
                          const guestsN = Number(b.guests ?? 0);
                          const activityParsed = b.booking_date ? parseYmdLocal(b.booking_date) : null;
                          const actDate = activityParsed
                            ? activityParsed.toLocaleDateString(undefined, {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })
                            : null;
                          return (
                            <li
                              key={b.id}
                              className={`flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${
                                missing ? 'bg-amber-50/30' : ''
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                {urgentSoon && (
                                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-red-700">
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                    Starting within 24 hours — meeting or pickup details still incomplete
                                  </p>
                                )}
                                {!urgentSoon && missing && (
                                  <p className="mb-1 text-xs font-medium text-amber-800">
                                    Pickup or meeting copy incomplete for this listing
                                  </p>
                                )}
                                <p className="truncate text-sm font-semibold text-gray-900">
                                  {listingTitles[b.listing_id] ?? 'Listing'}
                                </p>
                                {guideScheduleSummary(listingGuideMeta[b.listing_id]) ? (
                                  <p className="truncate text-xs text-gray-500">
                                    {guideScheduleSummary(listingGuideMeta[b.listing_id])}
                                  </p>
                                ) : null}
                                {bookingTimesLine(b) ? (
                                  <p className="truncate text-xs text-finland/90 font-medium">{bookingTimesLine(b)}</p>
                                ) : null}
                                <p className="truncate text-xs text-gray-500">
                                  {b.guest_name ?? b.guest_email ?? 'Guest'}
                                  {actDate ? <> · {actDate}</> : null} · <span className="capitalize">{b.status}</span>
                                </p>
                                <p className="mt-1 text-sm text-gray-800">
                                  <span className="font-semibold tabular-nums">{guestsN}</span> spot
                                  {guestsN === 1 ? '' : 's'} booked
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center">
                                <button
                                  type="button"
                                  onClick={() => setSelectedBookingId(b.id)}
                                  className="rounded-lg bg-finland px-3 py-2 text-sm font-medium text-white hover:bg-finland-dark"
                                >
                                  Pickup details
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
              {bookingsGroupedByDate.noDate.length > 0 && (
                <div className="border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() =>
                      setDateSectionOpen((prev) => {
                        const k = '__nodate';
                        const open = prev[k] !== false;
                        return { ...prev, [k]: !open };
                      })
                    }
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50/80"
                  >
                    <span className="text-sm font-semibold text-gray-900">No activity date</span>
                    <span className="flex items-center gap-2 text-xs text-gray-500">
                      {bookingsGroupedByDate.noDate.length} booking{bookingsGroupedByDate.noDate.length === 1 ? '' : 's'}
                      <ChevronDown
                        className={`h-4 w-4 text-gray-400 transition-transform ${
                          dateSectionOpen.__nodate !== false ? 'rotate-0' : '-rotate-90'
                        }`}
                      />
                    </span>
                  </button>
                  {dateSectionOpen.__nodate !== false && (
                    <ul className="divide-y divide-gray-100 border-t border-gray-50">
                      {bookingsGroupedByDate.noDate.map((b) => {
                        const missing = needsPickupInfo(b.listing_id);
                        const guestsN = Number(b.guests ?? 0);
                        return (
                          <li
                            key={b.id}
                            className={`flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${
                              missing ? 'bg-amber-50/30' : ''
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              {missing && (
                                <p className="mb-1 text-xs font-medium text-amber-800">
                                  Pickup or meeting copy incomplete for this listing
                                </p>
                              )}
                              <p className="truncate text-sm font-semibold text-gray-900">
                                {listingTitles[b.listing_id] ?? 'Listing'}
                              </p>
                              {guideScheduleSummary(listingGuideMeta[b.listing_id]) ? (
                                <p className="truncate text-xs text-gray-500">
                                  {guideScheduleSummary(listingGuideMeta[b.listing_id])}
                                </p>
                              ) : null}
                              {bookingTimesLine(b) ? (
                                <p className="truncate text-xs text-finland/90 font-medium">{bookingTimesLine(b)}</p>
                              ) : null}
                              <p className="truncate text-xs text-gray-500">
                                {b.guest_name ?? b.guest_email ?? 'Guest'} ·{' '}
                                <span className="capitalize">{b.status}</span>
                              </p>
                              <p className="mt-1 text-sm text-gray-800">
                                <span className="font-semibold tabular-nums">{guestsN}</span> spot
                                {guestsN === 1 ? '' : 's'} booked
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center">
                              <button
                                type="button"
                                onClick={() => setSelectedBookingId(b.id)}
                                className="rounded-lg bg-finland px-3 py-2 text-sm font-medium text-white hover:bg-finland-dark"
                              >
                                Pickup details
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {selectedBooking && (
        <>
          <button
            type="button"
            onClick={() => setSelectedBookingId(null)}
            className="fixed inset-0 bg-black/30 z-40 cursor-default"
            aria-label="Close pickup details"
          />
          <aside className="fixed right-0 top-0 h-full w-full sm:w-[28rem] bg-white border-l border-gray-200 shadow-xl z-50 flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Pickup details</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Guest contact, pickup times, and meeting info for this booking.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBookingId(null)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 shrink-0"
                aria-label="Close pickup details"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-5 overflow-y-auto">
              <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  Customer
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {selectedBooking.guest_name ?? selectedBooking.guest_email ?? '—'}
                </p>
                {selectedBooking.guest_name && selectedBooking.guest_email ? (
                  <p className="text-sm text-gray-600 break-all">{selectedBooking.guest_email}</p>
                ) : null}
                <p className="text-sm text-gray-800">
                  <span className="font-semibold tabular-nums">{selectedBooking.guests ?? '—'}</span> spot
                  {Number(selectedBooking.guests ?? 0) === 1 ? '' : 's'} booked
                </p>
                <div className="pt-1 border-t border-gray-200/80">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mt-2">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    Address and special requests
                  </p>
                  <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">
                    {selectedBooking.special_requests || 'No special requests or address notes.'}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tour / listing</p>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  {listingTitles[selectedBooking.listing_id] ?? '—'}
                </p>
              </div>
              {listingGuideMeta[selectedBooking.listing_id] ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 space-y-1.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Experience timing and location</p>
                  {guideScheduleSummary(listingGuideMeta[selectedBooking.listing_id]) ? (
                    <>
                      <p className="text-sm text-gray-800">
                        <span className="text-gray-500">Duration:</span>{' '}
                        {listingGuideMeta[selectedBooking.listing_id].duration}
                      </p>
                      <p className="text-sm text-gray-800">
                        <span className="text-gray-500">Typical time / season:</span>{' '}
                        {listingGuideMeta[selectedBooking.listing_id].bestTime}
                      </p>
                      <p className="text-sm text-gray-800">
                        <span className="text-gray-500">Start location:</span>{' '}
                        {listingGuideMeta[selectedBooking.listing_id].startLocation}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-600">
                      Add duration, typical time, and start location on the listing so timing context is clear for this tour.
                    </p>
                  )}
                  {listingGuideMeta[selectedBooking.listing_id].defaultStartTime ? (
                    <p className="text-[11px] text-gray-600 pt-1 border-t border-gray-200/80">
                      Listing default start {listingGuideMeta[selectedBooking.listing_id].defaultStartTime}. Assign guest
                      pickup between{' '}
                      {listingGuideMeta[selectedBooking.listing_id].pickupWindowMin}–
                      {listingGuideMeta[selectedBooking.listing_id].pickupWindowMax} minutes before that time.
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-500 pt-1 border-t border-gray-200/80">
                      Set a default start time and pickup window on the listing to standardize timing across bookings.
                    </p>
                  )}
                </div>
              ) : null}
              {selectedBooking.status !== 'cancelled' && (
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-3 space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">This booking — times</p>
                  <p className="text-[11px] text-gray-500">
                    Start time is copied from the listing when the booking is created; adjust here if this instance differs.
                    Set pickup once you know where the guest is staying.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Start</label>
                      <input
                        type="time"
                        value={scheduleDraft.start}
                        onChange={(e) => setScheduleDraft((d) => ({ ...d, start: e.target.value }))}
                        disabled={!canEditBookings}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-finland disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Pickup</label>
                      <input
                        type="time"
                        value={scheduleDraft.pickup}
                        onChange={(e) => setScheduleDraft((d) => ({ ...d, pickup: e.target.value }))}
                        disabled={!canEditBookings}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-finland disabled:opacity-60"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveScheduleTimes}
                    disabled={!canEditBookings || updatingId === selectedBooking.id}
                    className="w-full sm:w-auto px-3 py-2 rounded-lg bg-finland text-white text-sm font-medium hover:bg-finland-dark disabled:opacity-50"
                  >
                    {updatingId === selectedBooking.id ? 'Saving…' : 'Save times'}
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Activity date</p>
                  <p className="text-sm text-gray-800 mt-1">
                    {selectedBooking.booking_date ? new Date(selectedBooking.booking_date).toLocaleDateString() : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</p>
                  <p className="text-sm text-gray-800 mt-1 capitalize">{selectedBooking.status}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Meeting point</p>
                <p className="text-sm text-gray-800 mt-1">
                  {meetingPoints[selectedBooking.listing_id] || 'Missing'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pickup instructions (listing)</p>
                <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">
                  {pickupInstructions[selectedBooking.listing_id] || 'Missing'}
                </p>
              </div>
              {selectedBooking.status !== 'cancelled' && (
                <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-3 space-y-3">
                  <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
                    Cancel booking
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-amber-900 mb-1">Reason</label>
                    <select
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-white text-sm"
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
                    <label className="block text-xs font-medium text-amber-900 mb-1">Refund option</label>
                    <select
                      value={cancelRefund}
                      onChange={(e) => setCancelRefund(e.target.value as RefundChoice | '')}
                      className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-white text-sm"
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
              )}
            </div>
            <div className="mt-auto p-4 border-t border-gray-200 bg-gray-50 flex items-center gap-2 justify-end">
              {selectedBooking.status !== 'cancelled' && (
                <>
                  {!selectedBooking.acknowledged_at && (
                    <button
                      type="button"
                      disabled={!canEditBookings || updatingId === selectedBooking.id}
                      onClick={handleAcknowledgeSelected}
                      className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                    >
                      Acknowledge
                    </button>
                  )}
                  {selectedBooking.status !== 'confirmed' && (
                    <button
                      type="button"
                      disabled={!canEditBookings || updatingId === selectedBooking.id}
                      onClick={handleConfirmSelected}
                      className="px-3 py-2 rounded-lg border border-green-300 bg-green-50 text-sm text-green-800 hover:bg-green-100 disabled:opacity-60"
                    >
                      Confirm
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!canEditBookings || updatingId === selectedBooking.id || !cancelReason}
                    onClick={handleCancelSelected}
                    className="px-3 py-2 rounded-lg border border-red-300 bg-red-50 text-sm text-red-800 hover:bg-red-100 disabled:opacity-60"
                  >
                    Cancel booking
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => openSupplierBooking(selectedBooking.id)}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
              >
                Open in bookings
              </button>
              <button
                type="button"
                onClick={() => openSupplierListingEditor(selectedBooking.listing_id, 'meeting')}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
              >
                Edit meeting
              </button>
              <button
                type="button"
                onClick={() => openSupplierListingEditor(selectedBooking.listing_id, 'schedule')}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
              >
                Edit listing schedule
              </button>
              <button
                type="button"
                onClick={() => openSupplierListingEditor(selectedBooking.listing_id, 'pickup')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-finland text-white text-sm font-medium hover:bg-finland-dark"
              >
                <ExternalLink className="w-4 h-4" />
                Edit pickup
              </button>
            </div>
          </aside>
        </>
      )}

    </div>
  );
}
