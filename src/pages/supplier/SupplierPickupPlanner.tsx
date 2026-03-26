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
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Printer,
  Info,
} from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import {
  fetchBookingsForSupplier,
  updateBookingStatus,
  acknowledgeBooking,
} from '../../data/supabase-bookings';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchListingById } from '../../data/supabase-listings';
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

type StatusFilter = 'active' | 'confirmed' | 'pending';
type PlannerView = 'table' | 'calendar';
type CalendarRange = 'day' | 'week';
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

function isSameYmd(a: string | null | undefined, b: string): boolean {
  return !!a && a === b;
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

export default function SupplierPickupPlanner() {
  const { user, isSupabase } = useSupplierAuth();
  const { role } = useSupplierRole();
  const canEditBookings = canManageBookings(role);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [listingTitles, setListingTitles] = useState<Record<string, string>>({});
  const [meetingPoints, setMeetingPoints] = useState<Record<string, string>>({});
  const [pickupInstructions, setPickupInstructions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [view, setView] = useState<PlannerView>('table');
  const [calendarRange, setCalendarRange] = useState<CalendarRange>('week');
  const [calendarAnchorDate, setCalendarAnchorDate] = useState<string>(toYmd(new Date()));
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [manifestOpen, setManifestOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelRefund, setCancelRefund] = useState<RefundChoice | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [listingFilterId, setListingFilterId] = useState('');
  const [needsPickupOnly, setNeedsPickupOnly] = useState(false);
  const [sortDate, setSortDate] = useState<'asc' | 'desc'>('asc');
  const [dateSectionOpen, setDateSectionOpen] = useState<Record<string, boolean>>({});

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
      listings.forEach((l) => {
        titles[l.id] = l.title;
      });
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

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (statusFilter === 'active' && b.status === 'cancelled') return false;
      if (statusFilter === 'confirmed' && b.status !== 'confirmed') return false;
      if (statusFilter === 'pending' && b.status !== 'pending') return false;

      const bd = b.booking_date;
      if (dateFrom && bd && bd < dateFrom) return false;
      if (dateTo && bd && bd > dateTo) return false;
      if ((dateFrom || dateTo) && !bd) return false;
      return true;
    });
  }, [bookings, dateFrom, dateTo, statusFilter]);

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

  const selectedBooking = useMemo(
    () => sorted.find((b) => b.id === selectedBookingId) ?? null,
    [sorted, selectedBookingId]
  );

  const runSheetGroups = useMemo(() => {
    const groups: Record<string, Record<string, BookingRow[]>> = {};
    for (const b of listBookings) {
      if (b.status === 'cancelled' || !b.booking_date) continue;
      const date = b.booking_date;
      const listingId = b.listing_id;
      if (!groups[date]) groups[date] = {};
      if (!groups[date][listingId]) groups[date][listingId] = [];
      groups[date][listingId].push(b);
    }
    Object.keys(groups).forEach((d) => {
      Object.keys(groups[d]).forEach((l) => {
        groups[d][l].sort((a, b) => a.created_at.localeCompare(b.created_at));
      });
    });
    return groups;
  }, [listBookings]);

  const runSheetDates = useMemo(
    () => Object.keys(runSheetGroups).sort((a, b) => a.localeCompare(b)),
    [runSheetGroups]
  );

  const operationalInsights = useMemo(() => {
    const today = new Date();
    const tomorrowYmd = toYmd(addDays(today, 1));
    const next7Ymd = toYmd(addDays(today, 7));

    const upcoming = sorted.filter(
      (b) =>
        b.status !== 'cancelled' &&
        !!b.booking_date &&
        (b.booking_date as string) >= toYmd(today) &&
        (b.booking_date as string) <= next7Ymd
    );

    const tomorrow = upcoming.filter((b) => isSameYmd(b.booking_date, tomorrowYmd));
    const missingPickupTomorrow = tomorrow.filter((b) => needsPickupInfo(b.listing_id));
    const pendingTomorrow = tomorrow.filter((b) => b.status === 'pending');
    const unacknowledged = upcoming.filter((b) => !b.acknowledged_at);

    const sameDayListingCounts: Record<string, number> = {};
    for (const b of upcoming) {
      if (!b.booking_date) continue;
      const key = `${b.booking_date}:${b.listing_id}`;
      sameDayListingCounts[key] = (sameDayListingCounts[key] ?? 0) + 1;
    }
    const heavyDays = Object.entries(sameDayListingCounts)
      .filter(([, count]) => count >= 4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, count]) => {
        const [date, listingId] = key.split(':');
        return {
          date,
          listingId,
          listingTitle: listingTitles[listingId] ?? 'Listing',
          count,
        };
      });

    return {
      tomorrowYmd,
      upcomingCount: upcoming.length,
      tomorrowCount: tomorrow.length,
      missingPickupTomorrow,
      pendingTomorrow,
      unacknowledgedCount: unacknowledged.length,
      heavyDays,
    };
  }, [sorted, listingTitles, needsPickupInfo]);

  const conflictInsights = useMemo(() => {
    const bucket: Record<string, { bookingCount: number; guestCount: number; listingId: string; date: string; pendingCount: number; unackCount: number }> = {};
    for (const b of sorted) {
      if (b.status === 'cancelled' || !b.booking_date) continue;
      const key = `${b.booking_date}:${b.listing_id}`;
      if (!bucket[key]) {
        bucket[key] = {
          bookingCount: 0,
          guestCount: 0,
          listingId: b.listing_id,
          date: b.booking_date,
          pendingCount: 0,
          unackCount: 0,
        };
      }
      bucket[key].bookingCount += 1;
      bucket[key].guestCount += Number(b.guests || 0);
      if (b.status === 'pending') bucket[key].pendingCount += 1;
      if (!b.acknowledged_at) bucket[key].unackCount += 1;
    }
    const rows = Object.values(bucket)
      .map((r) => {
        const hasPickupGap =
          ((meetingPoints[r.listingId] ?? '').trim().length + (pickupInstructions[r.listingId] ?? '').trim().length) < 20;
        const guideCapacity = 12; // v3 baseline per guide/day
        const availableGuides = 2; // v3 baseline staffing assumption
        const capacityLimit = guideCapacity * availableGuides;
        const overCapacityGuests = Math.max(0, r.guestCount - capacityLimit);
        const pressureScore =
          (r.bookingCount >= 4 ? 1 : 0) +
          (r.guestCount >= 16 ? 1 : 0) +
          (hasPickupGap ? 1 : 0) +
          (r.pendingCount >= 2 ? 1 : 0) +
          (r.unackCount >= 2 ? 1 : 0) +
          (overCapacityGuests > 0 ? 1 : 0);
        const recommendation =
          overCapacityGuests > 0
            ? `Over capacity by ${overCapacityGuests} guests. Add guide capacity or split slot.`
            : hasPickupGap
              ? 'Complete meeting/pickup instructions before day starts.'
              : r.pendingCount >= 2
                ? 'Prioritize confirmations to reduce operational uncertainty.'
                : r.unackCount >= 2
                  ? 'Acknowledge bookings to clear ops queue.'
                  : 'Prepare run-sheet and meeting point briefing.';
        return {
          ...r,
          pressureScore,
          hasPickupGap,
          overCapacityGuests,
          recommendation,
          listingTitle: listingTitles[r.listingId] ?? 'Listing',
        };
      })
      .filter((r) => r.pressureScore > 0)
      .sort((a, b) => b.pressureScore - a.pressureScore || b.guestCount - a.guestCount)
      .slice(0, 10);
    return rows;
  }, [sorted, listingTitles, meetingPoints, pickupInstructions]);

  useEffect(() => {
    if (!selectedBookingId) {
      setCancelReason('');
      setCancelRefund('');
    }
  }, [selectedBookingId]);

  const exportCsv = () => {
    const headers = ['Date', 'Status', 'Listing', 'Guest', 'Guests', 'Meeting point', 'Pickup instructions'];
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = listBookings.map((b) =>
      [
        b.booking_date ?? '',
        b.status,
        listingTitles[b.listing_id] ?? '',
        b.guest_name ?? b.guest_email ?? '',
        String(b.guests ?? ''),
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

  const printRunSheet = () => {
    window.print();
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
          Scan bookings by activity date, then open a row for actions or jump to pickup fields on the listing.
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
            {listBookings.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={exportCsv}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => setManifestOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Printer className="h-4 w-4" />
                  Run-sheet
                </button>
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
          <div>
            <label className="block text-xs font-medium text-gray-500">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="mt-0.5 min-w-[9rem] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:ring-2 focus:ring-finland"
            >
              <option value="active">Active</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
            </select>
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

      <details className="group rounded-lg border border-gray-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
          <span>Readiness and capacity (next 7 days)</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 border-t border-gray-100 px-3 pb-3 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span>
              Tomorrow {new Date(operationalInsights.tomorrowYmd).toLocaleDateString(undefined, { dateStyle: 'medium' })}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-md border border-gray-200 px-2.5 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Upcoming</p>
              <p className="text-lg font-semibold text-gray-900">{operationalInsights.upcomingCount}</p>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50/50 px-2.5 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-amber-900">Pickup gaps (tomorrow)</p>
              <p className="text-lg font-semibold text-amber-950">{operationalInsights.missingPickupTomorrow.length}</p>
            </div>
            <div className="rounded-md border border-blue-200 bg-blue-50/50 px-2.5 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-blue-900">Pending (tomorrow)</p>
              <p className="text-lg font-semibold text-blue-950">{operationalInsights.pendingTomorrow.length}</p>
            </div>
            <div className="rounded-md border border-red-200 bg-red-50/50 px-2.5 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-red-900">Unacked (7d)</p>
              <p className="text-lg font-semibold text-red-950">{operationalInsights.unacknowledgedCount}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-md border border-gray-200 p-2.5">
              <h3 className="text-xs font-semibold text-gray-900">Tomorrow risk list</h3>
              {operationalInsights.missingPickupTomorrow.length === 0 &&
              operationalInsights.pendingTomorrow.length === 0 ? (
                <p className="mt-1 text-xs text-gray-500">No pickup or confirmation risks for tomorrow.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {operationalInsights.missingPickupTomorrow.slice(0, 6).map((b) => (
                    <li key={`m-${b.id}`} className="flex items-start justify-between gap-2 text-xs text-gray-700">
                      <span className="min-w-0 truncate">Pickup gap · {listingTitles[b.listing_id] ?? 'Listing'}</span>
                      <button
                        type="button"
                        onClick={() => openSupplierListingEditor(b.listing_id, 'pickup')}
                        className="shrink-0 text-finland hover:underline"
                      >
                        Fix
                      </button>
                    </li>
                  ))}
                  {operationalInsights.pendingTomorrow.slice(0, 6).map((b) => (
                    <li key={`p-${b.id}`} className="flex items-start justify-between gap-2 text-xs text-gray-700">
                      <span className="min-w-0 truncate">Pending · {listingTitles[b.listing_id] ?? 'Listing'}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedBookingId(b.id)}
                        className="shrink-0 text-finland hover:underline"
                      >
                        Open
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-md border border-gray-200 p-2.5">
              <h3 className="text-xs font-semibold text-gray-900">Capacity pressure</h3>
              {operationalInsights.heavyDays.length === 0 ? (
                <p className="mt-1 text-xs text-gray-500">No heavy listing/date clusters in the next week.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {operationalInsights.heavyDays.map((item) => (
                    <li
                      key={`${item.date}-${item.listingId}`}
                      className="flex items-start justify-between gap-2 text-xs text-gray-700"
                    >
                      <span className="min-w-0 truncate">
                        {new Date(item.date).toLocaleDateString()} · {item.listingTitle} · {item.count} bookings
                      </span>
                      <button
                        type="button"
                        onClick={() => openSupplierListingEditor(item.listingId, 'meeting')}
                        className="shrink-0 text-finland hover:underline"
                      >
                        Prepare
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Load signals</h3>
            {conflictInsights.length === 0 ? (
              <p className="text-xs text-gray-500">No pressure signals for the current date and status filters.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-gray-200">
                <table className="min-w-full text-xs">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Date</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Listing</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Bkgs</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Guests</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Note</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {conflictInsights.map((c) => (
                      <tr key={`${c.date}-${c.listingId}`} className="hover:bg-gray-50/60">
                        <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">
                          {new Date(c.date).toLocaleDateString()}
                        </td>
                        <td className="max-w-[10rem] truncate px-2 py-1.5 text-gray-900" title={c.listingTitle}>
                          {c.listingTitle}
                        </td>
                        <td className="px-2 py-1.5 text-gray-700">{c.bookingCount}</td>
                        <td className="px-2 py-1.5 text-gray-700">{c.guestCount}</td>
                        <td className="max-w-xs px-2 py-1.5 text-gray-600">
                          <span
                            className={`mr-1 inline-flex rounded px-1.5 py-0.5 font-medium ${
                              c.pressureScore >= 4
                                ? 'bg-red-100 text-red-800'
                                : c.pressureScore >= 2
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {c.pressureScore >= 4 ? 'High' : c.pressureScore >= 2 ? 'Med' : 'Low'}
                          </span>
                          {c.recommendation}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => openSupplierListingEditor(c.listingId, 'meeting')}
                            className="font-medium text-finland hover:underline"
                          >
                            Plan
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </details>

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <ClipboardList className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-900">No bookings match</h2>
          <p className="mt-1 text-sm text-gray-500">
            Try widening the date range or changing the status filter. Bookings without a tour date are hidden when a date
            range is set.
          </p>
        </div>
      ) : view === 'calendar' ? (
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
              const dayName = d.toLocaleDateString(undefined, { weekday: 'short' });
              const dayNumber = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              return (
                <section key={key} className="border border-gray-200 rounded-lg overflow-hidden">
                  <header className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-800">{dayName}</p>
                    <p className="text-xs text-gray-500">{dayNumber}</p>
                  </header>
                  <div className="p-2 space-y-2 min-h-20">
                    {dayBookings.length === 0 ? (
                      <p className="text-xs text-gray-400 px-1 py-2">No bookings</p>
                    ) : (
                      dayBookings.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedBookingId(b.id)}
                          className={`w-full text-left rounded-md border px-2.5 py-2 hover:shadow-sm transition-shadow ${
                            needsPickupInfo(b.listing_id)
                              ? 'border-amber-200 bg-amber-50'
                              : 'border-gray-200 bg-white'
                          }`}
                          title="Open booking details"
                        >
                          <p className="text-xs font-semibold text-gray-800 truncate">
                            {listingTitles[b.listing_id] ?? 'Listing'}
                          </p>
                          <p className="text-xs text-gray-600 truncate">
                            {b.guest_name ?? b.guest_email ?? 'Guest'} · {b.guests} guest{b.guests === 1 ? '' : 's'}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                            {meetingPoints[b.listing_id] || 'Meeting point missing'}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : listBookings.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-10 text-center">
          <p className="text-sm font-medium text-gray-900">Nothing in this view</p>
          <p className="mt-1 px-4 text-sm text-gray-500">
            Clear the listing filter or uncheck &quot;Needs pickup details&quot; to see all rows that match your dates and
            status.
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
                        {dayRows.length} booking{dayRows.length === 1 ? '' : 's'}
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
                                <p className="truncate text-xs text-gray-500">
                                  {b.guest_name ?? b.guest_email ?? 'Guest'} · {guestsN} guest{guestsN === 1 ? '' : 's'} ·{' '}
                                  <span className="capitalize">{b.status}</span>
                                  {actDate ? <> · {actDate}</> : null}
                                </p>
                              </div>
                              <div className="flex shrink-0 flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedBookingId(b.id)}
                                  className="text-sm font-medium text-gray-700 hover:text-gray-900 hover:underline"
                                >
                                  Details
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openSupplierListingEditor(b.listing_id, 'pickup')}
                                  className="rounded-full border border-finland px-3 py-1 text-sm font-medium text-finland hover:bg-finland/5"
                                >
                                  {missing ? 'Add pickup details' : 'Edit pickup'}
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
                              <p className="truncate text-xs text-gray-500">
                                {b.guest_name ?? b.guest_email ?? 'Guest'} · {guestsN} guest{guestsN === 1 ? '' : 's'} ·{' '}
                                <span className="capitalize">{b.status}</span>
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedBookingId(b.id)}
                                className="text-sm font-medium text-gray-700 hover:text-gray-900 hover:underline"
                              >
                                Details
                              </button>
                              <button
                                type="button"
                                onClick={() => openSupplierListingEditor(b.listing_id, 'pickup')}
                                className="rounded-full border border-finland px-3 py-1 text-sm font-medium text-finland hover:bg-finland/5"
                              >
                                {missing ? 'Add pickup details' : 'Edit pickup'}
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
            aria-label="Close booking details"
          />
          <aside className="fixed right-0 top-0 h-full w-full sm:w-[26rem] bg-white border-l border-gray-200 shadow-xl z-50 flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Booking details</h2>
              <button
                type="button"
                onClick={() => setSelectedBookingId(null)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Close panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-5 overflow-y-auto">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Listing</p>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  {listingTitles[selectedBooking.listing_id] ?? '—'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</p>
                  <p className="text-sm text-gray-800 mt-1">
                    {selectedBooking.booking_date ? new Date(selectedBooking.booking_date).toLocaleDateString() : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</p>
                  <p className="text-sm text-gray-800 mt-1 capitalize">{selectedBooking.status}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Guest</p>
                  <p className="text-sm text-gray-800 mt-1">
                    {selectedBooking.guest_name ?? selectedBooking.guest_email ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Guests</p>
                  <p className="text-sm text-gray-800 mt-1">{selectedBooking.guests ?? '—'}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Meeting point</p>
                <p className="text-sm text-gray-800 mt-1">
                  {meetingPoints[selectedBooking.listing_id] || 'Missing'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pickup instructions</p>
                <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">
                  {pickupInstructions[selectedBooking.listing_id] || 'Missing'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Special requests</p>
                <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">
                  {selectedBooking.special_requests || '—'}
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

      {manifestOpen && (
        <>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #pickup-runsheet-print, #pickup-runsheet-print * { visibility: visible; }
              #pickup-runsheet-print { position: absolute; left: 0; top: 0; width: 100%; background: white; }
            }
          `}</style>
          <button
            type="button"
            onClick={() => setManifestOpen(false)}
            className="fixed inset-0 bg-black/40 z-50 cursor-default"
            aria-label="Close run-sheet"
          />
          <aside className="fixed right-0 top-0 h-full w-full lg:w-[56rem] bg-white border-l border-gray-200 shadow-xl z-[60] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Pickup run-sheet</h2>
                <p className="text-xs text-gray-500">
                  Grouped by date and listing. Print to paper or Save as PDF.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={printRunSheet}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <Printer className="w-4 h-4" />
                  Print / PDF
                </button>
                <button
                  type="button"
                  onClick={() => setManifestOpen(false)}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                  aria-label="Close run-sheet panel"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div id="pickup-runsheet-print" className="p-5 overflow-y-auto space-y-6">
              {runSheetDates.length === 0 ? (
                <p className="text-sm text-gray-500">No active dated bookings in current filters.</p>
              ) : (
                runSheetDates.map((date) => {
                  const byListing = runSheetGroups[date];
                  const listingIds = Object.keys(byListing);
                  return (
                    <section key={date} className="border border-gray-200 rounded-lg overflow-hidden">
                      <header className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                        <h3 className="text-base font-semibold text-gray-900">
                          {new Date(date).toLocaleDateString(undefined, {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </h3>
                        <span className="text-xs text-gray-500">
                          {listingIds.reduce((sum, id) => sum + byListing[id].length, 0)} bookings
                        </span>
                      </header>
                      <div className="divide-y divide-gray-200">
                        {listingIds.map((listingId) => {
                          const rows = byListing[listingId];
                          const totalGuests = rows.reduce((sum, b) => sum + Number(b.guests || 0), 0);
                          return (
                            <div key={listingId} className="p-4">
                              <div className="flex items-center justify-between gap-3 mb-2">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">
                                    {listingTitles[listingId] ?? 'Listing'}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    Meeting: {meetingPoints[listingId] || 'Missing'} · Pickup: {pickupInstructions[listingId] || 'Missing'}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-gray-500">Total guests</p>
                                  <p className="text-lg font-semibold text-gray-900">{totalGuests}</p>
                                </div>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                  <thead>
                                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                                      <th className="py-1.5 pr-3">Booking</th>
                                      <th className="py-1.5 pr-3">Guest</th>
                                      <th className="py-1.5 pr-3">Guests</th>
                                      <th className="py-1.5 pr-3">Status</th>
                                      <th className="py-1.5">Special requests</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((b) => (
                                      <tr key={b.id} className="border-b border-gray-100 last:border-b-0">
                                        <td className="py-1.5 pr-3 text-gray-600">{b.id.slice(0, 8)}</td>
                                        <td className="py-1.5 pr-3 text-gray-800">
                                          {b.guest_name ?? b.guest_email ?? '—'}
                                        </td>
                                        <td className="py-1.5 pr-3 text-gray-700">{b.guests ?? '—'}</td>
                                        <td className="py-1.5 pr-3 text-gray-700">{b.status}</td>
                                        <td className="py-1.5 text-gray-600">
                                          {b.special_requests || '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
