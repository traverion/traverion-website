import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
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
} from 'lucide-react';
import type { TourPackage } from '../../types/tour';
import { LISTING_PLACEHOLDER_IMAGE } from '../../lib/listingQualityScore';
import { orderedPhotoUrls, photoSlotsFromTourPackage } from '../../lib/listingPhotoGrid';
import { SkeletonListItem } from '../../components/ui/Skeleton';
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
type BookingView = 'today' | 'upcoming' | 'past' | 'all';

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
  const [filterListingId, setFilterListingId] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterQuery, setFilterQuery] = useState('');

  const [bookingsListPage, setBookingsListPage] = useState(1);
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
      if (view === 'today') {
        if (b.booking_date !== todayIso || b.status === 'cancelled') return false;
      }
      if (view === 'upcoming') {
        if (!b.booking_date) return false;
        if (b.booking_date <= todayIso || b.status === 'cancelled') return false;
      }
      if (view === 'past') {
        if (!b.booking_date) return false;
        if (b.booking_date >= todayIso) return false;
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
          <div className="mt-6 flex gap-1 rounded-full bg-black/[0.04] p-1 w-fit">
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
                className={`lux-flat rounded-full px-3.5 py-1.5 text-sm font-medium ${
                  view === id ? 'bg-paper-raised text-ink shadow-sm' : 'text-ink-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </SupplierPageHero>

      {bookings.length > 0 && (
      <div className="mb-6">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <div className="flex min-w-[min(100%,12rem)] flex-1 flex-col gap-1 sm:flex-none sm:min-w-[11rem]">
              <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Tour</label>
              <select
                value={filterListingId}
                onChange={(e) => setFilterListingId(e.target.value)}
                className="w-full rounded-xl border-0 bg-paper-raised px-3 py-2 text-sm ring-1 ring-black/[0.06] focus:ring-2 focus:ring-finland"
              >
                <option value="">All tours</option>
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
      )}

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
        <SupplierEmptyState
          title="No bookings yet"
          body="When travelers book your tours, they appear here."
        />
      ) : filteredBookings.length === 0 ? (
        <SupplierEmptyState
          title="Nothing in this view"
          body="Try another tab, date range, or search."
        />
      ) : (
        <div className="space-y-4">
          <div className="space-y-4">
            {paginatedBookings.map((booking) => {
              const startHm = booking.start_time ? pgTimeToHm(booking.start_time) ?? null : null;
              const pickupHm = booking.pickup_time ? pgTimeToHm(booking.pickup_time) ?? null : null;
              const meta = listingMeta[booking.listing_id];
              const listingTitle = meta?.title ?? 'Tour';
              const paidLabel = formatBookingMoney(booking.amount_paid, booking.currency);
              const needsAck = !booking.acknowledged_at && booking.status !== 'cancelled';
              return (
                <article
                  key={booking.id}
                  id={`supplier-booking-row-${booking.id}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedBookingId(booking.id)}
                    className={`lux-flat flex w-full min-w-0 items-stretch overflow-hidden rounded-2xl bg-paper-raised text-left transition-shadow ${
                      highlightBookingId === booking.id ? 'ring-2 ring-finland/35' : ''
                    }`}
                  >
                    <img
                      src={meta?.imageUrl ?? LISTING_PLACEHOLDER_IMAGE}
                      alt=""
                      className="w-20 sm:w-28 object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1 p-3.5 sm:p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-ink truncate">{booking.guest_name || 'Guest'}</p>
                          <p className="mt-0.5 text-sm text-ink-muted truncate">{listingTitle}</p>
                        </div>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ring-1 ${bookingStatusClass(booking.status)}`}>
                          {booking.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-ink-muted">
                        {formatActivityDateLong(booking.booking_date, startHm)}
                        {' · '}
                        {booking.guests} guest{booking.guests === 1 ? '' : 's'}
                        {paidLabel ? ` · ${paidLabel}` : ''}
                        {pickupHm ? ` · Pickup ${pickupHm}` : ''}
                      </p>
                      {needsAck ? (
                        <p className="mt-1 text-xs font-medium text-sky-800">Needs acknowledgment</p>
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

      {selectedBooking && (
        <SupplierModalShell onClose={() => setSelectedBookingId(null)} maxWidth="lg">
          {(() => {
            const booking = selectedBooking;
            const startHm = booking.start_time ? pgTimeToHm(booking.start_time) ?? null : null;
            const pickupHm = booking.pickup_time ? pgTimeToHm(booking.pickup_time) ?? null : null;
            const meta = listingMeta[booking.listing_id];
            const listingTitle = meta?.title ?? 'Tour';
            const paidLabel = formatBookingMoney(booking.amount_paid, booking.currency);
            const needsAck = !booking.acknowledged_at && booking.status !== 'cancelled';
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
                    <img
                      src={meta?.imageUrl ?? LISTING_PLACEHOLDER_IMAGE}
                      alt=""
                      className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ring-1 ${bookingStatusClass(booking.status)}`}>
                        {booking.status}
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
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Paid</dt>
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
                    {booking.special_requests?.trim() ? (
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Notes</dt>
                        <dd className="mt-0.5 whitespace-pre-wrap text-ink">{booking.special_requests.trim()}</dd>
                      </div>
                    ) : null}
                  </dl>

                  {canEditBookings && booking.status !== 'cancelled' ? (
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
                        disabled={busy}
                        onClick={() => setCancelModal(booking)}
                        className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            );
          })()}
        </SupplierModalShell>
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
