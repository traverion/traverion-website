import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Loader2, Search } from 'lucide-react';
import { invokeAdminEdgeFunction } from '../../lib/adminEdgeFunction';
import { isSupabaseConfigured } from '../../lib/supabase';
import { formatMoney, isStripeTestCheckoutSession } from '../../lib/money';
import { STRIPE_TEST_AMOUNT_BADGE } from '../../lib/traveler-env-presentation';
import AdminStripeTestNotice from './AdminStripeTestNotice';
import { isCollectedBooking, partnerPaymentLabel, type MoneyBookingRow } from '../../lib/payment-states';
import { bookingLifecycleLabel } from '../../lib/status-language';
import NoticeCallout from '../NoticeCallout';
import StatusChip, { toneForPaymentLabel } from '../StatusChip';
import EmptyState from '../EmptyState';
import { adminBookingDateLine } from '../../lib/admin-bookings-date-line';
import { travelerPublicBookingReference } from '../../lib/public-booking-reference';
import { formatBookingParticipantsLabel } from '../../lib/participant-mix';
import {
  displayListingTitleFromPurchase,
  displayStartTimeFromPurchase,
  formatTravelerDepartureClock,
  displayDepartureTimezoneFromPurchase,
} from '../../lib/purchase-snapshot';
import { adminBookingAmountCaption, adminBookingTotalMajor } from '../../lib/admin-booking-ops';
import AdminBookingDrawer from './AdminBookingDrawer';

export type AdminBookingRow = MoneyBookingRow & {
  id: string;
  listing_id: string;
  listing_title: string | null;
  listing_image?: string | null;
  listing_city: string | null;
  listing_country: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  guest_email: string | null;
  guest_name: string | null;
  guests: number | null;
  guest_breakdown?: { label?: string; quantity?: number }[] | null;
  booking_date: string | null;
  check_out: string | null;
  nights: number | null;
  special_requests?: string | null;
  purchase_snapshot?: unknown;
  booking_number: number | null;
  public_reference?: string | null;
  start_time?: string | null;
  checkout_session_id?: string | null;
  payment_intent_id?: string | null;
  hold_expires_at?: string | null;
  created_at: string;
};

type Queue =
  | 'all'
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'payment_failed'
  | 'refund_due'
  | 'refunded'
  | 'partial_refund'
  | 'disputed';

type SortKey = 'created_desc' | 'created_asc' | 'departure_asc' | 'amount_desc' | 'amount_asc';

type ListResponse = {
  items: AdminBookingRow[];
  total: number;
  page: number;
  pageSize: number;
};

type RentalOpsException = {
  exception_kind?: string;
  entity_id?: string;
  booking_id?: string | null;
  listing_id?: string | null;
  hold_status?: string | null;
  booking_status?: string | null;
  payment_status?: string | null;
  hold_expires_at?: string | null;
  observed_at?: string | null;
  detail?: Record<string, unknown> | null;
};

function rentalExceptionCopy(kind: string | undefined): { title: string; impact: string; recovery: string } {
  switch (kind) {
    case 'stuck_hold':
      return {
        title: 'Hold still marked active',
        impact: 'Stock can stay reserved after the hold should have ended.',
        recovery: 'The existing hold expiry releases it. This list does not refund or cancel.',
      };
    case 'pending_hold_expired':
      return {
        title: 'Unpaid hold has expired',
        impact: 'The booking is still pending after the hold window.',
        recovery: 'Confirm the hold row is expired before treating the dates as free.',
      };
    case 'paid_unconfirmed':
      return {
        title: 'Paid, not confirmed',
        impact: 'Money was taken and the booking is not in the confirmed state.',
        recovery: 'Open the booking and use the existing promotion or refund path. Do not charge again from here.',
      };
    case 'failed_refund':
      return {
        title: 'Refund did not finish',
        impact: 'A cancellation expects money back and the refund is failed or stuck.',
        recovery: 'Use the existing refund tool after checking the payment. This row does not send a refund.',
      };
    case 'earnings_missing':
      return {
        title: 'Earnings snapshot missing',
        impact: 'The rental is confirmed and paid without a commercial snapshot.',
        recovery: 'Replay uses the existing webhook repair. Do not create a second earning by hand from this list.',
      };
    default:
      return {
        title: 'Rental exception',
        impact: 'This row needs a manual look.',
        recovery: 'Open the booking. This list does not move money.',
      };
  }
}

const QUEUES: Array<[Queue, string]> = [
  ['all', 'All'],
  ['pending', 'Pending'],
  ['confirmed', 'Confirmed'],
  ['cancelled', 'Cancelled'],
  ['payment_failed', 'Payment failed'],
  ['refund_due', 'Refund due'],
  ['refunded', 'Refunded'],
  ['partial_refund', 'Partially refunded'],
  ['disputed', 'Disputed'],
];

function readHashState() {
  const raw = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '');
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);
  const status = params.get('status');
  const queue = QUEUES.some(([id]) => id === status) ? (status as Queue) : 'all';
  const sort = params.get('sort');
  const sortKey: SortKey =
    sort === 'created_asc' || sort === 'departure_asc' || sort === 'amount_desc' || sort === 'amount_asc'
      ? sort
      : 'created_desc';
  return {
    queue,
    search: params.get('q') ?? '',
    supplierId: params.get('supplier') ?? '',
    listingId: params.get('listing') ?? '',
    travelFrom: params.get('from') ?? '',
    travelTo: params.get('to') ?? '',
    createdFrom: params.get('createdFrom') ?? '',
    createdTo: params.get('createdTo') ?? '',
    paymentStatus: params.get('pay') ?? '',
    sort: sortKey,
    page: Math.max(1, Number(params.get('page') || '1') || 1),
    bookingId: params.get('booking') ?? '',
  };
}

function writeHashState(state: ReturnType<typeof readHashState>) {
  const params = new URLSearchParams();
  if (state.queue !== 'all') params.set('status', state.queue);
  if (state.search) params.set('q', state.search);
  if (state.supplierId) params.set('supplier', state.supplierId);
  if (state.listingId) params.set('listing', state.listingId);
  if (state.travelFrom) params.set('from', state.travelFrom);
  if (state.travelTo) params.set('to', state.travelTo);
  if (state.createdFrom) params.set('createdFrom', state.createdFrom);
  if (state.createdTo) params.set('createdTo', state.createdTo);
  if (state.paymentStatus) params.set('pay', state.paymentStatus);
  if (state.sort !== 'created_desc') params.set('sort', state.sort);
  if (state.page > 1) params.set('page', String(state.page));
  if (state.bookingId) params.set('booking', state.bookingId);
  const query = params.toString();
  window.history.replaceState({}, '', query ? `#bookings?${query}` : '#bookings');
}

export default function AdminBookingsPanel() {
  const initial = readHashState();
  const [items, setItems] = useState<AdminBookingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<Queue>(initial.queue);
  const [searchInput, setSearchInput] = useState(initial.search);
  const [search, setSearch] = useState(initial.search);
  const [supplierId, setSupplierId] = useState(initial.supplierId);
  const [listingId, setListingId] = useState(initial.listingId);
  const [travelFrom, setTravelFrom] = useState(initial.travelFrom);
  const [travelTo, setTravelTo] = useState(initial.travelTo);
  const [createdFrom, setCreatedFrom] = useState(initial.createdFrom);
  const [createdTo, setCreatedTo] = useState(initial.createdTo);
  const [paymentStatus, setPaymentStatus] = useState(initial.paymentStatus);
  const [sort, setSort] = useState<SortKey>(initial.sort);
  const [page, setPage] = useState(initial.page);
  const [bookingId, setBookingId] = useState(initial.bookingId);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [listings, setListings] = useState<Array<{ id: string; title: string | null }>>([]);
  const [rentalExceptions, setRentalExceptions] = useState<RentalOpsException[]>([]);
  const [rentalExceptionsError, setRentalExceptionsError] = useState<string | null>(null);

  const loadRentalExceptions = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const data = await invokeAdminEdgeFunction<{
        ok?: boolean;
        items?: RentalOpsException[];
        count?: number;
        error?: string;
      }>({
        action: 'rental_ops_exceptions',
        bookingPageSize: 40,
      });
      setRentalExceptions(Array.isArray(data.items) ? data.items : []);
      setRentalExceptionsError(data.error ?? null);
    } catch (e) {
      setRentalExceptions([]);
      setRentalExceptionsError(e instanceof Error ? e.message : 'Could not load rental exceptions');
    }
  }, []);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await invokeAdminEdgeFunction<ListResponse>({
        action: 'bookings_list',
        bookingStatus: queue,
        bookingSearch: search,
        bookingSupplierId: supplierId,
        bookingListingId: listingId,
        bookingTravelFrom: travelFrom,
        bookingTravelTo: travelTo,
        bookingCreatedFrom: createdFrom,
        bookingCreatedTo: createdTo,
        bookingPaymentStatus: paymentStatus,
        bookingSort: sort,
        bookingPage: page,
        bookingPageSize: 25,
      });
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total) || 0);
      setPageSize(Number(data.pageSize) || 25);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load bookings');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [queue, search, supplierId, listingId, travelFrom, travelTo, createdFrom, createdTo, paymentStatus, sort, page]);

  useEffect(() => {
    if (isSupabaseConfigured()) void load();
  }, [load]);

  useEffect(() => {
    if (isSupabaseConfigured()) void loadRentalExceptions();
  }, [loadRentalExceptions]);

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    writeHashState({
      queue,
      search,
      supplierId,
      listingId,
      travelFrom,
      travelTo,
      createdFrom,
      createdTo,
      paymentStatus,
      sort,
      page,
      bookingId,
    });
  }, [queue, search, supplierId, listingId, travelFrom, travelTo, createdFrom, createdTo, paymentStatus, sort, page, bookingId]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    void invokeAdminEdgeFunction<{ suppliers: Array<{ id: string; name: string }>; listings: Array<{ id: string; title: string | null }> }>({
      action: 'booking_filter_options',
    })
      .then((data) => {
        setSuppliers(data.suppliers ?? []);
        setListings(data.listings ?? []);
      })
      .catch(() => {
        setSuppliers([]);
        setListings([]);
      });
  }, []);

  const filtersActive =
    queue !== 'all' ||
    Boolean(search || supplierId || listingId || travelFrom || travelTo || createdFrom || createdTo || paymentStatus) ||
    sort !== 'created_desc';
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const clearFilters = () => {
    setQueue('all');
    setSearchInput('');
    setSearch('');
    setSupplierId('');
    setListingId('');
    setTravelFrom('');
    setTravelTo('');
    setCreatedFrom('');
    setCreatedTo('');
    setPaymentStatus('');
    setSort('created_desc');
    setPage(1);
  };

  return (
    <div className="space-y-3 font-sans">
      <div className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold tracking-tight text-[#18181b]">Bookings</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-[#52525b]">
              Marketplace bookings, newest first. Payment labels match travelers and suppliers.
            </p>
          </div>
          <button
            type="button"
            className="tv-btn-secondary h-9 px-3 text-[13px]"
            disabled={loading}
            onClick={() => {
              void load();
              void loadRentalExceptions();
            }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </button>
        </div>
        <AdminStripeTestNotice
          className="mt-3"
          body="Amounts come from Traverion's Stripe TEST environment. No real money has moved."
        />
        {!isSupabaseConfigured() ? (
          <div className="mt-3">
            <NoticeCallout title="Supabase not configured" tone="warn">
              Bookings need the live app configuration.
            </NoticeCallout>
          </div>
        ) : null}
        <div className="mt-3 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Booking queue">
          {QUEUES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`h-8 shrink-0 rounded-md px-2.5 text-[12px] font-semibold ${queue === id ? 'bg-[#f0f4fa] text-[#073b83]' : 'text-[#52525b]'}`}
              onClick={() => {
                setQueue(id);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative block sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a1a1aa]" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
              placeholder="Reference, guest, supplier, experience, or Stripe id"
              className="tv-input w-full pl-9 text-sm"
              aria-label="Search bookings"
            />
          </label>
          <select className="tv-input text-sm" aria-label="Supplier" value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setPage(1); }}>
            <option value="">All suppliers</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
            ))}
          </select>
          <select className="tv-input text-sm" aria-label="Experience" value={listingId} onChange={(e) => { setListingId(e.target.value); setPage(1); }}>
            <option value="">All experiences</option>
            {listings.map((listing) => (
              <option key={listing.id} value={listing.id}>{listing.title || 'Untitled'}</option>
            ))}
          </select>
          <select className="tv-input text-sm" aria-label="Sort bookings" value={sort} onChange={(e) => { setSort(e.target.value as SortKey); setPage(1); }}>
            <option value="created_desc">Newest bookings</option>
            <option value="created_asc">Oldest bookings</option>
            <option value="departure_asc">Upcoming departures</option>
            <option value="amount_desc">Highest booking amount</option>
            <option value="amount_asc">Lowest booking amount</option>
          </select>
          <select className="tv-input text-sm" aria-label="Payment status" value={paymentStatus} onChange={(e) => { setPaymentStatus(e.target.value); setPage(1); }}>
            <option value="">Any payment status</option>
            <option value="pending">Payment pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Payment failed</option>
            <option value="refunded">Refunded</option>
          </select>
          <input className="tv-input text-sm" type="date" aria-label="Travel date from" value={travelFrom} onChange={(e) => { setTravelFrom(e.target.value); setPage(1); }} />
          <input className="tv-input text-sm" type="date" aria-label="Travel date to" value={travelTo} onChange={(e) => { setTravelTo(e.target.value); setPage(1); }} />
          <input className="tv-input text-sm" type="date" aria-label="Created from" value={createdFrom} onChange={(e) => { setCreatedFrom(e.target.value); setPage(1); }} />
          <input className="tv-input text-sm" type="date" aria-label="Created to" value={createdTo} onChange={(e) => { setCreatedTo(e.target.value); setPage(1); }} />
        </div>
      </div>

      {rentalExceptionsError ? (
        <NoticeCallout title="Rental ops exceptions unavailable" tone="warn">
          {rentalExceptionsError}
        </NoticeCallout>
      ) : null}
      {rentalExceptions.length > 0 ? (
        <div className="rounded-lg border border-[#fcd34d] bg-[#fffbeb] px-3 py-3">
          <h3 className="text-[13px] font-bold text-[#92400e]">Rental ops exceptions ({rentalExceptions.length})</h3>
          <p className="mt-1 text-[12px] text-[#a16207]">
            Review holds, unpaid promotions, refunds, and missing earnings. Opening a row filters this list. It does not move money.
          </p>
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-[12px] text-[#78350f]">
            {rentalExceptions.slice(0, 25).map((ex) => {
              const bid = ex.booking_id || ex.entity_id || '';
              const described = rentalExceptionCopy(ex.exception_kind);
              return (
                <li key={`${ex.exception_kind}-${ex.entity_id}`} className="rounded-md bg-white/70 px-2.5 py-2">
                  <button
                    type="button"
                    className="text-left font-semibold underline-offset-2 hover:underline"
                    onClick={() => {
                      if (bid) setBookingId(bid);
                    }}
                  >
                    {described.title}
                  </button>
                  <p className="mt-0.5 text-[#a16207]">{described.impact}</p>
                  <p className="mt-0.5">
                    Booking {bid ? `${bid.slice(0, 8)}…` : '—'} · {ex.booking_status || '—'} ·{' '}
                    {ex.payment_status || ex.hold_status || '—'}
                    {ex.observed_at ? ` · ${ex.observed_at.slice(0, 16).replace('T', ' ')}` : ''}
                  </p>
                  <p className="mt-0.5">{described.recovery}</p>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {error ? (
        <NoticeCallout title="Could not load bookings" tone="danger">
          {error}
        </NoticeCallout>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <div className="rounded-lg border border-[#e5e7eb] bg-white px-4 py-2">
          <EmptyState
            icon={CalendarDays}
            title={filtersActive ? 'No bookings match' : 'No bookings yet'}
            body={filtersActive ? 'Nothing matches these filters.' : 'Bookings appear here when a traveler starts checkout.'}
            action={filtersActive ? <button type="button" className="tv-btn-secondary h-9 px-3 text-[13px]" onClick={clearFilters}>Clear filters</button> : undefined}
          />
        </div>
      ) : null}

      <div className="space-y-2">
        {items.map((booking) => {
          const lifecycle = bookingLifecycleLabel(booking.status, booking.payment_status, booking);
          const payLabel = partnerPaymentLabel(booking);
          // Phase 1770: match Partner Money / finance_summary — refunded is not Collected.
          const collected = isCollectedBooking(booking);
          const reference = travelerPublicBookingReference(booking.public_reference) ?? 'Reference pending';
          const title = displayListingTitleFromPurchase(booking.purchase_snapshot, booking.listing_title, 'Listing removed');
          const clock = formatTravelerDepartureClock(
            displayStartTimeFromPurchase(booking.purchase_snapshot, booking.start_time),
            displayDepartureTimezoneFromPurchase(booking.purchase_snapshot)
          );
          const totalAmount = adminBookingTotalMajor(booking);
          const caption = adminBookingAmountCaption(booking);
          return (
            <button
              key={booking.id}
              type="button"
              onClick={() => setBookingId(booking.id)}
              className="flex w-full items-start gap-3 rounded-lg border border-[#e5e7eb] bg-white px-3 py-2.5 text-left"
            >
              {booking.listing_image ? (
                <img src={booking.listing_image} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[#f4f4f5] text-[10px] text-[#71717a]">No photo</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <p className="truncate text-[13px] font-semibold text-[#18181b]">{title}</p>
                  <span className="text-[12px] font-semibold text-[#073b83]">{reference}</span>
                </div>
                <p className="truncate text-[12px] text-[#52525b]">
                  {booking.supplier_name ?? 'Unknown supplier'}
                  {booking.listing_city ? ` · ${booking.listing_city}` : ''}
                </p>
                <p className="mt-0.5 text-[12px] text-[#71717a]">
                  {booking.guest_name?.trim() || booking.guest_email || 'Guest'} · {adminBookingDateLine(booking)}
                  {clock ? ` · ${clock}` : ''} · {formatBookingParticipantsLabel(booking)}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <StatusChip tone={toneForPaymentLabel(lifecycle)}>{lifecycle}</StatusChip>
                  {payLabel !== lifecycle ? <StatusChip tone={toneForPaymentLabel(payLabel)}>{payLabel}</StatusChip> : null}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular-nums text-[13px] font-semibold text-[#18181b]">
                  {totalAmount != null ? formatMoney(totalAmount, booking.currency) : '—'}
                  {collected && isStripeTestCheckoutSession(booking.checkout_session_id) ? (
                    <span className="ml-1 text-[11px] font-semibold text-amber-700">{STRIPE_TEST_AMOUNT_BADGE}</span>
                  ) : null}
                </p>
                <p className="text-[11px] text-[#71717a]">{caption}</p>
                <p className="mt-0.5 text-[11px] text-[#a1a1aa]">
                  {new Date(booking.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {total > pageSize ? (
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <p className="text-[#71717a]">{total} bookings</p>
          <div className="flex gap-2">
            <button type="button" className="tv-btn-secondary h-8 px-2" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
            <button type="button" className="tv-btn-secondary h-8 px-2" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>
        </div>
      ) : null}

      {bookingId ? <AdminBookingDrawer bookingId={bookingId} onClose={() => setBookingId('')} /> : null}
    </div>
  );
}
