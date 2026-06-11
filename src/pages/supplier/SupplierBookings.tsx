import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Mail,
  MapPin,
  RefreshCw,
  ShoppingCart,
  Tag,
  Trash2,
  Users,
} from 'lucide-react';
import type { TourPackage } from '../../types/tour';
import { LISTING_PLACEHOLDER_IMAGE } from '../../lib/listingQualityScore';
import { orderedPhotoUrls, photoSlotsFromTourPackage } from '../../lib/listingPhotoGrid';
import { SkeletonListItem } from '../../components/ui/Skeleton';
import {
  SUPPLIER_PAGE_CLASS,
  SUPPLIER_HERO_STAT_GRID_CLASS,
  SUPPLIER_SECTION_HEADER_CLASS,
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

const BOOKINGS_PAGE_SIZE = 10;

type ListingBookingMeta = {
  title: string;
  imageUrl: string;
  location: string;
  duration: string;
};

function buildListingMeta(listing: TourPackage): ListingBookingMeta {
  const urls = orderedPhotoUrls(photoSlotsFromTourPackage(listing));
  const imageUrl = urls[0] || listing.image || LISTING_PLACEHOLDER_IMAGE;
  const location =
    [listing.city, listing.country ?? listing.destination].filter(Boolean).join(', ') ||
    listing.destination ||
    '—';
  return {
    title: listing.title,
    imageUrl,
    location,
    duration: listing.duration || '—',
  };
}

function formatBookingMoney(amount: number | null | undefined, currency: string | null | undefined): string | null {
  if (amount == null || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return null;
  const c = (currency ?? 'USD').trim() || 'USD';
  if (c === 'USD') return `$${Number(amount).toFixed(2)}`;
  return `${Number(amount).toFixed(2)} ${c}`;
}

function bookingStatusClass(status: string): string {
  if (status === 'confirmed') return 'bg-emerald-50 text-emerald-800 ring-emerald-200/80';
  if (status === 'cancelled') return 'bg-slate-100 text-slate-600 ring-slate-200/80';
  return 'bg-amber-50 text-amber-900 ring-amber-200/80';
}

const CANCELLATION_REASONS = [
  { id: 'customer_request', label: 'Customer requested cancellation' },
  { id: 'force_majeure', label: 'Force majeure' },
  { id: 'operational', label: 'Operational reasons' },
] as const;

const REFUND_CHOICES = [
  { id: 'full_refund', label: 'Full refund' },
  { id: 'no_refund', label: 'No refund' },
  { id: 'reschedule', label: 'Offer reschedule' },
] as const;

type RefundChoice = (typeof REFUND_CHOICES)[number]['id'];
type BookingView = 'all' | 'pending' | 'needs_ack' | 'upcoming' | 'cancelled';

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

function formatPurchaseDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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
  const [filterListingId, setFilterListingId] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterQuery, setFilterQuery] = useState('');

  const [bookingsListPage, setBookingsListPage] = useState(1);
  const [bookingDetailsOpen, setBookingDetailsOpen] = useState<Record<string, boolean>>({});
  const [highlightBookingId, setHighlightBookingId] = useState<string | null>(null);

  const [cancelModal, setCancelModal] = useState<BookingRow | null>(null);
  const [cancelReason, setCancelReason] = useState<string>(CANCELLATION_REASONS[0].id);
  const [cancelRefund, setCancelRefund] = useState<RefundChoice>('full_refund');

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
      setBookings(bookingsList);
      setListingMeta(meta);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bookings');
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

  useEffect(() => {
    if (!highlightBookingId) return;
    setBookingDetailsOpen((prev) => ({ ...prev, [highlightBookingId]: true }));
  }, [highlightBookingId]);

  const todayIso = new Date().toISOString().slice(0, 10);

  const filteredBookings = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    return bookings.filter((b) => {
      if (view === 'pending' && b.status !== 'pending') return false;
      if (view === 'needs_ack' && (b.status === 'cancelled' || !!b.acknowledged_at)) return false;
      if (view === 'upcoming') {
        if (!b.booking_date) return false;
        if (b.booking_date < todayIso || b.status === 'cancelled') return false;
      }
      if (view === 'cancelled' && b.status !== 'cancelled') return false;
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
  }, [bookings, filterDateFrom, filterDateTo, filterListingId, filterQuery, listingMeta, todayIso, view]);

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
  }, [view, filterListingId, filterDateFrom, filterDateTo, filterQuery]);

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

  const bookingStats = useMemo(() => {
    const total = bookings.length;
    const confirmed = bookings.filter((b) => b.status === 'confirmed').length;
    const needsAction = bookings.filter((b) => b.status !== 'cancelled' && (!b.acknowledged_at || b.status !== 'confirmed')).length;
    return { total, confirmed, needsAction };
  }, [bookings]);

  const handleStatusChange = useCallback(
    async (
      booking: BookingRow,
      status: 'pending' | 'confirmed' | 'cancelled',
      options?: { cancellation_reason?: string; refund_choice?: RefundChoice }
    ) => {
      if (!canEditBookings) return;
      setUpdatingId(booking.id);
      const previousStatus = booking.status;
      const ok = await updateBookingStatus(booking.id, status, options);
      if (ok) {
        if (status === 'cancelled' && previousStatus === 'confirmed' && booking.booking_date) {
          await decrementAvailabilityBooked(booking.listing_id, booking.booking_date);
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
      }
      setUpdatingId(null);
      if (status === 'cancelled') {
        setCancelModal(null);
      }
    },
    [canEditBookings]
  );

  const handleAcknowledge = useCallback(
    async (booking: BookingRow) => {
      if (!canEditBookings) return;
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

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        icon={Calendar}
        title="Bookings"
        description="Manage incoming supplier bookings, confirm availability, and keep guests updated."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
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
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </button>
          </div>
        }
      >
        {!loading && bookings.length > 0 && (
          <div className={SUPPLIER_HERO_STAT_GRID_CLASS}>
            <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-gray-900 tabular-nums">{bookingStats.total}</p>
              <p className="text-[11px] font-medium text-gray-500">Total</p>
            </div>
            <div className="rounded-xl bg-emerald-50/80 px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-emerald-800 tabular-nums">{bookingStats.confirmed}</p>
              <p className="text-[11px] font-medium text-emerald-700">Confirmed</p>
            </div>
            <div className={`rounded-xl px-3 py-2.5 text-center ${bookingStats.needsAction > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
              <p className={`text-lg font-bold tabular-nums ${bookingStats.needsAction > 0 ? 'text-amber-900' : 'text-gray-900'}`}>
                {bookingStats.needsAction}
              </p>
              <p className={`text-[11px] font-medium ${bookingStats.needsAction > 0 ? 'text-amber-800' : 'text-gray-500'}`}>
                Needs action
              </p>
            </div>
          </div>
        )}
      </SupplierPageHero>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className={`${SUPPLIER_SECTION_HEADER_CLASS} text-xs font-semibold uppercase tracking-wide text-gray-500`}>
          Filters
        </div>
        <div className="flex flex-col gap-3 px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <div className="flex min-w-[min(100%,12rem)] flex-1 flex-col gap-1 sm:flex-none sm:min-w-[11rem]">
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Product</label>
              <select
                value={filterListingId}
                onChange={(e) => setFilterListingId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-finland"
              >
                <option value="">All products</option>
                {listingOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Activity date</label>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-[9.25rem] min-w-0 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:ring-2 focus:ring-finland"
                  aria-label="Activity date from"
                />
                <span className="shrink-0 text-sm text-gray-400">-</span>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="w-[9.25rem] min-w-0 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:ring-2 focus:ring-finland"
                  aria-label="Activity date to"
                />
              </div>
            </div>
            <div className="flex min-w-[10rem] flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Status view</label>
              <select
                value={view}
                onChange={(e) => setView(e.target.value as BookingView)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-finland"
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="needs_ack">Needs acknowledgment</option>
                <option value="upcoming">Upcoming</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
            <div className="flex min-w-[min(100%,14rem)] flex-1 flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Search</label>
              <input
                type="search"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Guest, email, booking ID, product name..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-finland"
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
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Clear filters
              </button>
              {!loading && (
                <span className="text-sm text-gray-500">
                  {filteredBookings.length} of {bookings.length}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {error}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-red-100 px-3 py-1.5 font-medium text-red-800 hover:bg-red-200"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">No bookings yet</h2>
          <p className="mt-1 text-gray-500">Bookings appear here when travelers reserve your experiences.</p>
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">No matching bookings</h2>
          <p className="mt-1 text-gray-500">Try another status, date range, or search term.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-4">
            {paginatedBookings.map((booking) => {
              const detailsOpen = !!bookingDetailsOpen[booking.id];
              const startHm = booking.start_time ? pgTimeToHm(booking.start_time) ?? null : null;
              const pickupHm = booking.pickup_time ? pgTimeToHm(booking.pickup_time) ?? null : null;
              const refLabel =
                typeof booking.booking_number === 'number' && booking.booking_number > 0
                  ? `#${booking.booking_number}`
                  : booking.id.slice(0, 8);
              const meta = listingMeta[booking.listing_id];
              const listingTitle = meta?.title ?? 'Listing';
              const paidLabel = formatBookingMoney(booking.amount_paid, booking.currency);
              const needsAck = !booking.acknowledged_at && booking.status !== 'cancelled';
              return (
                <article
                  key={booking.id}
                  id={`supplier-booking-row-${booking.id}`}
                  className={`w-full min-w-0 overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-sm transition-all duration-300 ease-out hover:border-gray-300 hover:shadow-md ${
                    highlightBookingId === booking.id ? 'ring-2 ring-finland/35 border-finland/30' : ''
                  }`}
                >
                  <div className="flex min-w-0 gap-0 sm:gap-0">
                    <div className="relative w-24 shrink-0 sm:w-32 md:w-36">
                      <img
                        src={meta?.imageUrl ?? LISTING_PLACEHOLDER_IMAGE}
                        alt=""
                        className="h-full min-h-[7.5rem] w-full object-cover sm:min-h-[8.5rem]"
                      />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/10 to-transparent sm:bg-gradient-to-t sm:from-black/15 sm:to-transparent" />
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col p-3.5 sm:p-4 md:p-5">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-snug text-gray-900 sm:text-base">{listingTitle}</p>
                          {meta ? (
                            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                                {meta.location}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3 shrink-0" aria-hidden />
                                {meta.duration}
                              </span>
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ring-1 ${bookingStatusClass(booking.status)}`}
                          >
                            {booking.status}
                          </span>
                          {needsAck ? (
                            <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800 ring-1 ring-sky-200/80">
                              Needs ack
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <p className="mt-2.5 text-sm font-medium text-gray-800">{booking.guest_name || 'Guest'}</p>
                      {booking.guest_email ? (
                        <p className="mt-0.5 truncate text-xs text-gray-500">{booking.guest_email}</p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 font-medium ring-1 ring-slate-200/80">
                          <Calendar className="h-3.5 w-3.5 text-gray-400" aria-hidden />
                          {formatActivityDateLong(booking.booking_date, startHm)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-slate-200/80">
                          <Tag className="h-3.5 w-3.5 text-gray-400" aria-hidden />
                          <span className="font-mono">{refLabel}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-slate-200/80">
                          <Users className="h-3.5 w-3.5 text-gray-400" aria-hidden />
                          {booking.guests} guest{booking.guests === 1 ? '' : 's'}
                        </span>
                        {paidLabel ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-finland/5 px-2 py-1 font-semibold text-finland ring-1 ring-finland/15">
                            {paidLabel}
                          </span>
                        ) : null}
                        {pickupHm ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 font-medium text-emerald-800 ring-1 ring-emerald-200/80">
                            Pickup {pickupHm}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
                        <p className="flex items-center gap-1.5 text-xs text-gray-500">
                          <ShoppingCart className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Booked {formatPurchaseDateShort(booking.created_at)}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setBookingDetailsOpen((prev) => ({
                              ...prev,
                              [booking.id]: !prev[booking.id],
                            }))
                          }
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-finland transition-colors hover:bg-finland/5"
                          aria-expanded={detailsOpen}
                        >
                          {detailsOpen ? 'Hide details' : 'Show details'}
                          <ChevronDown
                            className={`h-4 w-4 transition-transform duration-300 ${detailsOpen ? 'rotate-180' : ''}`}
                            aria-hidden
                          />
                        </button>
                      </div>

                      {booking.status !== 'cancelled' && !booking.pickup_time && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-sm text-amber-950">
                          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                          <span>Pickup time not set.</span>
                          <a
                            href="/partner/pickup"
                            className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950"
                          >
                            Open pickup planner
                          </a>
                        </div>
                      )}

                      <div
                        className={`grid transition-all duration-300 ease-out ${
                          detailsOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                        }`}
                      >
                        <div className="overflow-hidden">
                          <div className="space-y-3 border-t border-gray-100 pt-3">
                      {booking.guest_email ? (
                        <p className="break-all text-sm text-gray-700">
                          <span className="font-medium text-gray-500">Email </span>
                          <a href={`mailto:${booking.guest_email}`} className="text-finland hover:underline">
                            {booking.guest_email}
                          </a>
                        </p>
                      ) : null}

                      {booking.special_requests ? (
                        <div>
                          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Requests & notes</p>
                          <p className="whitespace-pre-wrap break-words text-sm text-gray-700">
                            {booking.special_requests}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No special requests.</p>
                      )}

                      {booking.acknowledged_at && (
                        <p className="text-xs text-gray-500">Acknowledged</p>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {booking.guest_email ? (
                          <a
                            href={`mailto:${booking.guest_email}?subject=Your booking – ${listingTitle}`}
                            className="inline-flex min-h-[40px] touch-manipulation items-center justify-center gap-1 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-800"
                          >
                            <Mail className="h-3.5 w-3.5" aria-hidden />
                            Contact
                          </a>
                        ) : null}
                        {booking.status !== 'confirmed' && booking.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={() => void handleStatusChange(booking, 'confirmed')}
                            disabled={!canEditBookings || updatingId === booking.id}
                            className="min-h-[40px] touch-manipulation rounded-xl bg-green-100 px-3 py-2 text-xs font-semibold text-green-800 disabled:opacity-50"
                          >
                            Confirm
                          </button>
                        )}
                        {!booking.acknowledged_at && booking.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={() => void handleAcknowledge(booking)}
                            disabled={!canEditBookings || updatingId === booking.id}
                            className="inline-flex min-h-[40px] touch-manipulation items-center justify-center gap-1.5 rounded-xl bg-blue-100 px-3 py-2 text-xs font-semibold text-blue-800 disabled:opacity-50"
                          >
                            <CheckCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            Acknowledge
                          </button>
                        )}
                        {booking.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={() => setCancelModal(booking)}
                            disabled={!canEditBookings || updatingId === booking.id}
                            className="inline-flex min-h-[40px] touch-manipulation items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            Cancel
                          </button>
                        )}
                      </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <nav
            className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-4"
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
                  className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                {paginationItems.map((item, index) =>
                  item === 'ellipsis' ? (
                    <span key={`ellipsis-${index}`} className="select-none px-1.5 text-sm text-gray-400" aria-hidden>
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
                          : 'border border-gray-200 text-gray-800 hover:bg-gray-50'
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
                  className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            ) : null}
          </nav>
        </div>
      )}

      {cancelModal && (
        <SupplierModalShell onClose={() => setCancelModal(null)} maxWidth="md">
          <SupplierModalHeader
            icon={Trash2}
            title="Cancel booking"
            subtitle="Set a reason and refund handling for this cancellation."
            onClose={() => setCancelModal(null)}
          />
          <div className="space-y-4 p-4 sm:p-5">
            <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-900">
              You are cancelling booking{' '}
              <span className="font-semibold">
                {typeof cancelModal.booking_number === 'number' ? `#${cancelModal.booking_number}` : cancelModal.id.slice(0, 8)}
              </span>
              .
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Reason</label>
              <select
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
              <label className="text-sm font-medium text-gray-700">Refund choice</label>
              <select
                value={cancelRefund}
                onChange={(e) => setCancelRefund(e.target.value as RefundChoice)}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-finland"
              >
                {REFUND_CHOICES.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelModal(null)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Keep booking
              </button>
              <button
                type="button"
                onClick={() =>
                  void handleStatusChange(cancelModal, 'cancelled', {
                    cancellation_reason: cancelReason,
                    refund_choice: cancelRefund,
                  })
                }
                disabled={updatingId === cancelModal.id || !canEditBookings}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Confirm cancellation
              </button>
            </div>
          </div>
        </SupplierModalShell>
      )}
    </div>
  );
}
