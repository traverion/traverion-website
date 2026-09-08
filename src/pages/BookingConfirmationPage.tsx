/**
 * Minimal post–Stripe Checkout screen for one booking (no site header/footer).
 * Stripe redirects here with ?session_id=cs_…; we resolve the row via RLS.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Calendar, Users, Loader2, LogIn } from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';
import ErrorState from '../components/ErrorState';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  fetchMyBookingByCheckoutSessionId,
  type BookingWithPaymentRow,
} from '../data/supabase-bookings';
import { fetchListingOpsByIds, pgTimeToHm } from '../data/supabase-listings';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import { parseStayCheckOutFromNotes, nightsOccupiedByStay, stayRangeFromBooking } from '../lib/stayOccupancy';
import { formatMoney, isStripeTestCheckoutSession } from '../lib/money';
import NoticeCallout from '../components/NoticeCallout';
import { listingPickupCopyIncomplete } from '../lib/pickup-completeness';
import { clearBookingsUnread } from '../lib/customerBookingNotifications';

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

  /** Webhook may lag behind the browser redirect — poll until paid or cap. */
  useEffect(() => {
    if (!canQuery || !booking) return;
    if ((booking.payment_status ?? '') === 'paid') return;
    if (pollCount >= 18) return;
    const t = window.setTimeout(() => {
      setPollCount((c) => c + 1);
      void load();
    }, 2000);
    return () => window.clearTimeout(t);
  }, [canQuery, booking, load, pollCount]);

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

  const paid = Boolean(booking && (booking.payment_status ?? '') === 'paid');
  const confirming = Boolean(booking && (booking.payment_status ?? 'pending') !== 'paid');

  useEffect(() => {
    if (!paid) return;
    try {
      sessionStorage.removeItem(SESSION_RETURN_KEY);
    } catch {
      /* ignore */
    }
  }, [paid]);

  useEffect(() => {
    if (paid && user?.id) clearBookingsUnread(user.id);
  }, [paid, user?.id]);

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
            back={{ onClick: goToBookings, label: 'Check my trips' }}
          />
        </div>
      </div>
    );
  }

  if (!user?.email) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 bg-paper">
        <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-9 w-auto mb-8 opacity-90" />
        <p className="text-ink text-center max-w-md mb-2 font-medium">Sign in to see your confirmation</p>
        <p className="text-ink-muted text-center max-w-sm text-sm mb-8">
          Your payment was tied to your account. Sign in with the same email to view this booking.
        </p>
        <button
          type="button"
          onClick={goSignIn}
          className="tv-btn-primary"
        >
          <LogIn className="w-4 h-4" />
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center px-4 py-12 sm:py-16">
      <header className="mb-10 flex flex-col items-center gap-3">
        <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-10 w-auto" />
      </header>

      <div className="w-full max-w-lg">
        {error && (
          <ErrorState
            className="py-6"
            title="Could not load this booking"
            body={userFacingError(error, USER_ERROR.booking)}
            retry={{ onClick: () => void load() }}
            back={{ onClick: goToBookings, label: 'Check my trips' }}
            extra={
              <button type="button" onClick={() => onNavigate('contact')} className="tv-btn-ghost">
                Contact support
              </button>
            }
          />
        )}

        {!booking && !error && (
          <div className="space-y-4 py-6" aria-busy="true" aria-label="Loading your booking">
            <Skeleton className="mx-auto h-14 w-14 rounded-full" />
            <Skeleton className="mx-auto h-7 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mx-auto h-4 w-5/6" />
            <div className="mt-8 space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/5" />
            </div>
          </div>
        )}

        {booking && (
          <div className="overflow-hidden">
            <div className="pb-5 text-center">
              {paid ? (
                <>
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
                    <CheckCircle className="w-8 h-8 tv-pop" aria-hidden />
                  </div>
                  <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Booking confirmed</h1>
                  <p className="mt-2 text-sm text-ink-muted leading-relaxed">
                    Thank you — your payment went through.{' '}
                    {stayCheckOut
                      ? 'The host may follow up with arrival instructions.'
                      : 'The operator may follow up about meeting or pickup details.'}
                  </p>
                </>
              ) : confirming ? (
                <>
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                    <Loader2 className="w-8 h-8 animate-spin" aria-hidden />
                  </div>
                  <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Confirming payment</h1>
                  <p className="mt-2 text-sm text-ink-muted leading-relaxed">
                    Almost done — we are finalizing your booking. This usually takes a few seconds.
                  </p>
                </>
              ) : (
                <>
                  <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Booking received</h1>
                  <p className="mt-2 text-sm text-ink-muted leading-relaxed">
                    We saved your booking. If payment is still processing, status will update shortly.
                  </p>
                </>
              )}
            </div>

            <div className="py-6 space-y-4 text-sm text-ink-muted">
              <p className="text-base font-semibold text-ink">{listingTitle || (stayCheckOut ? 'Your stay' : 'Your tour')}</p>
              {typeof booking.booking_number === 'number' && booking.booking_number > 0 ? (
                <p className="text-sm font-mono text-finland font-semibold tracking-wide -mt-1">
                  Booking #{booking.booking_number}
                </p>
              ) : null}
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-finland shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="font-medium text-ink">{stayCheckOut ? 'Stay dates' : 'Date'}</p>
                  <p>{dateLabel}</p>
                  {stayNights ? (
                    <p className="text-ink-faint mt-0.5">
                      {stayNights} night{stayNights === 1 ? '' : 's'}
                    </p>
                  ) : startHm ? (
                    <p className="text-ink-faint mt-0.5">Start {startHm}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Users className="w-5 h-5 text-finland shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="font-medium text-ink">Guests</p>
                  <p>
                    {booking.guests} {booking.guests === 1 ? 'guest' : 'guests'}
                  </p>
                </div>
              </div>
              {paid && booking.amount_paid != null && (
                <div className="pt-1 border-t border-black/[0.06] space-y-1">
                  {stayCheckOut && booking.nights && booking.nightly_amount != null ? (
                    <p>
                      {booking.nights} night{booking.nights === 1 ? '' : 's'} × {formatMoney(Number(booking.nightly_amount), booking.currency)}
                      {booking.cleaning_fee != null && Number(booking.cleaning_fee) > 0
                        ? ` + ${formatMoney(Number(booking.cleaning_fee), booking.currency)} cleaning`
                        : ''}
                    </p>
                  ) : null}
                  <p className="text-ink font-medium">
                    Paid {formatMoney(Number(booking.amount_paid), booking.currency)}
                    {isStripeTestCheckoutSession(booking.checkout_session_id) ? ' · Stripe TEST' : ''}
                  </p>
                </div>
              )}
              <p className="text-xs text-ink-faint leading-relaxed pt-2">
                {stayCheckOut
                  ? 'Next: the host may send arrival instructions. Manage this stay from Trips.'
                  : 'Next: the operator may follow up about meeting or pickup. Manage this booking from Trips.'}{' '}
                Free cancellation up to 24 hours before {stayCheckOut ? 'check-in' : 'start'}, unless the listing says otherwise.
              </p>
              {paid && pickupPending ? (
                <NoticeCallout title="Pickup details pending" tone="warn">
                  Your booking is confirmed. Meeting or pickup details are not complete yet — they will appear in Trips when the host updates them.
                </NoticeCallout>
              ) : null}
            </div>

            <div className="pt-2 flex flex-col gap-3">
              <button
                type="button"
                onClick={goToBookings}
                className="tv-btn-primary w-full"
              >
                Check my trips
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
        )}
      </div>
    </div>
  );
}
