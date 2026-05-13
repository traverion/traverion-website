/**
 * Minimal post–Stripe Checkout screen for one booking (no site header/footer).
 * Stripe redirects here with ?session_id=cs_…; we resolve the row via RLS.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Calendar, Users, Loader2, LogIn } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  fetchMyBookingByCheckoutSessionId,
  type BookingWithPaymentRow,
} from '../data/supabase-bookings';
import { fetchListingTitlesByIds, pgTimeToHm } from '../data/supabase-listings';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
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
    try {
      sessionStorage.removeItem(SESSION_RETURN_KEY);
    } catch {
      /* ignore */
    }
  }, []);
  const [booking, setBooking] = useState<BookingWithPaymentRow | null>(null);
  const [listingTitle, setListingTitle] = useState('');
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
        const titles = await fetchListingTitlesByIds([row.listing_id]);
        setListingTitle(titles[row.listing_id] ?? 'Your experience');
      } else {
        setListingTitle('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load booking');
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

  const dateLabel = useMemo(() => {
    if (!booking?.booking_date) return '—';
    try {
      return new Date(`${booking.booking_date}T12:00:00`).toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return booking.booking_date;
    }
  }, [booking?.booking_date]);

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
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 bg-slate-50 text-center">
        <p className="text-gray-700 mb-6">Bookings are not available here.</p>
        <button
          type="button"
          onClick={() => onNavigate('packages')}
          className="px-6 py-3 rounded-xl bg-finland text-white font-semibold hover:bg-finland-dark"
        >
          Browse tours
        </button>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 bg-slate-50">
        <p className="text-gray-700 text-center max-w-md mb-6">{error ?? 'No checkout session in this link.'}</p>
        <button
          type="button"
          onClick={goToBookings}
          className="px-6 py-3 rounded-xl bg-finland text-white font-semibold hover:bg-finland-dark"
        >
          Check my bookings
        </button>
      </div>
    );
  }

  if (!user?.email) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 bg-slate-50">
        <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-9 w-auto mb-8 opacity-90" />
        <p className="text-gray-800 text-center max-w-md mb-2 font-medium">Sign in to see your confirmation</p>
        <p className="text-gray-600 text-center max-w-sm text-sm mb-8">
          Your payment was tied to your account. Sign in with the same email to view this booking.
        </p>
        <button
          type="button"
          onClick={goSignIn}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-finland text-white font-semibold hover:bg-finland-dark"
        >
          <LogIn className="w-4 h-4" />
          Sign in
        </button>
      </div>
    );
  }

  const confirming = Boolean(booking && (booking.payment_status ?? 'pending') !== 'paid');
  const paid = Boolean(booking && (booking.payment_status ?? '') === 'paid');

  useEffect(() => {
    if (paid && user?.id) clearBookingsUnread(user.id);
  }, [paid, user?.id]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col items-center px-4 py-12 sm:py-16">
      <header className="mb-10 flex flex-col items-center gap-3">
        <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-10 w-auto" />
      </header>

      <div className="w-full max-w-lg">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 text-red-800 px-5 py-4 text-sm mb-6 text-center">
            {error}
          </div>
        )}

        {!booking && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-600 gap-3">
            <Loader2 className="w-10 h-10 animate-spin text-finland" aria-hidden />
            <p className="text-sm">Loading your booking…</p>
          </div>
        )}

        {booking && (
          <div className="rounded-2xl border border-gray-200/80 bg-white shadow-lg shadow-slate-200/60 overflow-hidden">
            <div className="bg-finland/10 border-b border-finland/15 px-6 py-5 text-center">
              {paid ? (
                <>
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
                    <CheckCircle className="w-8 h-8" aria-hidden />
                  </div>
                  <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight">Booking confirmed</h1>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                    Thank you — your payment went through. The operator may follow up about meeting or pickup details.
                  </p>
                </>
              ) : confirming ? (
                <>
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                    <Loader2 className="w-8 h-8 animate-spin" aria-hidden />
                  </div>
                  <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight">Confirming payment</h1>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                    Almost done — we are finalizing your booking. This usually takes a few seconds.
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight">Booking received</h1>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                    We saved your booking. If payment is still processing, status will update shortly.
                  </p>
                </>
              )}
            </div>

            <div className="px-6 py-6 space-y-4 text-sm text-gray-700">
              <p className="text-base font-semibold text-gray-900">{listingTitle || 'Your experience'}</p>
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-finland shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="font-medium text-gray-900">Date</p>
                  <p>{dateLabel}</p>
                  {startHm ? <p className="text-gray-500 mt-0.5">Start {startHm}</p> : null}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Users className="w-5 h-5 text-finland shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="font-medium text-gray-900">Guests</p>
                  <p>
                    {booking.guests} {booking.guests === 1 ? 'guest' : 'guests'}
                  </p>
                </div>
              </div>
              {paid && booking.amount_paid != null && (
                <p className="text-xs text-gray-500 pt-1 border-t border-gray-100">
                  Amount paid: {(booking.currency ?? 'USD').toUpperCase()} {Number(booking.amount_paid).toFixed(2)}
                </p>
              )}
            </div>

            <div className="px-6 pb-6 pt-0 flex flex-col gap-3">
              <button
                type="button"
                onClick={goToBookings}
                className="w-full py-3.5 rounded-xl bg-finland text-white font-semibold text-center hover:bg-finland-dark transition-colors shadow-sm"
              >
                Check my bookings
              </button>
              <button
                type="button"
                onClick={() => onNavigate('packages')}
                className="w-full py-3 rounded-xl border border-gray-200 text-gray-800 font-medium hover:bg-gray-50 transition-colors"
              >
                Browse more tours
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
