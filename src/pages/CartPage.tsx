/**
 * Active inventory reservations. A row stays here only while the server hold
 * has not expired. Confirmed trips stay on Trips.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LogIn, ShoppingBag } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { SkeletonListItem } from '../components/ui/Skeleton';
import { useAuth } from '../contexts/AuthContext';
import { fetchMyBookings, resumePendingBookingCheckout, type BookingRow } from '../data/supabase-bookings';
import { formatBookingDateDisplay } from '../lib/booking-flow';
import {
  STRIPE_CHECKOUT_CANCELLED_TOUR_COPY,
  TRAVELER_OPENING_CHECKOUT_CTA,
  TRAVELER_PAY_NOW_TEST_CTA,
  readStripeCheckoutReturnBanner,
} from '../lib/booking-confirmation-copy';
import { formatMoney } from '../lib/money';
import { travelerActiveCartHold, travelerHoldExpiresAtMs } from '../lib/trip-views';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';

type Props = {
  onNavigate: (page: string) => void;
};

function formatHoldCountdown(expiresAtMs: number, nowMs: number): string {
  const totalSec = Math.max(0, Math.floor((expiresAtMs - nowMs) / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function holdTitle(row: BookingRow): string {
  const title = row.purchase_snapshot?.listingTitle?.trim();
  return title || 'Reservation';
}

export default function CartPage({ onNavigate }: Props) {
  const { user, loading: authLoading, requestAuth } = useAuth();
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [paymentCancelled] = useState(
    () => typeof window !== 'undefined' && readStripeCheckoutReturnBanner(window.location.search) === 'cancelled'
  );

  const load = useCallback(async () => {
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const bookings = await fetchMyBookings();
      setRows(bookings);
    } catch (err) {
      setError(userFacingError(err instanceof Error ? err.message : undefined, USER_ERROR.bookings));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const holds = useMemo(
    () => rows.filter((row) => travelerActiveCartHold(row, nowMs)),
    [rows, nowMs]
  );

  const pay = async (row: BookingRow) => {
    if (!travelerActiveCartHold(row, Date.now())) {
      setActionError('This reservation expired. Choose the experience again so availability can be checked.');
      setRows((current) => current.filter((item) => item.id !== row.id));
      return;
    }
    setActionError(null);
    setPayingId(row.id);
    const fromMeta =
      typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '';
    const fromEmail = (user?.email ?? '').split('@')[0]?.trim() ?? '';
    const customerName = (row.guest_name ?? '').trim() || fromMeta || fromEmail || undefined;
    const res = await resumePendingBookingCheckout({ bookingId: row.id, customerName });
    setPayingId(null);
    if (!res.success || !res.checkoutUrl) {
      setActionError(userFacingError(res.error, USER_ERROR.checkout));
      await load();
      return;
    }
    window.location.assign(res.checkoutUrl);
  };

  return (
    <div className="min-h-screen bg-paper tv-page">
      <div className="tv-shell px-4 sm:px-6 lg:px-8 py-8 pb-16">
        <header className="mb-6 border-b border-black/[0.06] pb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">Your travel</p>
          <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Cart</h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted leading-relaxed">
            Unpaid reservations stay here for 60 minutes. The time comes from the server and does not restart if you refresh.
          </p>
        </header>

        {paymentCancelled ? (
          <div className="mb-5 max-w-lg">
            <h2 className="font-display text-2xl text-ink">Payment not completed</h2>
            <p className="mt-2 text-sm text-ink-muted">{STRIPE_CHECKOUT_CANCELLED_TOUR_COPY}</p>
          </div>
        ) : null}

        {actionError ? (
          <p className="mb-4 max-w-lg text-sm text-ink" role="alert">
            {actionError}
          </p>
        ) : null}

        {authLoading || (user && loading) ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading your cart">
            <SkeletonListItem />
            <SkeletonListItem />
          </div>
        ) : !user ? (
          <EmptyState
            icon={LogIn}
            title="Log in to see your cart"
            body="Reservations are kept on your traveler account."
            action={
              <button type="button" className="tv-btn-primary" onClick={() => requestAuth()}>
                Log in
              </button>
            }
          />
        ) : error ? (
          <ErrorState
            title="Could not load your cart"
            body={error}
            retry={{ label: 'Try again', onClick: () => void load() }}
          />
        ) : holds.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="Your cart is empty"
            body="A reservation appears here after you continue to payment, and leaves when it expires or when payment succeeds."
            action={
              <button type="button" className="tv-btn-primary" onClick={() => onNavigate('packages')}>
                Browse tours
              </button>
            }
          />
        ) : (
          <ul className="max-w-lg space-y-3">
            {holds.map((row) => {
              const expiresAt = travelerHoldExpiresAtMs(row);
              const remaining = expiresAt == null ? null : formatHoldCountdown(expiresAt, nowMs);
              const amount =
                typeof row.amount_paid === 'number' && row.amount_paid > 0 && row.currency
                  ? formatMoney(row.amount_paid, row.currency)
                  : null;
              return (
                <li key={row.id} className="rounded-xl border border-black/[0.08] bg-white p-4">
                  <p className="text-sm font-semibold text-ink">{holdTitle(row)}</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {row.booking_date ? formatBookingDateDisplay(row.booking_date) : 'Date pending'}
                    {row.guests ? ` · ${row.guests} ${row.guests === 1 ? 'guest' : 'guests'}` : ''}
                    {amount ? ` · ${amount}` : ''}
                  </p>
                  <p className="mt-2 text-sm font-medium tabular-nums text-ink">
                    {remaining ? `Held for ${remaining}` : 'Hold time unavailable'}
                  </p>
                  <button
                    type="button"
                    className="tv-btn-primary mt-3"
                    disabled={payingId === row.id}
                    onClick={() => void pay(row)}
                  >
                    {payingId === row.id ? TRAVELER_OPENING_CHECKOUT_CTA : TRAVELER_PAY_NOW_TEST_CTA}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
