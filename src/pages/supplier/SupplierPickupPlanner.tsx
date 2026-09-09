/**
 * Supplier: pickup planner – bookings with meeting / pickup, filters, CSV, deep link to edit listing pickup fields.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertCircle,
  ExternalLink,
  Download,
  ChevronDown,
  ArrowLeft,
  CheckCircle2,
  CalendarDays,
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
import { SUPPLIER_PAGE_CLASS, SupplierEmptyState, SupplierPageHero } from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { partnerBookingIsLiveTrip, partnerBookingIsOperatingTrip, partnerBookingNeedsLook } from '../../lib/trip-views';
import { bookingIsStayNight, bookingNeedsPickupCopy } from '../../lib/pickup-completeness';
import { inventoryFamilyFromListing } from '../../lib/inventory';
import { partnerPickupAllowsForceCancel } from '../../lib/cancellation-policy';
import { PARTNER_CANCEL_REQUEST_REFUND_POLICY } from '../../lib/booking-confirmation-copy';
import NoticeCallout from '../../components/NoticeCallout';

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

const CANCELLATION_REASONS = [
  { id: 'customer_request', label: 'Customer requested cancellation' },
  { id: 'force_majeure', label: 'Force majeure' },
  { id: 'operational', label: 'Operational reasons' },
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
  return 'tv-input';
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
    <button
      type="button"
      onClick={onOpen}
      className="lux-flat w-full py-4 text-left"
    >
      {urgentSoon && (
        <p className="mb-1 text-xs font-medium text-red-700">Starts within 24 hours — pickup details still incomplete</p>
      )}
      {!urgentSoon && missingPickup && (
        <p className="mb-1 text-xs font-medium text-amber-800">Meeting or pickup copy incomplete</p>
      )}
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold text-ink truncate">{booking.guest_name ?? booking.guest_email ?? 'Guest'}</p>
        <span className="text-xs font-medium capitalize text-ink-muted shrink-0">{booking.status}</span>
      </div>
      <p className="mt-0.5 text-sm text-ink-muted truncate">{listingTitle}</p>
      <p className="mt-1 text-sm text-ink-muted">
        {actDate ? `${actDate} · ` : ''}
        {guestsN} guest{guestsN === 1 ? '' : 's'}
        {times ? ` · ${times}` : ''}
      </p>
      {guide ? <p className="mt-1 line-clamp-1 text-xs text-ink-faint">{guide}</p> : null}
    </button>
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
  const [stayListingIds, setStayListingIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listingFilterId, setListingFilterId] = useState('');
  const [needsPickupOnly, setNeedsPickupOnly] = useState(false);
  const [sortDate, setSortDate] = useState<'asc' | 'desc'>('asc');
  const [showSearch, setShowSearch] = useState(false);
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
      const titles: Record<string, string> = {};
      const points: Record<string, string> = {};
      const instructions: Record<string, string> = {};
      const guideMeta: Record<string, ListingGuideMeta> = {};
      const stayIds = new Set<string>();
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
        if (inventoryFamilyFromListing(l) === 'stay') stayIds.add(l.id);
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
          if (inventoryFamilyFromListing(listing) === 'stay') stayIds.add(lid);
        }
      }
      setStayListingIds(stayIds);
      setBookings(
        bookingsList.filter(
          (b) =>
            partnerBookingIsLiveTrip(b) && !bookingIsStayNight(b) && !stayIds.has(b.listing_id)
        )
      );
      setListingTitles(titles);
      setMeetingPoints(points);
      setPickupInstructions(instructions);
      setListingGuideMeta(guideMeta);
    } catch (e) {
      setError(userFacingError(e, USER_ERROR.pickup));
    } finally {
      setLoading(false);
    }
  }, [isSupabase, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  /** Tour pickup work only: hide stays, cancelled, refunded, and failed checkouts. */
  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (!partnerBookingIsOperatingTrip(b)) return false;
      if (bookingIsStayNight(b) || stayListingIds.has(b.listing_id)) return false;

      const bd = b.booking_date;
      if (dateFrom && bd && bd < dateFrom) return false;
      if (dateTo && bd && bd > dateTo) return false;
      if ((dateFrom || dateTo) && !bd) return false;
      return true;
    });
  }, [bookings, dateFrom, dateTo, stayListingIds]);

  const sorted = useMemo(
    () =>
      [...filtered].sort(
        (a, b) =>
          (a.booking_date ?? '').localeCompare(b.booking_date ?? '') || a.created_at.localeCompare(b.created_at)
      ),
    [filtered]
  );

  const needsPickupInfo = useCallback(
    (b: BookingRow) =>
      bookingNeedsPickupCopy(b, meetingPoints[b.listing_id], pickupInstructions[b.listing_id]),
    [meetingPoints, pickupInstructions]
  );

  const listBookings = useMemo(() => {
    let rows = sorted;
    if (listingFilterId) rows = rows.filter((b) => b.listing_id === listingFilterId);
    if (needsPickupOnly) rows = rows.filter((b) => needsPickupInfo(b));
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
        .filter(([id]) => !stayListingIds.has(id))
        .map(([id, title]) => ({ id, title }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [listingTitles, stayListingIds]
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
    }
  }, [selectedBookingId]);

  useEffect(() => {
    if (!actionFeedback) return;
    const timer = window.setTimeout(() => setActionFeedback(null), 4000);
    return () => window.clearTimeout(timer);
  }, [actionFeedback]);

  useEffect(() => {
    if (!selectedBookingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedBookingId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedBookingId]);

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
    if (!canEditBookings || !selectedBooking || !partnerBookingIsOperatingTrip(selectedBooking)) return;
    setUpdatingId(selectedBooking.id);
    const startTrim = scheduleDraft.start.trim();
    const pickupTrim = scheduleDraft.pickup.trim();
    const res = await updateBookingSchedule(selectedBooking.id, {
      start_time: startTrim || null,
      pickup_time: pickupTrim || null,
    });
    if (res.ok) {
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
      showActionFeedback('error', res.error || 'Could not save times. Try again.');
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
    if (!selectedBooking || !partnerBookingNeedsLook(selectedBooking)) return;
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
    const res = await updateBookingStatus(selectedBooking.id, 'confirmed');
    if (res.ok) {
      setBookings((prev) =>
        prev.map((b) => (b.id === selectedBooking.id ? { ...b, status: 'confirmed' } : b))
      );
      showActionFeedback('success', 'Booking confirmed.');
    } else {
      showActionFeedback('error', res.error || 'Could not confirm booking. Try again.');
    }
    setUpdatingId(null);
  };

  const handleCancelSelected = async () => {
    if (!canEditBookings) return;
    if (!selectedBooking || !partnerBookingIsOperatingTrip(selectedBooking) || !cancelReason) return;
    if (!partnerPickupAllowsForceCancel(selectedBooking)) {
      showActionFeedback(
        'error',
        'Paid bookings must use Request cancellation in Bookings. Traverion does not force-cancel paid trips from Pickup.'
      );
      return;
    }
    setUpdatingId(selectedBooking.id);
    const previousStatus = selectedBooking.status;
    const res = await updateBookingStatus(selectedBooking.id, 'cancelled', {
      cancellation_reason: cancelReason,
    });
    if (res.ok) {
      if (previousStatus === 'confirmed' && selectedBooking.booking_date) {
        await decrementAvailabilityBooked(
          selectedBooking.listing_id,
          selectedBooking.booking_date,
          selectedBooking.guests ?? 1
        );
      }
      setBookings((prev) =>
        prev.map((b) =>
          b.id === selectedBooking.id
            ? {
                ...b,
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                cancellation_reason: cancelReason,
              }
            : b
        )
      );
      showActionFeedback('success', 'Unpaid booking cancelled. The hold is released.');
      setCancelReason('');
      setSelectedBookingId(null);
    } else {
      showActionFeedback('error', res.error || 'Could not cancel booking. Try again.');
    }
    setUpdatingId(null);
  };

  const plannerStats = useMemo(() => {
    const guestTotal = listBookings.reduce((sum, b) => sum + Number(b.guests ?? 0), 0);
    const needsPickup = listBookings.filter((b) => needsPickupInfo(b)).length;
    return { bookings: listBookings.length, guests: guestTotal, needsPickup };
  }, [listBookings, needsPickupInfo]);

  if (!user) return null;

  const filtersOn = Boolean(dateFrom || dateTo || listingFilterId || needsPickupOnly);
  const activeBookingsCount = bookings.filter((b) => partnerBookingIsOperatingTrip(b)).length;

  if (selectedBooking) {
    const listingTitle = listingTitles[selectedBooking.listing_id] ?? 'Listing';
    const guideMeta = listingGuideMeta[selectedBooking.listing_id];
    const activityDate = selectedBooking.booking_date
      ? formatPickupSectionDate(selectedBooking.booking_date)
      : 'No activity date';

    return (
      <div className={SUPPLIER_PAGE_CLASS}>
        <button
          type="button"
          onClick={() => setSelectedBookingId(null)}
          className="lux-flat inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          Pickup
        </button>

        {actionFeedbackBanner}

        <div className="mt-6 mb-10">
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">Pickup details</p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl text-ink tracking-tight">{listingTitle}</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {selectedBooking.guest_name ?? selectedBooking.guest_email ?? 'Guest'} · {activityDate}
            {' · '}
            <span className="capitalize">{selectedBooking.status}</span>
            {' · '}
            {selectedBooking.guests ?? '—'} guest{(selectedBooking.guests ?? 0) === 1 ? '' : 's'}
            {bookingTimesLine(selectedBooking) ? ` · ${bookingTimesLine(selectedBooking)}` : ''}
          </p>
        </div>

        <div className="space-y-8 max-w-2xl">
          <div>
            <h2 className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Guest</h2>
            <p className="font-semibold text-ink">
              {selectedBooking.guest_name ?? selectedBooking.guest_email ?? '—'}
            </p>
            {selectedBooking.guest_name && selectedBooking.guest_email ? (
              <p className="mt-0.5 text-sm text-ink-muted break-all">{selectedBooking.guest_email}</p>
            ) : null}
            <p className="mt-3 text-sm text-ink-muted whitespace-pre-wrap">
              {selectedBooking.special_requests || 'No special requests or address notes.'}
            </p>
          </div>

          {guideMeta ? (
            <div>
              <h2 className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Listing timing</h2>
              {guideScheduleSummary(guideMeta) ? (
                <div className="space-y-1 text-sm text-ink">
                  <p>Duration: {guideMeta.duration}</p>
                  <p>Typical time / season: {guideMeta.bestTime}</p>
                  <p>Start location: {guideMeta.startLocation}</p>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">
                  Add duration, typical time, and start location on the listing for clearer timing context.
                </p>
              )}
              {guideMeta.defaultStartTime ? (
                <p className="mt-2 text-xs text-ink-faint">
                  Listing default start {guideMeta.defaultStartTime}. Assign pickup between {guideMeta.pickupWindowMin}–
                  {guideMeta.pickupWindowMax} minutes before.
                </p>
              ) : null}
            </div>
          ) : null}

          {partnerBookingIsOperatingTrip(selectedBooking) && (
            <div>
              <h2 className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Times for this booking</h2>
              <p className="text-sm text-ink-muted mb-4">
                Adjust start and pickup if this instance differs from the listing default.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">Start</label>
                  <input
                    type="time"
                    value={scheduleDraft.start}
                    onChange={(e) => setScheduleDraft((d) => ({ ...d, start: e.target.value }))}
                    disabled={!canEditBookings}
                    className={plannerInputClass()}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">Pickup</label>
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
                className="tv-btn-primary mt-4 disabled:opacity-50"
              >
                {updatingId === selectedBooking.id ? 'Saving…' : 'Save times'}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h2 className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Meeting point</h2>
              <p className="text-sm text-ink whitespace-pre-wrap">
                {meetingPoints[selectedBooking.listing_id] || (
                  <span className="text-amber-800">Missing — edit on listing</span>
                )}
              </p>
            </div>
            <div>
              <h2 className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Pickup instructions</h2>
              <p className="text-sm text-ink whitespace-pre-wrap">
                {pickupInstructions[selectedBooking.listing_id] || (
                  <span className="text-amber-800">Missing — edit on listing</span>
                )}
              </p>
            </div>
          </div>

          {partnerBookingIsOperatingTrip(selectedBooking) && (
            <div>
              <h2 className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Cancel booking</h2>
              {partnerPickupAllowsForceCancel(selectedBooking) ? (
                <div className="max-w-xl">
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                    Reason
                  </label>
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
                  <p className="mt-2 text-xs text-ink-muted">
                    This checkout is unpaid. Cancelling releases the hold immediately — no Stripe refund applies.
                  </p>
                </div>
              ) : (
                <NoticeCallout title="Paid bookings need traveler acceptance" tone="warn">
                  <p>{PARTNER_CANCEL_REQUEST_REFUND_POLICY}</p>
                  <p className="mt-2">
                    Pickup does not force-cancel paid trips. Open Bookings to request cancellation.
                  </p>
                  <button
                    type="button"
                    onClick={() => openSupplierBooking(selectedBooking.id)}
                    className="tv-btn-ghost mt-3 -ml-2"
                  >
                    Open in Bookings
                  </button>
                </NoticeCallout>
              )}
            </div>
          )}
        </div>

        <div className="mt-10 flex flex-wrap gap-2">
          {partnerBookingIsOperatingTrip(selectedBooking) && (
            <>
              {partnerBookingNeedsLook(selectedBooking) && (
                <button
                  type="button"
                  disabled={!canEditBookings || updatingId === selectedBooking.id}
                  onClick={handleAcknowledgeSelected}
                  className="tv-btn-secondary disabled:opacity-60"
                >
                  Acknowledge
                </button>
              )}
              {selectedBooking.status !== 'confirmed' && (
                <button
                  type="button"
                  disabled={!canEditBookings || updatingId === selectedBooking.id}
                  onClick={handleConfirmSelected}
                  className="tv-btn-secondary disabled:opacity-60"
                >
                  Confirm
                </button>
              )}
              {partnerPickupAllowsForceCancel(selectedBooking) ? (
                <button
                  type="button"
                  disabled={!canEditBookings || updatingId === selectedBooking.id || !cancelReason}
                  onClick={handleCancelSelected}
                  className="tv-btn-ghost disabled:opacity-60"
                >
                  Cancel unpaid booking
                </button>
              ) : null}
            </>
          )}
          <button
            type="button"
            onClick={() => openSupplierBooking(selectedBooking.id)}
            className="tv-btn-ghost"
          >
            Open in bookings
          </button>
          <button
            type="button"
            onClick={() => openSupplierListingEditor(selectedBooking.listing_id, 'meeting')}
            className="tv-btn-ghost"
          >
            Edit meeting
          </button>
          <button
            type="button"
            onClick={() => openSupplierListingEditor(selectedBooking.listing_id, 'schedule')}
            className="tv-btn-ghost"
          >
            Edit schedule
          </button>
          <button
            type="button"
            onClick={() => openSupplierListingEditor(selectedBooking.listing_id, 'pickup')}
            className="tv-btn-primary inline-flex items-center gap-1.5"
          >
            <ExternalLink className="w-4 h-4" aria-hidden />
            Edit pickup
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        title="Pickup"
        description="Meeting points, pickup times, and what still needs copy."
        actions={
          !loading && listBookings.length > 0 ? (
            <button
              type="button"
              onClick={exportCsv}
              className="lux-flat inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm text-ink-muted hover:text-ink"
            >
              <Download className="h-4 w-4" aria-hidden />
              Export
            </button>
          ) : undefined
        }
      >
        {!canEditBookings ? (
          <p className="mt-3 text-sm text-amber-800">
            Your role is {role}. You can view plans, but booking actions are restricted.
          </p>
        ) : null}
        {!loading && listBookings.length > 0 ? (
          <p className="mt-4 text-sm text-ink-muted">
            {plannerStats.bookings} booking{plannerStats.bookings === 1 ? '' : 's'} · {plannerStats.guests} guest
            {plannerStats.guests === 1 ? '' : 's'}
            {plannerStats.needsPickup > 0 ? ` · ${plannerStats.needsPickup} need pickup copy` : ''}
          </p>
        ) : null}
      </SupplierPageHero>

      {activeBookingsCount > 0 && (
        <div className="mb-8">
          <button type="button" onClick={() => setShowSearch((v) => !v)} className="tv-btn-ghost -ml-2">
            Search{filtersOn ? ' · on' : ''}
          </button>
          {showSearch && (
            <div className="mt-4 space-y-4 motion-safe:animate-fade-in">
              <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                <div className="flex min-w-[min(100%,12rem)] flex-1 flex-col gap-1 sm:flex-none sm:min-w-[11rem]">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Listing</label>
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
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Dates</label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="tv-input w-[9.25rem]"
                      aria-label="Activity date from"
                    />
                    <span className="shrink-0 text-sm text-ink-faint">–</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="tv-input w-[9.25rem]"
                      aria-label="Activity date to"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Sort</label>
                  <select
                    value={sortDate}
                    onChange={(e) => setSortDate(e.target.value as 'asc' | 'desc')}
                    className={plannerInputClass()}
                  >
                    <option value="asc">Earliest first</option>
                    <option value="desc">Latest first</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={needsPickupOnly}
                    onChange={(e) => setNeedsPickupOnly(e.target.checked)}
                    className="rounded border-black/20 text-finland focus:ring-finland"
                  />
                  Needs pickup copy only
                </label>
                {filtersOn ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDateFrom('');
                      setDateTo('');
                      setListingFilterId('');
                      setNeedsPickupOnly(false);
                      setSortDate('asc');
                    }}
                    className="tv-btn-ghost"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <ErrorState
          className="py-6"
          title="Pickups unavailable"
          body={userFacingError(error, USER_ERROR.pickup)}
          retry={{ onClick: () => void load() }}
        />
      )}

      {actionFeedbackBanner}

      {loading ? (
        <div className="space-y-3 animate-pulse" aria-hidden>
          <div className="h-16 rounded-xl bg-black/[0.04]" />
          <div className="h-16 rounded-xl bg-black/[0.04]" />
          <div className="h-16 rounded-xl bg-black/[0.04]" />
        </div>
      ) : activeBookingsCount === 0 ? (
        <SupplierEmptyState
          icon={CalendarDays}
          title="No bookings yet"
          body="Pickup times show up after a traveler books a tour. Stay nights are on Bookings."
        />
      ) : listBookings.length === 0 ? (
        <SupplierEmptyState
          icon={CalendarDays}
          title="Nothing in this view"
          body="You have tour bookings, but none match these dates, listing, or pickup filter. Stay nights, cancelled, and refunded trips stay hidden. Clear filters to see the rest."
          action={
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
                setListingFilterId('');
                setNeedsPickupOnly(false);
                setSortDate('asc');
              }}
              className="tv-btn-primary"
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <div className="space-y-10">
          {bookingsGroupedByDate.orderedKeys.map((ymd) => {
            const sectionOpen = dateSectionOpen[ymd] !== false;
            const dayRows = bookingsGroupedByDate.byDay.get(ymd) ?? [];
            const dayGuestTotal = dayRows.reduce((sum, b) => sum + Number(b.guests ?? 0), 0);
            const dayNeedsPickup = dayRows.filter((b) => needsPickupInfo(b)).length;
            return (
              <section key={ymd}>
                <button
                  type="button"
                  onClick={() =>
                    setDateSectionOpen((prev) => {
                      const open = prev[ymd] !== false;
                      return { ...prev, [ymd]: !open };
                    })
                  }
                  className="lux-flat flex w-full items-baseline justify-between gap-3 py-2 text-left"
                >
                  <div className="min-w-0">
                    <p className="font-display text-xl sm:text-2xl text-ink tracking-tight">
                      {formatPickupSectionDate(ymd)}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {dayRows.length} booking{dayRows.length === 1 ? '' : 's'} · {dayGuestTotal} guest
                      {dayGuestTotal === 1 ? '' : 's'}
                      {dayNeedsPickup > 0 ? ` · ${dayNeedsPickup} need pickup copy` : ''}
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-ink-faint transition-transform duration-300 ease-out ${
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
                    <div className="divide-y divide-black/[0.06]">
                      {dayRows.map((b) => {
                        const missing = needsPickupInfo(b);
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
            <section>
              <button
                type="button"
                onClick={() =>
                  setDateSectionOpen((prev) => {
                    const k = '__nodate';
                    const open = prev[k] !== false;
                    return { ...prev, [k]: !open };
                  })
                }
                className="lux-flat flex w-full items-baseline justify-between gap-3 py-2 text-left"
              >
                <div>
                  <p className="font-display text-xl sm:text-2xl text-ink tracking-tight">No activity date</p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {bookingsGroupedByDate.noDate.length} booking
                    {bookingsGroupedByDate.noDate.length === 1 ? '' : 's'}
                  </p>
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-ink-faint transition-transform duration-300 ease-out ${
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
                  <div className="divide-y divide-black/[0.06]">
                    {bookingsGroupedByDate.noDate.map((b) => (
                      <PlannerBookingCard
                        key={b.id}
                        booking={b}
                        listingTitle={listingTitles[b.listing_id] ?? 'Listing'}
                        guideMeta={listingGuideMeta[b.listing_id]}
                        missingPickup={needsPickupInfo(b)}
                        onOpen={() => setSelectedBookingId(b.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
