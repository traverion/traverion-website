import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Loader2, RefreshCw, Search } from 'lucide-react';
import { invokeAdminEdgeFunction } from '../../lib/adminEdgeFunction';
import { isSupabaseConfigured } from '../../lib/supabase';
import { formatMoney, isStripeTestCheckoutSession, appStripeIsTestMode } from '../../lib/money';
import {
  bookingPaymentWasCollected,
  partnerPaymentLabel,
  isRefundDueBooking,
  type MoneyBookingRow,
} from '../../lib/payment-states';
import { bookingLifecycleLabel } from '../../lib/status-language';
import NoticeCallout from '../NoticeCallout';
import StatusChip, { toneForPaymentLabel } from '../StatusChip';
import EmptyState from '../EmptyState';

type AdminBookingRow = MoneyBookingRow & {
  id: string;
  listing_id: string;
  listing_title: string | null;
  listing_city: string | null;
  listing_country: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  guest_email: string | null;
  guest_name: string | null;
  guests: number | null;
  booking_date: string | null;
  check_out: string | null;
  nights: number | null;
  booking_number: number | null;
  created_at: string;
};

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'cancelled';

function dateLine(b: AdminBookingRow): string {
  if (b.check_out && b.booking_date) {
    return `${b.booking_date} → ${b.check_out}`;
  }
  return b.booking_date ?? 'Date TBC';
}

export default function AdminBookingsPanel() {
  const [items, setItems] = useState<AdminBookingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [refundDueOnly, setRefundDueOnly] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await invokeAdminEdgeFunction<{ items: AdminBookingRow[]; truncated: boolean }>({
        action: 'bookings_list',
        bookingStatus: statusFilter,
        bookingSearch: search,
      });
      setItems(Array.isArray(data.items) ? data.items : []);
      setTruncated(Boolean(data.truncated));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load bookings');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    if (isSupabaseConfigured()) void load();
  }, [load]);

  // Debounce the free-text search so we don't fire a request per keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const visible = refundDueOnly ? items.filter((b) => isRefundDueBooking(b)) : items;
  const refundDueCount = items.filter((b) => isRefundDueBooking(b)).length;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-finland/10 flex items-center justify-center shrink-0">
            <CalendarDays className="w-5 h-5 text-finland" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-xl text-ink tracking-tight">Bookings</h2>
            <p className="text-sm text-ink-muted mt-1 leading-relaxed">
              Every traveler booking across all suppliers, most recent first. Payment and refund labels mirror what
              travelers and partners see — this list never re-derives its own status language.
            </p>
          </div>
        </div>

        {appStripeIsTestMode() ? (
          <div className="mb-4">
            <NoticeCallout title="Stripe TEST mode" tone="warn">
              Amounts below come from Traverion's Stripe TEST environment. No real money has moved.
            </NoticeCallout>
          </div>
        ) : null}

        {!isSupabaseConfigured() ? (
          <NoticeCallout title="Supabase not configured" tone="warn">
            Bookings need the live app configuration.
          </NoticeCallout>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1 rounded-full bg-paper p-1 shadow-soft ring-1 ring-black/[0.06]">
            {(
              [
                ['all', 'All'],
                ['pending', 'Pending'],
                ['confirmed', 'Confirmed'],
                ['cancelled', 'Cancelled'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={`lux-flat rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  statusFilter === id
                    ? 'bg-finland text-white shadow-sm ring-1 ring-finland/30'
                    : 'text-ink-muted hover:bg-finland/10 hover:text-finland'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setRefundDueOnly((v) => !v)}
            aria-pressed={refundDueOnly}
            className={`lux-flat rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ring-1 ${
              refundDueOnly
                ? 'bg-amber-500 text-white shadow-sm ring-amber-600/30'
                : 'bg-paper text-ink-muted ring-black/[0.06] hover:bg-finland/10 hover:text-finland'
            }`}
          >
            Refund due{refundDueCount > 0 ? ` · ${refundDueCount}` : ''}
          </button>
          <div className="relative min-w-[12rem] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Guest name, email, or #booking"
              className="tv-input w-full pl-9 text-sm"
              aria-label="Search bookings"
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || !isSupabaseConfigured()}
            className="tv-btn-secondary text-sm inline-flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
            Refresh
          </button>
        </div>

        {truncated ? (
          <p className="mt-3 text-xs text-ink-faint">
            Showing the most recent 500 bookings. Narrow with a filter or search to find an older one.
          </p>
        ) : null}
      </div>

      {error ? (
        <NoticeCallout title="Could not load bookings" tone="danger">
          {error}
        </NoticeCallout>
      ) : null}

      {!loading && !error && visible.length === 0 ? (
        <div className="rounded-2xl bg-paper-raised px-4 py-2 shadow-soft ring-1 ring-black/[0.06]">
          <EmptyState
            icon={CalendarDays}
            title={items.length === 0 ? 'No bookings yet' : 'No bookings match'}
            body={
              items.length === 0
                ? 'No traveler has completed a booking yet. They will appear here as soon as one comes in.'
                : 'Nothing matches this filter or search. Try clearing it.'
            }
          />
        </div>
      ) : null}

      <div className="space-y-2">
        {visible.map((b) => {
          const lifecycle = bookingLifecycleLabel(b.status, b.payment_status);
          const payLabel = partnerPaymentLabel(b);
          const collected =
            b.amount_paid != null && Number(b.amount_paid) > 0 && bookingPaymentWasCollected(b.payment_status);
          return (
            <div
              key={b.id}
              className="rounded-2xl bg-paper-raised px-4 py-3.5 shadow-soft ring-1 ring-black/[0.06] flex flex-wrap items-start justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {b.booking_number != null ? (
                    <span className="font-mono text-finland font-semibold text-sm tracking-wide">
                      #{b.booking_number}
                    </span>
                  ) : null}
                  <p className="font-semibold text-ink truncate">{b.listing_title ?? 'Listing removed'}</p>
                </div>
                <p className="mt-0.5 text-sm text-ink-muted truncate">
                  {b.supplier_name ?? 'Unknown supplier'}
                  {b.listing_city ? ` · ${b.listing_city}` : ''}
                </p>
                <p className="mt-1 text-xs text-ink-faint">
                  {b.guest_name?.trim() || b.guest_email || 'Guest'} · {dateLine(b)}
                  {b.guests ? ` · ${b.guests} guest${b.guests === 1 ? '' : 's'}` : ''}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusChip tone={toneForPaymentLabel(lifecycle)}>{lifecycle}</StatusChip>
                  {payLabel !== lifecycle ? (
                    <StatusChip tone={toneForPaymentLabel(payLabel)}>{payLabel}</StatusChip>
                  ) : null}
                </div>
              </div>
              <div className="text-right shrink-0">
                {collected ? (
                  <p className="tabular-nums font-semibold text-ink">
                    {formatMoney(Number(b.amount_paid), b.currency)}
                    {isStripeTestCheckoutSession(b.checkout_session_id) ? (
                      <span className="ml-1 text-xs font-semibold text-amber-700">TEST</span>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-sm text-ink-faint">—</p>
                )}
                <p className="mt-0.5 text-xs text-ink-faint">
                  {new Date(b.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
