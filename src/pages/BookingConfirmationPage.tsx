/**
 * Minimal post–Stripe Checkout screen for one booking (no site header/footer).
 * Stripe redirects here with ?session_id=cs_…; we resolve the row via RLS.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Calendar, Users, Loader2, LogIn, Copy, Check } from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';
import ErrorState from '../components/ErrorState';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  fetchMyBookingByCheckoutSessionId,
  reconcileCheckoutSession,
  resumePendingBookingCheckout,
  type BookingWithPaymentRow,
} from '../data/supabase-bookings';
import { fetchListingOpsByIds, pgTimeToHm } from '../data/supabase-listings';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import { parseStayCheckOutFromNotes, nightsOccupiedByStay, stayRangeFromBooking } from '../lib/stayOccupancy';
import { formatMoney, isStripeTestCheckoutSession } from '../lib/money';
import NoticeCallout from '../components/NoticeCallout';
import StatusChip, { toneForPaymentLabel } from '../components/StatusChip';
import { listingPickupCopyIncomplete } from '../lib/pickup-completeness';
import { clearBookingsUnread } from '../lib/customerBookingNotifications';
import {
  BOOKING_CONFIRMATION_EMAIL_DISCLAIMER,
  BOOKING_CONFIRMATION_NEEDS_PAY_BODY,
  BOOKING_CONFIRMATION_NEEDS_PAY_TITLE,
  bookingConfirmationPhase,
  bookingConfirmationCancelledBody,
  BOOKING_CONFIRMED_UI_FOLLOWUP_NOTE,
} from '../lib/booking-confirmation-copy';
import { travelerPaymentLabel, bookingPaymentWasCollected } from '../lib/payment-states';
import {
  confirmationShouldReconcileCheckout,
  confirmationStillWaitingAfterReconcile,
} from '../lib/checkout-confirmation-reconcile';

const SESSION_RETURN_KEY = 'traverion_checkout_return_session_id';

function readStoredSessionId(): string {
  if (typeof window === 'undefined') return '';
  const fromUrl = new URLSearchParams(window.location.search).get('session_id')?.trim() ?? '';
  if (fromUrl) return fromUrl;
  try {
    return sessionStorage.getItem(SESSION_RETURN_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

interface BookingConfirmationPageProps {
  onNavigate: (page: string) => void;
}

export default function BookingConfirmationPage({ onNavigate }: BookingConfirmationPageProps) {
  const { user } = useAuth();
  const [sessionId] = useState(() => readStoredSessionId());

  useEffect(() => {
    if (!sessionId) return;
    try {
      sessionStorage.setItem(SESSION_RETURN_KEY, sessionId);
    } catch {
      /* ignore */
    }
  }, [sessionId]);
  const [booking, setBooking] = useState<BookingWithPaymentRow | null>(null);
  const [listingTitle, setListingTitle] = useState('');
  const [pickupPending, setPickupPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [reconcileAttempted, setReconcileAttempted] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [payingNow, setPayingNow] = useState(false);
  const [payNowError, setPayNowError] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);

  const canQuery = Boolean(user?.email && sessionId && isSupabaseConfigured());

  const load = useCallback(async () => {
    if (!sessionId) {
      setError('Missing payment session. Open the link from your payment receipt or go to My bookings.');
      return;
    }
    if (!isSupabaseConfigured()) {
      setError('Bookings are unavailable in this environment.');
      return;
    }
    if (!user?.email) return;
    setError(null);
    try {
      const row = await fetchMyBookingByCheckoutSessionId(sessionId);
      if (!row) {
        setBooking(null);
        setListingTitle('');
        setError(
          'We could not find this booking for your account yet. If you just paid, wait a few seconds and refresh — or open My bookings.'
        );
        return;
      }
      setBooking(row);
      if (row.listing_id) {
        const ops = await fetchListingOpsByIds([row.listing_id]);
        const meta = ops[row.listing_id];
        setListingTitle(meta?.title || 'Your tour');
        const stay = Boolean(row.check_out);
        setPickupPending(
          !stay && listingPickupCopyIncomplete(meta?.meeting_point, meta?.pickup_instructions) && !row.pickup_time
        );
      } else {
        setListingTitle('');
        setPickupPending(false);
      }
    } catch (e) {
      setError(userFacingError(e, USER_ERROR.booking));
    }
  }, [sessionId, user?.email]);

  useEffect(() => {
    if (!canQuery) return;
    void load();
  }, [canQuery, load]);

  /** Webhook may lag behind the browser redirect — poll until paid or cancelled, or cap. */
  useEffect(() => {
    if (!canQuery || !booking) return;
    if (bookingConfirmationPhase(booking) !== 'confirming') return;
    if (pollCount >= 18) return;
    const t = window.setTimeout(() => {
      setPollCount((c) => c + 1);
      void load();
    }, 2000);
    return () => window.clearTimeout(t);
  }, [canQuery, booking, load, pollCount]);

  /** After a few polls, ask Stripe directly via edge function if Checkout is already paid. */
  useEffect(() => {
    if (!canQuery || !sessionId || !booking) return;
    const phaseNow = bookingConfirmationPhase(booking);
    if (
      !confirmationShouldReconcileCheckout({
        phase: phaseNow,
        pollCount,
        reconcileAttempted,
      })
    ) {
      return;
    }
    let cancelledEffect = false;
    setReconcileAttempted(true);
    setReconciling(true);
    void (async () => {
      try {
        await reconcileCheckoutSession(sessionId);
        if (!cancelledEffect) await load();
      } catch {
        /* keep polling / show stalled copy */
      } finally {
        if (!cancelledEffect) setReconciling(false);
      }
    })();
    return () => {
      cancelledEffect = true;
    };
  }, [canQuery, sessionId, booking, pollCount, reconcileAttempted, load]);

  const stayCheckOut =
    (booking?.check_out && /^\d{4}-\d{2}-\d{2}$/.test(booking.check_out) ? booking.check_out : null) ??
    (booking ? parseStayCheckOutFromNotes(booking.special_requests) : null);
  const stayRange = stayCheckOut && booking ? stayRangeFromBooking(booking) : null;
  const stayNights = stayRange ? nightsOccupiedByStay(stayRange.checkIn, stayRange.checkOut).length : null;

  const dateLabel = useMemo(() => {
    if (!booking?.booking_date) return '—';
    try {
      const start = new Date(`${booking.booking_date}T12:00:00`).toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      if (stayCheckOut) {
        const end = new Date(`${stayCheckOut}T12:00:00`).toLocaleDateString(undefined, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        return `${start} → ${end}`;
      }
      return start;
    } catch {
      return booking.booking_date;
    }
  }, [booking?.booking_date, stayCheckOut]);

  const phase = booking ? bookingConfirmationPhase(booking) : null;
  const paidActive = phase === 'confirmed';
  const confirming = phase === 'confirming';
  const needsPay = phase === 'needs_pay';
  const cancelled = phase === 'cancelled';
  const payLabel = booking ? travelerPaymentLabel(booking) : '';
  const collected = booking ? bookingPaymentWasCollected(booking.payment_status) : false;
  const stalledConfirming = confirmationStillWaitingAfterReconcile({
    phase,
    reconcileAttempted,
    pollCount,
  });

  const handlePayNow = useCallback(async () => {
    if (!booking?.id) return;
    setPayNowError(null);
    setPayingNow(true);
    const res = await resumePendingBookingCheckout({ bookingId: booking.id });
    setPayingNow(false);
    if (!res.success || !res.checkoutUrl) {
      setPayNowError(userFacingError(res.error, USER_ERROR.checkout));
      return;
    }
    window.location.assign(res.checkoutUrl);
  }, [booking?.id]);

  useEffect(() => {
    if (!paidActive && !cancelled) return;
    try {
      sessionStorage.removeItem(SESSION_RETURN_KEY);
    } catch {
      /* ignore */
    }
  }, [paidActive, cancelled]);

  useEffect(() => {
    if (paidActive && user?.id) clearBookingsUnread(user.id);
  }, [paidActive, user?.id]);

  const startHm = booking?.start_time ? pgTimeToHm(booking.start_time) : '';

  const goToBookings = () => {
    window.history.replaceState({}, '', '/bookings');
    onNavigate('bookings');
  };

  const goSignIn = () => {
    try {
      if (sessionId) sessionStorage.setItem(SESSION_RETURN_KEY, sessionId);
    } catch {
      /* ignore */
    }
    window.history.replaceState({}, '', '/log-in?next=booking-confirmed');
    onNavigate('auth');
  };

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-paper px-4 py-16">
        <div className="max-w-md mx-auto">
          <ErrorState
            title="Booking confirmation unavailable"
            body="Bookings are not available in this environment."
            back={{ onClick: () => onNavigate('packages'), label: 'Browse tours' }}
          />
        </div>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-paper px-4 py-16">
        <div className="max-w-md mx-auto">
          <ErrorState
            title="No checkout in this link"
            body={userFacingError(error, 'This page needs the return link from payment. Open Trips if you already booked.')}
            back={{ onClick: goToBookings, label: 'Manage booking' }}
          />
        </div>
      </div>
    );
  }

  if (!user?.email) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 bg-paper">
        <div className="w-full max-w-md rounded-2xl bg-paper-raised p-6 sm:p-8 shadow-soft-lg ring-1 ring-black/[0.06] text-center">
          <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-9 w-auto mx-auto mb-6 opacity-90" />
          <p className="text-ink font-medium">Sign in to see your confirmation</p>
          <p className="text-ink-muted text-sm mt-2 mb-6 leading-relaxed">
            Your payment was tied to your account. Sign in with the same email to view this booking.
          </p>
          <button type="button" onClick={goSignIn} className="tv-btn-primary w-full">
            <LogIn className="w-4 h-4" />
            Sign in
          </button>
        </div>
      </div>
    );
  }

  const statusChipLabel = cancelled
    ? payLabel
    : paidActive
      ? 'Confirmed'
      : confirming
        ? reconciling
          ? 'Syncing payment'
          : 'Confirming'
        : needsPay
          ? 'Payment needed'
          : 'Received';
  const statusChipTone = cancelled
    ? toneForPaymentLabel(payLabel)
    : paidActive
      ? 'good'
      : confirming
        ? 'warn'
        : needsPay
          ? 'warn'
          : 'neutral';

  const copyBookingRef = () => {
    if (typeof booking?.booking_number !== 'number' || booking.booking_number <= 0) return;
    const text = `#${booking.booking_number}`;
    void navigator.clipboard?.writeText(text).then(() => {
      setCopiedRef(true);
      window.setTimeout(() => setCopiedRef(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center px-4 py-12 sm:py-16">
      <header className="mb-8 flex flex-col items-center gap-2">
        <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-10 w-auto" />
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">Booking confirmation</p>
      </header>

      <div className="w-full max-w-lg">
        {error && (
          <ErrorState
            className="py-6"
            title="Could not load this booking"
            body={userFacingError(error, USER_ERROR.booking)}
            retry={{ onClick: () => void load() }}
            back={{ onClick: goToBookings, label: 'Manage booking' }}
            extra={
              <button type="button" onClick={() => onNavigate('contact')} className="tv-btn-ghost">
                Contact support
              </button>
            }
          />
        )}

        {!booking && !error && (
          <div
            className="rounded-2xl bg-paper-raised p-6 shadow-soft ring-1 ring-black/[0.06] space-y-4"
            aria-busy="true"
            aria-label="Loading your booking"
          >
            <Skeleton className="mx-auto h-14 w-14 rounded-full" />
            <Skeleton className="mx-auto h-7 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mx-auto h-4 w-5/6" />
            <div className="mt-6 space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/5" />
            </div>
          </div>
        )}

        {booking && (
          <div className="overflow-hidden rounded-2xl bg-paper-raised shadow-soft-lg ring-1 ring-black/[0.06]">
            <div
              className={`px-5 sm:px-6 pt-6 pb-5 text-center ${
                paidActive
                  ? 'bg-emerald-50/80'
                  : cancelled
                    ? 'bg-rose-50/70'
                    : needsPay || confirming
                      ? 'bg-amber-50/70'
                      : 'bg-finland/[0.05]'
              }`}
            >
              {cancelled ? (
                <>
                  <StatusChip tone={statusChipTone}>{statusChipLabel}</StatusChip>
                  <h1 className="mt-3 font-display text-3xl sm:text-4xl text-ink tracking-tight">Booking cancelled</h1>
                  <p className="mt-2 text-sm text-ink-muted leading-relaxed">
                    {bookingConfirmationCancelledBody(booking)} {BOOKING_CONFIRMATION_EMAIL_DISCLAIMER}
                  </p>
                </>
              ) : paidActive ? (
                <>
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/80">
                    <CheckCircle className="w-8 h-8 tv-pop" aria-hidden />
                  </div>
                  <StatusChip tone="good">Confirmed</StatusChip>
                  <h1 className="mt-3 font-display text-3xl sm:text-4xl text-ink tracking-tight">Booking confirmed</h1>
                  <p className="mt-2 text-sm text-ink-muted leading-relaxed">
                    Thank you — your payment went through. {BOOKING_CONFIRMED_UI_FOLLOWUP_NOTE}{' '}
                    {BOOKING_CONFIRMATION_EMAIL_DISCLAIMER}
                  </p>
                </>
              ) : confirming ? (
                <>
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-200/80">
                    <Loader2 className="w-8 h-8 animate-spin" aria-hidden />
                  </div>
                  <StatusChip tone="warn">{statusChipLabel}</StatusChip>
                  <h1 className="mt-3 font-display text-3xl sm:text-4xl text-ink tracking-tight">
                    {reconciling ? 'Checking payment with Stripe' : 'Confirming payment'}
                  </h1>
                  <p className="mt-2 text-sm text-ink-muted leading-relaxed">
                    {stalledConfirming
                      ? 'Payment may still be settling. Open Trips — if Pay now appears, finish there. If you were charged, support can match your Stripe receipt.'
                      : reconciling
                        ? 'Stripe already has your card result — we are syncing it into your booking now.'
                        : 'Almost done — we are finalizing your booking. This usually takes a few seconds.'}
                  </p>
                </>
              ) : needsPay ? (
                <>
                  <StatusChip tone="warn">Payment needed</StatusChip>
                  <h1 className="mt-3 font-display text-3xl sm:text-4xl text-ink tracking-tight">
                    {BOOKING_CONFIRMATION_NEEDS_PAY_TITLE}
                  </h1>
                  <p className="mt-2 text-sm text-ink-muted leading-relaxed">{BOOKING_CONFIRMATION_NEEDS_PAY_BODY}</p>
                </>
              ) : (
                <>
                  <StatusChip tone="neutral">Received</StatusChip>
                  <h1 className="mt-3 font-display text-3xl sm:text-4xl text-ink tracking-tight">Booking received</h1>
                  <p className="mt-2 text-sm text-ink-muted leading-relaxed">
                    We saved your booking. If payment is still processing, status will update shortly.
                  </p>
                </>
              )}
            </div>

            <div className="space-y-0 px-5 sm:px-6 py-5">
              {typeof booking.booking_number === 'number' && booking.booking_number > 0 ? (
                <div className="flex items-center justify-between gap-3 pb-4 border-b border-black/[0.06]">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">Reference</p>
                    <p className="mt-0.5 font-mono text-lg font-semibold tracking-wide text-finland">
                      #{booking.booking_number}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={copyBookingRef}
                    className="tv-btn-ghost text-sm shrink-0"
                    aria-label="Copy booking reference"
                  >
                    {copiedRef ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedRef ? 'Copied' : 'Copy'}
                  </button>
                </div>
              ) : null}

              <div className="py-4 space-y-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">Experience</p>
                  <p className="mt-1 text-base font-semibold text-ink">
                    {listingTitle || (stayCheckOut ? 'Your stay' : 'Your tour')}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3 rounded-xl bg-finland/[0.04] p-3 ring-1 ring-finland/10">
                    <Calendar className="w-5 h-5 text-finland shrink-0 mt-0.5" aria-hidden />
                    <div>
                      <p className="text-xs font-medium text-ink-faint uppercase tracking-wide">
                        {stayCheckOut ? 'Stay dates' : 'Date'}
                      </p>
                      <p className="mt-0.5 font-medium text-ink">{dateLabel}</p>
                      {stayNights ? (
                        <p className="text-sm text-ink-muted mt-0.5">
                          {stayNights} night{stayNights === 1 ? '' : 's'}
                        </p>
                      ) : startHm ? (
                        <p className="text-sm text-ink-muted mt-0.5">Start {startHm}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl bg-finland/[0.04] p-3 ring-1 ring-finland/10">
                    <Users className="w-5 h-5 text-finland shrink-0 mt-0.5" aria-hidden />
                    <div>
                      <p className="text-xs font-medium text-ink-faint uppercase tracking-wide">Guests</p>
                      <p className="mt-0.5 font-medium text-ink">
                        {booking.guests} {booking.guests === 1 ? 'guest' : 'guests'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {collected && booking.amount_paid != null && (
                <div className="rounded-xl bg-ink/[0.03] px-4 py-3.5 ring-1 ring-black/[0.05]">
                  {stayCheckOut && booking.nights && booking.nightly_amount != null && paidActive ? (
                    <p className="text-sm text-ink-muted mb-1">
                      {booking.nights} night{booking.nights === 1 ? '' : 's'} ×{' '}
                      {formatMoney(Number(booking.nightly_amount), booking.currency)}
                      {booking.cleaning_fee != null && Number(booking.cleaning_fee) > 0
                        ? ` + ${formatMoney(Number(booking.cleaning_fee), booking.currency)} cleaning`
                        : ''}
                    </p>
                  ) : null}
                  <p className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                    {cancelled ? payLabel : 'Amount paid'}
                  </p>
                  <p className="mt-0.5 text-xl font-semibold tabular-nums text-ink">
                    {formatMoney(Number(booking.amount_paid), booking.currency)}
                    {isStripeTestCheckoutSession(booking.checkout_session_id) ? (
                      <span className="ml-2 text-sm font-medium text-amber-800">TEST</span>
                    ) : null}
                  </p>
                </div>
              )}

              <div className="pt-4 space-y-3">
                {cancelled ? (
                  <NoticeCallout title="What happens next" tone="info">
                    Manage this booking from Trips — Cancelled shows Refund due until Stripe records a refund.
                  </NoticeCallout>
                ) : needsPay ? (
                  <NoticeCallout title="What happens next" tone="warn">
                    Your hold stays on Trips until you pay or cancel. Stripe TEST checkout opens in the same flow as before.
                  </NoticeCallout>
                ) : (
                  <NoticeCallout title="What happens next" tone="info">
                    {BOOKING_CONFIRMED_UI_FOLLOWUP_NOTE} Manage this {stayCheckOut ? 'stay' : 'booking'} from Trips. Free
                    cancellation up to 24 hours before {stayCheckOut ? 'check-in' : 'start'}, unless the listing says
                    otherwise.
                  </NoticeCallout>
                )}
                {paidActive && pickupPending ? (
                  <NoticeCallout title="Pickup details pending" tone="warn">
                    Your booking is confirmed. Meeting or pickup details are not complete yet — they will appear in Trips
                    when the host updates them.
                  </NoticeCallout>
                ) : null}
                {payNowError ? (
                  <NoticeCallout title="Could not open checkout" tone="danger">
                    {payNowError}
                  </NoticeCallout>
                ) : null}
              </div>

              <div className="pt-5 flex flex-col gap-3">
                {needsPay ? (
                  <button
                    type="button"
                    onClick={() => void handlePayNow()}
                    disabled={payingNow}
                    className="tv-btn-primary w-full"
                  >
                    {payingNow ? 'Opening checkout…' : 'Pay now'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={goToBookings}
                  className={needsPay ? 'tv-btn-secondary w-full' : 'tv-btn-primary w-full'}
                >
                  Manage booking
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate(stayCheckOut ? 'stays' : 'packages')}
                  className="tv-btn-secondary w-full"
                >
                  {stayCheckOut ? 'Browse more stays' : 'Browse more tours'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
