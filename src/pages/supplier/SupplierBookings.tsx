import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Mail,
  MapPin,
  RefreshCw,
  Trash2,
  Users,
  CalendarDays,
} from 'lucide-react';
import type { TourPackage } from '../../types/tour';
import { listingHeroImageSrc, orderedPhotoUrls, photoSlotsFromTourPackage } from '../../lib/listingPhotoGrid';
import { formatMoney } from '../../lib/money';
import { isPaidPaymentStatus, partnerPaymentLabel, bookingPaymentWasCollected } from '../../lib/payment-states';
import { guestFacingBookingNotes } from '../../lib/booking-notes';
import {
  SUPPLIER_CANCELLATION_REASON_CODES,
  isForceMajeureReason,
  snapshotSupplierCancellationPolicy,
  supplierCancellationFeeEur,
  supplierCancellationReasonLabel,
} from '../../lib/cancellation-policy';
import {
  bookingAllowsMessaging,
  messagingComposeBlock,
  fetchCancellationRequestsForBookings,
  notifyTravelerCancellationRequest,
  requestSupplierCancellation,
  type CancellationRequestRow,
} from '../../data/supabase-booking-ops';
import BookingMessageThread from '../../components/BookingMessageThread';
import NoticeCallout from '../../components/NoticeCallout';
import { SkeletonListItem } from '../../components/ui/Skeleton';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import {
  SUPPLIER_PAGE_CLASS,
  SupplierEmptyState,
  SupplierModalHeader,
  SupplierModalShell,
  SupplierPageHero,
} from '../../components/supplier/supplierUi';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import {
  acknowledgeBooking,
  fetchBookingsForSupplier,
  type BookingRow,
  updateBookingStatus,
} from '../../data/supabase-bookings';
import { decrementAvailabilityBooked } from '../../data/supabase-availability';
import { fetchMyListings, pgTimeToHm } from '../../data/supabase-listings';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { inventoryFamilyFromListing } from '../../lib/inventory';
import { parseStayCheckOutFromNotes, nightsOccupiedByStay, stayRangeFromBooking } from '../../lib/stayOccupancy';
import { partnerBookingIsLiveTrip, bookingIsCancelledTrip, partnerBookingIsOperatingTrip, partnerBookingNeedsLook, partnerBookingIsUnpaidCheckout } from '../../lib/trip-views';
import { formatStayNightHuman } from '../../lib/stay-calendar';

const BOOKINGS_PAGE_SIZE = 10;

type ListingBookingMeta = {
  title: string;
  imageUrl: string | null;
  location: string;
  duration: string;
  family: ReturnType<typeof inventoryFamilyFromListing>;
};

function buildListingMeta(listing: TourPackage): ListingBookingMeta {
  const urls = orderedPhotoUrls(photoSlotsFromTourPackage(listing));
  const imageUrl = listingHeroImageSrc(urls[0] || listing.image);
  const location =
    [listing.city, listing.country ?? listing.destination].filter(Boolean).join(', ') ||
    listing.destination ||
    '—';
  return {
    title: listing.title,
    imageUrl,
    location,
    duration: listing.duration || '—',
    family: inventoryFamilyFromListing(listing),
  };
}

function formatBookingMoney(amount: number | null | undefined, currency: string | null | undefined): string | null {
  if (amount == null || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return null;
  return formatMoney(Number(amount), currency);
}

function bookingStatusClass(status: string, paymentStatus?: string | null): string {
  const pay = (paymentStatus ?? '').trim().toLowerCase();
  if (status === 'cancelled' || pay === 'refunded') return 'bg-slate-100 text-slate-600 ring-slate-200/80';
  if (status === 'confirmed') return 'bg-emerald-50 text-emerald-800 ring-emerald-200/80';
  return 'bg-amber-50 text-amber-900 ring-amber-200/80';
}

const CANCELLATION_REASONS = SUPPLIER_CANCELLATION_REASON_CODES.map((id) => ({
  id,
  label: supplierCancellationReasonLabel(id),
}));

const REFUND_CHOICES = [
  { id: 'full_refund', label: 'Full refund' },
  { id: 'no_refund', label: 'No refund' },
  { id: 'reschedule', label: 'Offer reschedule' },
] as const;

type RefundChoice = (typeof REFUND_CHOICES)[number]['id'];
type BookingView = 'today' | 'upcoming' | 'past' | 'all';
type OpsFilter = 'all' | 'unpaid' | 'pickup' | 'cancel';

function bookingPaginationRange(totalPages: number, current: number): (number | 'ellipsis')[] {
  if (totalPages <= 1) return [];
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const wanted = new Set([1, totalPages, current - 1, current, current + 1]);
  const sorted = [...wanted].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: (number | 'ellipsis')[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i - 1] + 1 < sorted[i]) out.push('ellipsis');
    out.push(sorted[i]);
  }
  return out;
}

function formatActivityDateLong(bookingDate: string | null, startHm: string | null): string {
  if (!bookingDate) return 'No activity date';
  const date = new Date(bookingDate);
  const datePart = date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return startHm ? `${datePart} · ${startHm}` : datePart;
}

function csvEscape(value: unknown): string {
  const s = String(value ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadBookingsCsv(rows: BookingRow[], listingTitles: Record<string, string>): void {
  const header = [
    'booking_id',
    'booking_number',
    'listing_id',
    'listing_title',
    'guest_name',
    'guest_email',
    'guests',
    'booking_date',
    'start_time',
    'pickup_time',
    'status',
    'acknowledged_at',
    'created_at',
    'special_requests',
    'cancellation_reason',
    'refund_choice',
  ];
  const lines = rows.map((b) =>
    [
      b.id,
      typeof b.booking_number === 'number' ? b.booking_number : '',
      b.listing_id,
      listingTitles[b.listing_id] ?? '',
      b.guest_name ?? '',
      b.guest_email ?? '',
      b.guests ?? '',
      b.booking_date ?? '',
      b.start_time ? pgTimeToHm(b.start_time) ?? '' : '',
      b.pickup_time ? pgTimeToHm(b.pickup_time) ?? '' : '',
      b.status,
      b.acknowledged_at ?? '',
      b.created_at,
      b.special_requests ?? '',
      b.cancellation_reason ?? '',
      b.refund_choice ?? '',
    ]
      .map(csvEscape)
      .join(',')
  );
  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `supplier-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function SupplierBookings() {
  const { user, isSupabase } = useSupplierAuth();
  const { role } = useSupplierRole();
  const canEditBookings = canManageBookings(role);

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [listingMeta, setListingMeta] = useState<Record<string, ListingBookingMeta>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [view, setView] = useState<BookingView>('all');
  const [opsFilter, setOpsFilter] = useState<OpsFilter>('all');
  const [filterListingId, setFilterListingId] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const [bookingsListPage, setBookingsListPage] = useState(1);
  const [highlightBookingId, setHighlightBookingId] = useState<string | null>(null);

  const [cancelModal, setCancelModal] = useState<BookingRow | null>(null);
  const [cancelReason, setCancelReason] = useState<string>(CANCELLATION_REASONS[0].id);
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [cancelEvidence, setCancelEvidence] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [openCancels, setOpenCancels] = useState<Record<string, CancellationRequestRow>>({});

  const load = useCallback(async () => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [bookingsList, myListings] = await Promise.all([
        fetchBookingsForSupplier(uid),
        fetchMyListings(uid),
      ]);
      const meta: Record<string, ListingBookingMeta> = {};
      myListings.forEach((listing) => {
        meta[listing.id] = buildListingMeta(listing);
      });
      setBookings(bookingsList.filter(partnerBookingIsLiveTrip));
      setListingMeta(meta);
      const reqs = await fetchCancellationRequestsForBookings(bookingsList.map((b) => b.id));
      const open: Record<string, CancellationRequestRow> = {};
      for (const r of reqs) {
        if (r.status === 'requested' && !open[r.booking_id]) open[r.booking_id] = r;
      }
      setOpenCancels(open);
    } catch (e) {
      setError(userFacingError(e, USER_ERROR.bookings));
    } finally {
      setLoading(false);
    }
  }, [isSupabase, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const syncHighlightFromUrl = () => {
      const id = new URLSearchParams(window.location.search).get('booking');
      setHighlightBookingId(id && id.length > 0 ? id : null);
    };
    syncHighlightFromUrl();
    window.addEventListener('popstate', syncHighlightFromUrl);
    return () => window.removeEventListener('popstate', syncHighlightFromUrl);
  }, []);

  const setSelectedBookingId = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('booking', id);
    else url.searchParams.delete('booking');
    window.history.pushState({}, '', `${url.pathname}${url.search}`);
    setHighlightBookingId(id);
  }, []);

  const todayIso = new Date().toISOString().slice(0, 10);

  const filteredBookings = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    return bookings.filter((b) => {
      if (!partnerBookingIsLiveTrip(b)) return false;
      const meta = listingMeta[b.listing_id];
      const isStay = meta?.family === 'stay' || Boolean(b.check_out);
      const stayRange = isStay ? stayRangeFromBooking(b) : null;
      if (view === 'today') {
        if (!partnerBookingIsOperatingTrip(b)) return false;
        if (stayRange) {
          if (!nightsOccupiedByStay(stayRange.checkIn, stayRange.checkOut).includes(todayIso)) return false;
        } else if (b.booking_date !== todayIso) {
          return false;
        }
      }
      if (view === 'upcoming') {
        if (!partnerBookingIsOperatingTrip(b)) return false;
        if (stayRange) {
          if (stayRange.checkIn <= todayIso) return false;
        } else if (!b.booking_date || b.booking_date <= todayIso) {
          return false;
        }
      }
      if (view === 'past') {
        if (stayRange) {
          if (stayRange.checkOut > todayIso && partnerBookingIsOperatingTrip(b)) return false;
        } else if (!b.booking_date || b.booking_date >= todayIso) {
          return false;
        }
      }
      if (opsFilter === 'unpaid') {
        if (!partnerBookingIsUnpaidCheckout(b)) return false;
      }
      if (opsFilter === 'pickup') {
        if (isStay || bookingIsCancelledTrip(b) || !isPaidPaymentStatus(b.payment_status) || b.pickup_time) return false;
      }
      if (opsFilter === 'cancel') {
        if (!openCancels[b.id]) return false;
      }
      if (filterListingId && b.listing_id !== filterListingId) return false;
      if (filterDateFrom && (!b.booking_date || b.booking_date < filterDateFrom)) return false;
      if (filterDateTo && (!b.booking_date || b.booking_date > filterDateTo)) return false;
      if (!q) return true;

      const title = (listingMeta[b.listing_id]?.title ?? '').toLowerCase();
      const idLower = b.id.toLowerCase();
      const guestName = (b.guest_name ?? '').toLowerCase();
      const guestEmail = (b.guest_email ?? '').toLowerCase();
      return (
        title.includes(q) ||
        idLower.includes(q) ||
        guestName.includes(q) ||
        guestEmail.includes(q)
      );
    });
  }, [bookings, filterDateFrom, filterDateTo, filterListingId, filterQuery, listingMeta, todayIso, view, opsFilter, openCancels]);

  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / BOOKINGS_PAGE_SIZE));
  const safePage = Math.min(Math.max(bookingsListPage, 1), totalPages);
  const paginatedBookings = useMemo(() => {
    const start = (safePage - 1) * BOOKINGS_PAGE_SIZE;
    return filteredBookings.slice(start, start + BOOKINGS_PAGE_SIZE);
  }, [filteredBookings, safePage]);
  const paginationItems = useMemo(() => bookingPaginationRange(totalPages, safePage), [safePage, totalPages]);

  useEffect(() => {
    setBookingsListPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  useEffect(() => {
    setBookingsListPage(1);
  }, [view, filterListingId, filterDateFrom, filterDateTo, filterQuery, opsFilter]);

  useEffect(() => {
    if (!highlightBookingId) return;
    const index = filteredBookings.findIndex((b) => b.id === highlightBookingId);
    if (index >= 0) {
      const targetPage = Math.floor(index / BOOKINGS_PAGE_SIZE) + 1;
      setBookingsListPage(targetPage);
      requestAnimationFrame(() => {
        document.getElementById(`supplier-booking-row-${highlightBookingId}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      });
      return;
    }
    setView('all');
    setFilterListingId('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterQuery('');
  }, [filteredBookings, highlightBookingId]);

  const handleStatusChange = useCallback(
    async (
      booking: BookingRow,
      status: 'pending' | 'confirmed' | 'cancelled',
      options?: { cancellation_reason?: string; refund_choice?: RefundChoice }
    ) => {
      if (!canEditBookings) return;
      setUpdatingId(booking.id);
      const previousStatus = booking.status;
      const res = await updateBookingStatus(booking.id, status, options);
      if (res.ok) {
        if (status === 'cancelled' && previousStatus === 'confirmed' && booking.booking_date) {
          await decrementAvailabilityBooked(booking.listing_id, booking.booking_date, booking.guests ?? 1);
        }
        setBookings((prev) =>
          prev.map((b) =>
            b.id === booking.id
              ? {
                  ...b,
                  status,
                  cancellation_reason: options?.cancellation_reason ?? b.cancellation_reason,
                  refund_choice: options?.refund_choice ?? b.refund_choice,
                  cancelled_at: status === 'cancelled' ? new Date().toISOString() : b.cancelled_at,
                }
              : b
          )
        );
      } else {
        setCancelError(userFacingError(res.error, 'Could not update this booking.'));
      }
      setUpdatingId(null);
      if (res.ok && status === 'cancelled') {
        setCancelModal(null);
      }
    },
    [canEditBookings]
  );

  const handleRequestSupplierCancel = useCallback(async () => {
    if (!cancelModal || !canEditBookings || !partnerBookingIsOperatingTrip(cancelModal)) return;
    setCancelError(null);
    setUpdatingId(cancelModal.id);
    const res = await requestSupplierCancellation({
      bookingId: cancelModal.id,
      reasonCode: cancelReason,
      reasonText: cancelReasonText,
      evidenceNote: cancelEvidence.trim() || undefined,
    });
    setUpdatingId(null);
    if (!res.ok) {
      setCancelError(userFacingError(res.error, 'Could not send the cancellation request.'));
      return;
    }
    const email = (cancelModal.guest_email ?? '').trim();
    if (email) {
      void notifyTravelerCancellationRequest({
        customerEmail: email,
        customerName: cancelModal.guest_name,
        listingTitle: listingMeta[cancelModal.listing_id]?.title ?? 'Booking',
        bookingId: cancelModal.id,
        bookingNumber: typeof cancelModal.booking_number === 'number' ? cancelModal.booking_number : undefined,
        bookingDate: cancelModal.booking_date,
        reasonLabel: supplierCancellationReasonLabel(cancelReason),
      });
    }
    setCancelModal(null);
    setCancelReasonText('');
    setCancelEvidence('');
    await load();
  }, [cancelModal, canEditBookings, cancelReason, cancelReasonText, cancelEvidence, listingMeta, load]);

  const handleAcknowledge = useCallback(
    async (booking: BookingRow) => {
      if (!canEditBookings || !partnerBookingIsOperatingTrip(booking)) return;
      setUpdatingId(booking.id);
      const ok = await acknowledgeBooking(booking.id);
      if (ok) {
        setBookings((prev) =>
          prev.map((b) => (b.id === booking.id ? { ...b, acknowledged_at: new Date().toISOString() } : b))
        );
      }
      setUpdatingId(null);
    },
    [canEditBookings]
  );

  const listingOptions = useMemo(
    () => Object.entries(listingMeta).map(([id, m]) => ({ id, title: m.title })),
    [listingMeta]
  );

  const selectedBooking = useMemo(
    () => (highlightBookingId ? bookings.find((b) => b.id === highlightBookingId) ?? null : null),
    [bookings, highlightBookingId]
  );

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        title="Bookings"
        description="Guests, tours, dates, and what needs a decision."
        actions={
          bookings.length > 0 ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="lux-flat inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm text-ink-muted hover:text-ink"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Refresh
            </button>
            <button
              type="button"
              onClick={() =>
                downloadBookingsCsv(
                  filteredBookings,
                  Object.fromEntries(Object.entries(listingMeta).map(([id, m]) => [id, m.title]))
                )
              }
              disabled={filteredBookings.length === 0}
              className="lux-flat inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm text-ink-muted hover:text-ink disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden />
              Export
            </button>
          </div>
          ) : undefined
        }
      >
        {bookings.length > 0 && (
          <div className="mt-6 flex gap-1 rounded-full bg-black/[0.04] p-1 w-fit max-w-full overflow-x-auto">
            {([
              ['today', 'Today'],
              ['upcoming', 'Upcoming'],
              ['past', 'Past'],
              ['all', 'All'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`lux-flat rounded-full px-3.5 py-2 min-h-11 text-sm font-medium shrink-0 ${
                  view === id ? 'bg-paper-raised text-ink shadow-sm' : 'text-ink-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {bookings.length > 0 && (
          <div className="mt-3 flex gap-1 rounded-full bg-black/[0.04] p-1 w-fit max-w-full overflow-x-auto">
            {([
              ['all', 'All states'],
              ['unpaid', 'Unpaid'],
              ['pickup', 'Pickup missing'],
              ['cancel', 'Cancellation'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setOpsFilter(id)}
                className={`lux-flat rounded-full px-3.5 py-2 min-h-11 text-sm font-medium shrink-0 ${
                  opsFilter === id ? 'bg-paper-raised text-ink shadow-sm' : 'text-ink-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </SupplierPageHero>

      {bookings.length > 0 && (
      <div className="mb-8">
        <button
          type="button"
          onClick={() => setShowSearch((v) => !v)}
          className="tv-btn-ghost -ml-2"
        >
          Search{filterQuery || filterListingId || filterDateFrom || filterDateTo ? ' · on' : ''}
        </button>
        {showSearch && (
        <div className="mt-4 space-y-4 motion-safe:animate-fade-in">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <div className="flex min-w-[min(100%,12rem)] flex-1 flex-col gap-1 sm:flex-none sm:min-w-[11rem]">
              <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Listing</label>
              <select
                value={filterListingId}
                onChange={(e) => setFilterListingId(e.target.value)}
                className="tv-input"
              >
                <option value="">All listings</option>
                {listingOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Dates</label>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="tv-input w-[9.25rem]"
                  aria-label="Activity date from"
                />
                <span className="shrink-0 text-sm text-ink-faint">–</span>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="tv-input w-[9.25rem]"
                  aria-label="Activity date to"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
            <div className="flex min-w-[min(100%,14rem)] flex-1 flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Guest</label>
              <input
                type="search"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Name or email"
                className="tv-input"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setView('all');
                  setFilterListingId('');
                  setFilterDateFrom('');
                  setFilterDateTo('');
                  setFilterQuery('');
                  setBookingsListPage(1);
                }}
                className="tv-btn-ghost"
              >
                Clear
              </button>
              {!loading && (
                <span className="text-sm text-ink-muted">
                  {filteredBookings.length} of {bookings.length}
                </span>
              )}
            </div>
          </div>
        </div>
        )}
      </div>
      )}

      {error && (
        <ErrorState
          className="py-6"
          title="Bookings unavailable"
          body={userFacingError(error, USER_ERROR.bookings)}
          retry={{ onClick: () => void load() }}
        />
      )}

      {loading ? (
        <div className="space-y-3">
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </div>
      ) : bookings.length === 0 ? (
        <SupplierEmptyState
          icon={CalendarDays}
          title="No bookings yet"
          body="No traveler has booked your tours yet. That is normal until a listing is live and someone checks out. When they do, bookings appear here."
          action={
            <button
              type="button"
              onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`)}
              className="tv-btn-primary"
            >
              View listings
            </button>
          }
        />
      ) : filteredBookings.length === 0 ? (
        <SupplierEmptyState
          icon={CalendarDays}
          title="Nothing in this view"
          body="You have bookings, but none match this tab, date range, or search. That is a filter — not a missing page."
        />
      ) : (
        <div className="space-y-4">
          <div className="divide-y divide-black/[0.06]">
            {paginatedBookings.map((booking) => {
              const startHm = booking.start_time ? pgTimeToHm(booking.start_time) ?? null : null;
              const meta = listingMeta[booking.listing_id];
              const listingTitle = meta?.title ?? (meta?.family === 'stay' ? 'Stay' : 'Tour');
              const stayOut =
                booking.check_out && /^\d{4}-\d{2}-\d{2}$/.test(booking.check_out)
                  ? booking.check_out
                  : parseStayCheckOutFromNotes(booking.special_requests);
              const dateLine = stayOut
                ? `${formatStayNightHuman(booking.booking_date ?? '')} → ${formatStayNightHuman(stayOut)}`
                : formatActivityDateLong(booking.booking_date, startHm);
              const paidLabel = formatBookingMoney(booking.amount_paid, booking.currency);
              const needsAck = partnerBookingNeedsLook(booking);
              const pickupGap =
                meta?.family !== 'stay' &&
                !stayOut &&
                isPaidPaymentStatus(booking.payment_status) &&
                !bookingIsCancelledTrip(booking) &&
                !booking.pickup_time;
              const openCancel = openCancels[booking.id];
              return (
                <article
                  key={booking.id}
                  id={`supplier-booking-row-${booking.id}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedBookingId(booking.id)}
                    className={`lux-flat flex w-full min-w-0 items-center gap-4 py-4 text-left ${
                      highlightBookingId === booking.id ? 'bg-paper-raised -mx-2 px-2 rounded-xl' : ''
                    }`}
                  >
                    {meta?.imageUrl ? (
                      <img
                        src={meta.imageUrl}
                        alt=""
                        className="h-14 w-14 sm:h-16 sm:w-16 rounded-xl object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-xl bg-black/[0.04] shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-semibold text-ink truncate">{booking.guest_name || 'Guest'}</p>
                        <span className="text-xs font-medium capitalize text-ink-muted shrink-0">{partnerPaymentLabel(booking)}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-ink-muted truncate">{listingTitle}</p>
                      <p className="mt-1 text-sm text-ink-muted">
                        {dateLine}
                        {' · '}
                        {booking.guests} guest{booking.guests === 1 ? '' : 's'}
                        {paidLabel ? ` · ${paidLabel}` : ''}
                      </p>
                      {needsAck ? (
                        <p className="mt-1 text-xs font-medium text-finland">Needs a look</p>
                      ) : null}
                      {pickupGap ? (
                        <p className="mt-1 text-xs font-medium text-amber-800">Pickup missing</p>
                      ) : null}
                      {openCancel ? (
                        <p className="mt-1 text-xs font-medium text-red-800">Awaiting traveler cancellation response</p>
                      ) : null}
                    </div>
                  </button>
                </article>
              );
            })}

          </div>

          <nav
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            aria-label="Bookings pages"
          >
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">
                {(safePage - 1) * BOOKINGS_PAGE_SIZE + 1}-
                {(safePage - 1) * BOOKINGS_PAGE_SIZE + paginatedBookings.length}
              </span>{' '}
              of {filteredBookings.length}
              {totalPages > 1 ? ` · Page ${safePage} of ${totalPages}` : ''}
            </p>
            {totalPages > 1 ? (
              <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setBookingsListPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="tv-btn-ghost min-h-[40px] min-w-[40px] p-0 disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                {paginationItems.map((item, index) =>
                  item === 'ellipsis' ? (
                    <span key={`ellipsis-${index}`} className="select-none px-1.5 text-sm text-ink-faint" aria-hidden>
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setBookingsListPage(item)}
                      className={`min-h-[40px] min-w-[40px] rounded-lg text-sm font-semibold tabular-nums ${
                        item === safePage
                          ? 'bg-finland text-white shadow-sm'
                          : 'border border-black/[0.08] text-ink hover:bg-paper'
                      }`}
                      aria-label={`Page ${item}`}
                      aria-current={item === safePage ? 'page' : undefined}
                    >
                      {item}
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => setBookingsListPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="tv-btn-ghost min-h-[40px] min-w-[40px] p-0 disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            ) : null}
          </nav>
        </div>
      )}

      {selectedBooking && (
        <SupplierModalShell onClose={() => setSelectedBookingId(null)} maxWidth="lg">
          {(() => {
            const booking = selectedBooking;
            const startHm = booking.start_time ? pgTimeToHm(booking.start_time) ?? null : null;
            const pickupHm = booking.pickup_time ? pgTimeToHm(booking.pickup_time) ?? null : null;
            const meta = listingMeta[booking.listing_id];
            const listingTitle = meta?.title ?? 'Tour';
            const paidLabel = formatBookingMoney(booking.amount_paid, booking.currency);
            const needsAck = partnerBookingNeedsLook(booking);
            const busy = updatingId === booking.id;
            const refLabel =
              typeof booking.booking_number === 'number' && booking.booking_number > 0
                ? `#${booking.booking_number}`
                : booking.id.slice(0, 8);
            return (
              <>
                <SupplierModalHeader
                  icon={Users}
                  title={booking.guest_name || 'Guest'}
                  subtitle={`${listingTitle} · ${refLabel}`}
                  onClose={() => setSelectedBookingId(null)}
                />
                <div className="space-y-5 p-4 sm:p-5">
                  <div className="flex items-start gap-4">
                    {meta?.imageUrl ? (
                      <img
                        src={meta.imageUrl}
                        alt=""
                        className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl bg-black/[0.04] shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ring-1 ${bookingStatusClass(booking.status, booking.payment_status)}`}>
                        {partnerPaymentLabel(booking)}
                      </span>
                      <p className="mt-2 font-sans text-base font-semibold text-ink">{listingTitle}</p>
                      {meta ? (
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-muted">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {meta.location}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {meta.duration}
                          </span>
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">When</dt>
                      <dd className="mt-0.5 text-ink">{formatActivityDateLong(booking.booking_date, startHm)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Party</dt>
                      <dd className="mt-0.5 text-ink">
                        {booking.guests} guest{booking.guests === 1 ? '' : 's'}
                      </dd>
                    </div>
                    {pickupHm ? (
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Pickup</dt>
                        <dd className="mt-0.5 text-ink">{pickupHm}</dd>
                      </div>
                    ) : null}
                    {paidLabel ? (
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                          {partnerPaymentLabel(booking) === 'Refunded' ? 'Refunded' : 'Paid'}
                        </dt>
                        <dd className="mt-0.5 text-ink">{paidLabel}</dd>
                      </div>
                    ) : null}
                    {booking.guest_email ? (
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Contact</dt>
                        <dd className="mt-0.5">
                          <a
                            href={`mailto:${booking.guest_email}`}
                            className="inline-flex items-center gap-1.5 text-finland hover:underline"
                          >
                            <Mail className="h-3.5 w-3.5" aria-hidden />
                            {booking.guest_email}
                          </a>
                        </dd>
                      </div>
                    ) : null}
                    {guestFacingBookingNotes(booking.special_requests) ? (
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Notes</dt>
                        <dd className="mt-0.5 whitespace-pre-wrap text-ink">{guestFacingBookingNotes(booking.special_requests)}</dd>
                      </div>
                    ) : null}
                  </dl>

                  {canEditBookings && partnerBookingIsOperatingTrip(booking) ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {booking.status === 'pending' ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleStatusChange(booking, 'confirmed')}
                          className="inline-flex items-center gap-1.5 rounded-full bg-finland px-4 py-2 text-sm font-semibold text-white hover:bg-finland-dark disabled:opacity-50"
                        >
                          <CheckCircle className="h-4 w-4" aria-hidden />
                          {busy ? 'Saving…' : 'Confirm'}
                        </button>
                      ) : null}
                      {needsAck ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleAcknowledge(booking)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-paper px-4 py-2 text-sm font-semibold text-ink ring-1 ring-black/[0.08] hover:bg-paper-raised disabled:opacity-50"
                        >
                          {busy ? 'Saving…' : 'Acknowledge'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy || Boolean(openCancels[booking.id])}
                        onClick={() => {
                          setCancelError(null);
                          setCancelReasonText('');
                          setCancelEvidence('');
                          setCancelModal(booking);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        {openCancels[booking.id] ? 'Awaiting traveler' : 'Request cancellation'}
                      </button>
                    </div>
                  ) : null}
                  {openCancels[booking.id] ? (
                    <NoticeCallout
                      title={
                        openCancels[booking.id]!.expires_at &&
                        new Date(openCancels[booking.id]!.expires_at!).getTime() < Date.now()
                          ? 'Review window passed — still waiting'
                          : 'Waiting for the traveler'
                      }
                      tone="warn"
                    >
                      Requested{' '}
                      {new Date(openCancels[booking.id]!.created_at).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                      {openCancels[booking.id]!.expires_at
                        ? ` · noted until ${new Date(openCancels[booking.id]!.expires_at!).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}`
                        : ''}
                      . The booking stays active until the traveler accepts. Traverion does not auto-cancel if they do
                      not respond.
                    </NoticeCallout>
                  ) : null}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint mb-2">History</p>
                    <ol className="space-y-1.5 text-sm text-ink-muted">
                      <li>
                        Booked{' '}
                        {booking.created_at
                          ? new Date(booking.created_at).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })
                          : ''}
                      </li>
                      {bookingPaymentWasCollected(booking.payment_status) ? (
                        <li>Paid</li>
                      ) : null}
                      {booking.acknowledged_at ? (
                        <li>
                          Acknowledged{' '}
                          {new Date(booking.acknowledged_at).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </li>
                      ) : null}
                      {pickupHm ? <li>Pickup set · {pickupHm}</li> : null}
                      {openCancels[booking.id] ? (
                        <li>
                          Cancellation requested{' '}
                          {new Date(openCancels[booking.id]!.created_at).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </li>
                      ) : null}
                      {booking.status === 'cancelled' ? <li>Cancelled</li> : null}
                      {booking.payment_status === 'refunded' ? <li>Refunded</li> : null}
                    </ol>
                  </div>
                  <BookingMessageThread
                    bookingId={booking.id}
                    canCompose={bookingAllowsMessaging({
                      status: booking.status,
                      payment_status: booking.payment_status,
                      openCancellation: Boolean(openCancels[booking.id]),
                    })}
                    composeBlock={
                      messagingComposeBlock({
                        status: booking.status,
                        payment_status: booking.payment_status,
                        openCancellation: Boolean(openCancels[booking.id]),
                      }) === 'closed'
                        ? 'closed'
                        : 'unpaid'
                    }
                    viewerRole="supplier"
                    listingTitle={listingMeta[booking.listing_id]?.title ?? 'Listing'}
                    listingId={booking.listing_id}
                    supplierId={user?.id}
                    customerEmail={booking.guest_email}
                    customerName={booking.guest_name}
                    bookingNumber={typeof booking.booking_number === 'number' ? booking.booking_number : undefined}
                    bookingDate={booking.booking_date}
                  />
                </div>
              </>
            );
          })()}
        </SupplierModalShell>
      )}

      {cancelModal && partnerBookingIsOperatingTrip(cancelModal) && (
        <SupplierModalShell onClose={() => setCancelModal(null)} maxWidth="md">
          <SupplierModalHeader
            icon={Trash2}
            title={isPaidPaymentStatus(cancelModal.payment_status) ? 'Request cancellation' : 'Cancel unpaid booking'}
            subtitle={
              isPaidPaymentStatus(cancelModal.payment_status)
                ? 'The traveler must accept before this booking is cancelled.'
                : 'This booking is not paid. Cancelling releases the hold immediately.'
            }
            onClose={() => setCancelModal(null)}
          />
          <div className="space-y-4 p-4 sm:p-5">
            {isPaidPaymentStatus(cancelModal.payment_status) ? (
              <>
                <NoticeCallout title="Consequences before you send" tone="danger">
                  <p>
                    Traveler refund: a full refund is expected. Traverion does not send the Stripe refund
                    automatically; refund status becomes Refunded only after Stripe records it.
                  </p>
                  <p className="mt-1">
                    Supplier cancellation fee:{' '}
                    {supplierCancellationFeeEur(cancelReason) === 0
                      ? '€0 (force majeure / restriction)'
                      : `€${supplierCancellationFeeEur(cancelReason).toFixed(0)} (supplier-responsibility)`}
                  </p>
                  <p className="mt-1">
                    Reason: {supplierCancellationReasonLabel(cancelReason)}. Fee is recorded when the traveler accepts,
                    not when you send this request.
                  </p>
                  {isForceMajeureReason(cancelReason) ? (
                    <p className="mt-1">Force majeure is audited. Explain clearly — this is not an automatic fee waiver button.</p>
                  ) : null}
                </NoticeCallout>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink" htmlFor="cancel-reason-code">
                    Reason
                  </label>
                  <select
                    id="cancel-reason-code"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-finland"
                  >
                    {CANCELLATION_REASONS.map((reason) => (
                      <option key={reason.id} value={reason.id}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink" htmlFor="cancel-reason-text">
                    Explanation
                  </label>
                  <textarea
                    id="cancel-reason-text"
                    value={cancelReasonText}
                    onChange={(e) => setCancelReasonText(e.target.value)}
                    rows={4}
                    className="tv-input min-h-[6rem]"
                    placeholder="What happened, and why the traveler cannot take this booking."
                  />
                </div>
                {isForceMajeureReason(cancelReason) ? (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-ink" htmlFor="cancel-evidence">
                      Evidence note (optional)
                    </label>
                    <textarea
                      id="cancel-evidence"
                      value={cancelEvidence}
                      onChange={(e) => setCancelEvidence(e.target.value)}
                      rows={2}
                      className="tv-input"
                      placeholder="Weather warning, official restriction, or other note for the record."
                    />
                  </div>
                ) : null}
                {cancelError ? <p className="text-sm text-red-700">{cancelError}</p> : null}
                <p className="text-xs text-ink-faint">
                  Policy {snapshotSupplierCancellationPolicy(cancelReason).policy_id}. Traverion does not auto-accept if
                  the traveler does not respond.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setCancelModal(null)} className="tv-btn-ghost">
                    Keep booking
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRequestSupplierCancel()}
                    disabled={updatingId === cancelModal.id || !canEditBookings}
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {updatingId === cancelModal.id ? 'Sending…' : 'Send request to traveler'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-900">
                  Cancel unpaid booking{' '}
                  <span className="font-semibold">
                    {typeof cancelModal.booking_number === 'number' ? `#${cancelModal.booking_number}` : 'this hold'}
                  </span>
                  . No traveler refund is due because payment is not complete.
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setCancelModal(null)} className="tv-btn-ghost">
                    Keep booking
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleStatusChange(cancelModal, 'cancelled', {
                        cancellation_reason: 'unpaid_release',
                        refund_choice: 'no_refund',
                      })
                    }
                    disabled={updatingId === cancelModal.id || !canEditBookings}
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Release hold
                  </button>
                </div>
              </>
            )}
          </div>
        </SupplierModalShell>
      )}
    </div>
  );
}
