import { useState } from 'react';
import { stayBookingRequestAction } from '../data/supabase-bookings';
import {
  isStayRequestAwaitingHost,
  stayRequestCanAccept,
  stayRequestCanDecline,
  stayRequestCanWithdraw,
  stayRequestIsCapturePending,
  stayRequestLifecycleLabel,
  type StayRequestApprovalRow,
} from '../lib/stay-request-approval';
import { formatMoney, normalizeCurrency } from '../lib/money';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';

type Row = StayRequestApprovalRow & {
  id: string;
  guest_name?: string | null;
  booking_date?: string | null;
  check_out?: string | null;
  guests?: number | null;
  total_amount?: number | null;
  amount_paid?: number | null;
  currency?: string | null;
  listingTitle?: string | null;
};

type Props = {
  booking: Row;
  role: 'supplier' | 'traveler';
  /** Optional supplier earnings line (already computed). */
  supplierEarningsLabel?: string | null;
  onDone?: () => void;
  compact?: boolean;
};

export default function StayRequestActions({
  booking,
  role,
  supplierEarningsLabel,
  onDone,
  compact = false,
}: Props) {
  const [busy, setBusy] = useState<'accept' | 'decline' | 'withdraw' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!booking.approval_status && String(booking.payment_status ?? '').toLowerCase() !== 'authorized') {
    return null;
  }

  const awaiting = isStayRequestAwaitingHost(booking);
  const capturing = stayRequestIsCapturePending(booking);
  const statusLabel = stayRequestLifecycleLabel(booking);
  const amount =
    typeof booking.total_amount === 'number'
      ? booking.total_amount
      : typeof booking.amount_paid === 'number'
        ? booking.amount_paid
        : null;
  const currency = normalizeCurrency(booking.currency ?? 'EUR');
  const deadline = booking.approval_expires_at ?? booking.hold_expires_at;
  const deadlineLabel = deadline
    ? new Date(deadline).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const run = async (action: 'accept' | 'decline' | 'withdraw') => {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      const res = await stayBookingRequestAction({ bookingId: booking.id, action });
      if (!res.success) {
        setError(userFacingError(res.error, USER_ERROR.bookings));
        return;
      }
      onDone?.();
    } catch (err) {
      setError(userFacingError(err, USER_ERROR.bookings));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      className={`rounded-xl border border-black/8 bg-white px-3 py-3 ${compact ? '' : 'mt-3'}`}
      aria-label="Booking request"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-finland">Booking request</p>
      <p className="mt-1 text-sm font-semibold text-ink">{statusLabel}</p>
      {booking.listingTitle ? <p className="mt-0.5 text-sm text-ink">{booking.listingTitle}</p> : null}
      {booking.guest_name && role === 'supplier' ? (
        <p className="text-sm text-ink-muted">Guest · {booking.guest_name}</p>
      ) : null}
      {(booking.booking_date || booking.check_out) && (
        <p className="text-sm text-ink-muted">
          {booking.booking_date ?? '—'}
          {booking.check_out ? ` → ${booking.check_out}` : ''}
          {typeof booking.guests === 'number' && booking.guests > 0 ? ` · ${booking.guests} guests` : ''}
        </p>
      )}
      {amount != null ? (
        <p className="mt-1 text-sm tabular-nums text-ink">
          Total · {formatMoney(amount, currency)}
          {supplierEarningsLabel ? ` · ${supplierEarningsLabel}` : ''}
        </p>
      ) : null}
      {awaiting && deadlineLabel ? (
        <p className="mt-1 text-xs text-ink-muted">Respond by {deadlineLabel}</p>
      ) : null}
      {capturing ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          Payment capture is in progress. Confirmation appears only after Stripe verifies the capture.
        </p>
      ) : null}
      {awaiting && role === 'supplier' && stayRequestCanAccept(booking) ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="tv-btn-primary"
            disabled={busy !== null}
            onClick={() => void run('accept')}
          >
            {busy === 'accept' ? 'Accepting…' : 'Accept request'}
          </button>
          {stayRequestCanDecline(booking) ? (
            <button
              type="button"
              className="tv-btn-secondary"
              disabled={busy !== null}
              onClick={() => void run('decline')}
            >
              {busy === 'decline' ? 'Declining…' : 'Decline request'}
            </button>
          ) : null}
        </div>
      ) : null}
      {awaiting && role === 'traveler' && stayRequestCanWithdraw(booking) ? (
        <div className="mt-3">
          <button
            type="button"
            className="tv-btn-secondary"
            disabled={busy !== null}
            onClick={() => void run('withdraw')}
          >
            {busy === 'withdraw' ? 'Withdrawing…' : 'Withdraw request'}
          </button>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            Withdraws releases the date hold and cancels the payment authorization. You will not be charged.
          </p>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
