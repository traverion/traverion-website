/**
 * Minimal post–Stripe Checkout screen for one booking (no site header/footer).
 * Stripe redirects here with ?session_id=cs_…; we resolve the row via RLS.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Calendar, Users, LogIn, Copy, Check, Printer, MapPin, Clock } from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';
import ErrorState from '../components/ErrorState';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchMyBookingByCheckoutSessionId,
  reconcileCheckoutSession,
  resumePendingBookingCheckout,
  type BookingWithPaymentRow,
} from '../data/supabase-bookings';
import { fetchListingById, fetchListingOpsByIds, pgTimeToHm } from '../data/supabase-listings';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import { nightsOccupiedByStay, stayRangeFromBooking } from '../lib/stayOccupancy';
import { formatMoney, isStripeTestCheckoutSession, appStripeIsTestMode } from '../lib/money';
import NoticeCallout from '../components/NoticeCallout';
import StatusChip, { toneForPaymentLabel } from '../components/StatusChip';
import { bookingIsStayNight, listingPickupCopyIncomplete, resolvePartnerPickupCopy } from '../lib/pickup-completeness';
import {
  displayListingTitleFromPurchase,
  displayOptionLabelFromPurchase,
  displayStartTimeFromPurchase,
  displayDepartureTimezoneFromPurchase,
  formatTripDepartureWithTimezone,
  displayBookingContactPhoneFromPurchase,
  displayFulfillmentFromPurchase,
  displayCancellationPolicyFromPurchase,
  type PurchaseSnapshot,
} from '../lib/purchase-snapshot';
import { confirmationArrival } from '../lib/confirmation-arrival';
import { travelerPickupAddressFromRecord } from '../lib/pickup-area';
import { travelerPublicBookingReference } from '../lib/public-booking-reference';
import { formatBookingContactForDisplay } from '../lib/listing-booking-contact-phone';
import { clearBookingsUnread } from '../lib/customerBookingNotifications';
import {
  BOOKING_CONFIRMATION_NEEDS_PAY_BODY,
  BOOKING_CONFIRMATION_NEEDS_PAY_TITLE,
  bookingConfirmationPhase,
  confirmationLoadErrorShouldSurface,
  bookingConfirmationCancelledBody,
  bookingConfirmationCancelledNextStep,
  TRAVELER_HOLD_EXPIRED_PAY_NOW_NOTE,
  TRAVELER_OPENING_CHECKOUT_CTA,
  TRAVELER_PAY_NOW_TEST_CTA,
  stayConfirmationPaidNightlyBreakdown,
  stayPaidAdjacentNightCount,
} from '../lib/booking-confirmation-copy';
import { formatBookingParticipantsLabel } from '../lib/participant-mix';
import { formatBookingDateDisplay } from '../lib/booking-flow';
import { travelerFacingBookingOptions } from '../lib/legacy-participant-options';
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
  const { user, loading: authLoading } = useAuth();
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
  const [optionLabel, setOptionLabel] = useState('');
  const [pickupPending, setPickupPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [reconcileAttempted, setReconcileAttempted] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [payingNow, setPayingNow] = useState(false);
  const [payNowError, setPayNowError] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const [coverImage, setCoverImage] = useState('');
  const [meetingPoint, setMeetingPoint] = useState('');
  const loadGenRef = useRef(0);
  const confirmationUserIdRef = useRef<string | null>(null);
  const bookingRowRef = useRef<BookingWithPaymentRow | null>(null);

  const canQuery = Boolean(user?.id && sessionId && isSupabaseConfigured());

  useEffect(() => {
    bookingRowRef.current = booking;
  }, [booking]);

  const resetConfirmationBookingState = useCallback(() => {
    setBooking(null);
    setListingTitle('');
    setOptionLabel('');
    setPickupPending(false);
    setCoverImage('');
    setMeetingPoint('');
    setError(null);
    setPollCount(0);
    setReconcileAttempted(false);
    setReconciling(false);
    setPayNowError(null);
  }, []);

  const load = useCallback(async () => {
    if (!sessionId) {
      setError('Missing payment session. Open the link from your payment receipt or go to Trips.');
      return;
    }
    if (!isSupabaseConfigured()) {
      setError('Bookings are unavailable in this environment.');
      return;
    }
    if (!user?.id) return;
    const gen = ++loadGenRef.current;
    setError(null);
    try {
      const row = await fetchMyBookingByCheckoutSessionId(sessionId);
      if (gen !== loadGenRef.current) return;
      if (!row) {
        setBooking(null);
        setListingTitle('');
        setCoverImage('');
        setMeetingPoint('');
        setError(
          'We could not find this booking for your account yet. If you just paid, wait a few seconds and refresh — or open Trips.'
        );
        return;
      }
      setBooking(row);
      if (row.listing_id) {
        try {
          const ops = await fetchListingOpsByIds([row.listing_id]);
          if (gen !== loadGenRef.current) return;
          const meta = ops[row.listing_id];
          setCoverImage(meta?.image ?? '');
          setListingTitle(
            displayListingTitleFromPurchase(
              row.purchase_snapshot,
              meta?.title,
              bookingIsStayNight(row) ? 'Your stay' : 'Your tour'
            )
          );
          const stay = bookingIsStayNight(row);
          // Phase 1716: include special_requests overrides (Pickup Planner) for pending honesty.
          const tripPickup = resolvePartnerPickupCopy({
            purchaseSnapshot: row.purchase_snapshot,
            bookingOptionId: row.booking_option_id,
            specialRequests: row.special_requests,
            listingMeetingPoint: meta?.meeting_point,
            listingPickupInstructions: meta?.pickup_instructions,
          });
          setMeetingPoint(tripPickup.meetingPoint || '');
          setPickupPending(
            !stay &&
              listingPickupCopyIncomplete(tripPickup.meetingPoint || null, tripPickup.pickupInstructions || null) &&
              !row.pickup_time
          );
        } catch {
          if (gen !== loadGenRef.current) return;
          setListingTitle(
            displayListingTitleFromPurchase(
              row.purchase_snapshot,
              '',
              bookingIsStayNight(row) ? 'Your stay' : 'Your tour'
            )
          );
          const stay = bookingIsStayNight(row);
          const tripPickup = resolvePartnerPickupCopy({
            purchaseSnapshot: row.purchase_snapshot,
            bookingOptionId: row.booking_option_id,
            specialRequests: row.special_requests,
            listingMeetingPoint: null,
            listingPickupInstructions: null,
          });
          setMeetingPoint(tripPickup.meetingPoint || '');
          setPickupPending(
            !stay &&
              listingPickupCopyIncomplete(tripPickup.meetingPoint || null, tripPickup.pickupInstructions || null) &&
              !row.pickup_time
          );
        }
        try {
          const listing = await fetchListingById(row.listing_id);
          if (gen !== loadGenRef.current) return;
          const opts = travelerFacingBookingOptions(listing?.listingExtras?.bookingOptions);
          const match =
            (row.booking_option_id
              ? opts.find((o) => o.id === row.booking_option_id)
              : null) ?? (opts.length === 1 ? opts[0] : null);
          setOptionLabel(
            displayOptionLabelFromPurchase(row.purchase_snapshot, match?.name?.trim() || '')
          );
        } catch {
          if (gen !== loadGenRef.current) return;
          setOptionLabel(displayOptionLabelFromPurchase(row.purchase_snapshot, ''));
        }
      } else {
        setListingTitle(displayListingTitleFromPurchase(row.purchase_snapshot, '', ''));
        setOptionLabel(displayOptionLabelFromPurchase(row.purchase_snapshot, ''));
        setPickupPending(false);
      }
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      if (confirmationLoadErrorShouldSurface(bookingRowRef.current != null)) {
        setError(userFacingError(e, USER_ERROR.booking));
      }
    }
  }, [sessionId, user?.id]);

  // Phase 1380 + layout: clear prior account booking before paint (useEffect ran one frame too late).
  useLayoutEffect(() => {
    if (!user?.id) {
      confirmationUserIdRef.current = null;
      loadGenRef.current += 1;
      resetConfirmationBookingState();
      return;
    }
    if (confirmationUserIdRef.current !== user.id) {
      confirmationUserIdRef.current = user.id;
      loadGenRef.current += 1;
      resetConfirmationBookingState();
    }
  }, [user?.id, resetConfirmationBookingState]);

  useEffect(() => {
    if (authLoading) return;
    if (!canQuery) return;
    void load();
  }, [canQuery, load, authLoading]);

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

  const isStayBooking = booking ? bookingIsStayNight(booking) : false;
  const stayRange = isStayBooking && booking ? stayRangeFromBooking(booking) : null;
  const stayCheckOut = stayRange?.checkOut ?? null;
  const stayNights = stayRange ? nightsOccupiedByStay(stayRange.checkIn, stayRange.checkOut).length : null;

  const dateLabel = useMemo(() => {
    if (!booking?.booking_date) return '—';
    const start = formatBookingDateDisplay(booking.booking_date);
    if (!start) return booking.booking_date;
    if (stayCheckOut) {
      const end = formatBookingDateDisplay(stayCheckOut);
      return end ? `${start} → ${end}` : start;
    }
    return start;
  }, [booking?.booking_date, stayCheckOut]);

  const phase = booking ? bookingConfirmationPhase(booking) : null;
  const paidActive = phase === 'confirmed';
  const confirming = phase === 'confirming';
  const needsPay = phase === 'needs_pay';
  const cancelled = phase === 'cancelled';
  const payLabel = booking ? travelerPaymentLabel(booking) : '';
  const collected = booking ? bookingPaymentWasCollected(booking.payment_status) : false;
  // Phase 1579: × nightly money copy only when it reconciles to amount_paid (range may be longer than charge).
  const paidNightlyBreakdown =
    stayCheckOut && booking && paidActive && booking.amount_paid != null && booking.nightly_amount != null
      ? stayConfirmationPaidNightlyBreakdown({
          amountPaid: booking.amount_paid,
          nightlyAmount: booking.nightly_amount,
          cleaningFee: booking.cleaning_fee,
          candidateNights: [
            booking.nights,
            (booking.purchase_snapshot as PurchaseSnapshot | null | undefined)?.nights,
            stayNights,
          ],
        })
      : null;
  // Phase 1580/1588: Stay-dates night subtitle via shared paid-adjacent helper.
  const confirmationNightCount = stayPaidAdjacentNightCount({
    amountPaid: booking?.amount_paid,
    nightlyAmount: booking?.nightly_amount,
    cleaningFee: booking?.cleaning_fee,
    paymentCollected: Boolean(paidActive),
    columnNights: booking?.nights,
    snapshotNights: (booking?.purchase_snapshot as PurchaseSnapshot | null | undefined)?.nights,
    occupancyNights: stayNights,
  });
  const stalledConfirming = confirmationStillWaitingAfterReconcile({
    phase,
    reconcileAttempted,
    pollCount,
  });

  const handlePayNow = useCallback(async () => {
    if (!booking?.id) return;
    setPayNowError(null);
    setPayingNow(true);
    // Phase 1773: fill empty guest_name on Pay-now resume.
    const fromMeta =
      typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '';
    const fromEmail = (user?.email ?? '').split('@')[0]?.trim() ?? '';
    const customerName =
      (booking.guest_name ?? '').trim() || fromMeta || fromEmail || undefined;
    const res = await resumePendingBookingCheckout({ bookingId: booking.id, customerName });
    setPayingNow(false);
    if (!res.success || !res.checkoutUrl) {
      setPayNowError(userFacingError(res.error, USER_ERROR.checkout));
      return;
    }
    window.location.assign(res.checkoutUrl);
  }, [booking?.guest_name, booking?.id, user]);

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

  const startHm = formatTripDepartureWithTimezone(
    displayStartTimeFromPurchase(
      booking?.purchase_snapshot,
      booking?.start_time ? pgTimeToHm(booking.start_time) : ''
    ),
    displayDepartureTimezoneFromPurchase(booking?.purchase_snapshot)
  );

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
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 bg-paper">
        <div className="w-full max-w-md tv-card p-4 sm:p-5 text-center">
          <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-9 w-auto mx-auto mb-6 opacity-90" />
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Booking confirmation</p>
          <h1 className="font-display text-2xl tracking-tight text-ink">Booking confirmation unavailable</h1>
          <p className="text-ink-muted text-sm mt-2 mb-6 leading-relaxed">
            Bookings are not available in this environment.
          </p>
          <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-primary w-full">
            Browse tours
          </button>
          <button type="button" onClick={() => onNavigate('stays')} className="tv-btn-ghost w-full justify-center mt-2">
            Browse stays
          </button>
        </div>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 bg-paper">
        <div className="w-full max-w-md tv-card p-4 sm:p-5 text-center">
          <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-9 w-auto mx-auto mb-6 opacity-90" />
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Booking confirmation</p>
          <h1 className="font-display text-2xl tracking-tight text-ink">No checkout in this link</h1>
          <p className="text-ink-muted text-sm mt-2 mb-6 leading-relaxed">
            {userFacingError(
              error,
              'This page needs the return link from payment. Open Trips if you already booked.'
            )}
          </p>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={goToBookings} className="tv-btn-primary w-full">
              <Calendar className="w-4 h-4" aria-hidden />
              Open Trips
            </button>
            <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-ghost w-full justify-center">
              Browse tours
            </button>
            <button type="button" onClick={() => onNavigate('stays')} className="tv-btn-ghost w-full justify-center">
              Browse stays
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 bg-paper">
        <div className="w-full max-w-md tv-card p-4 sm:p-5 text-center">
          <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-9 w-auto mx-auto mb-6 opacity-90" />
          <p className="text-ink-muted text-sm" aria-busy="true">
            Checking your session…
          </p>
        </div>
      </div>
    );
  }

  if (!user?.id) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 bg-paper">
        <div className="w-full max-w-md tv-card p-4 sm:p-5 text-center">
          <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-9 w-auto mx-auto mb-6 opacity-90" />
          <p className="text-ink font-medium">Sign in to see your confirmation</p>
          <p className="text-ink-muted text-sm mt-2 mb-6 leading-relaxed">
            Your payment was tied to your account. Sign in with the same account to view this booking.
          </p>
          {/* Phase 1660: browse escapes when signed out so the page is not a dead end. */}
          <div className="flex flex-col gap-2">
            <button type="button" onClick={goSignIn} className="tv-btn-primary w-full">
              <LogIn className="w-4 h-4" />
              Sign in
            </button>
            <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-ghost w-full justify-center">
              Browse tours
            </button>
            <button type="button" onClick={() => onNavigate('stays')} className="tv-btn-ghost w-full justify-center">
              Browse stays
            </button>
          </div>
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

  const publicRef = travelerPublicBookingReference(booking?.public_reference);
  const arrival = booking
    ? confirmationArrival({
        fulfillment: displayFulfillmentFromPurchase(booking.purchase_snapshot),
        meetingPoint,
        specialRequests: booking.special_requests,
        pickupTime: booking.pickup_time ? pgTimeToHm(booking.pickup_time) : '',
        travelerPickupAddress: travelerPickupAddressFromRecord({
          snapshot: booking.purchase_snapshot,
          specialRequests: booking.special_requests,
        }),
      })
    : null;
  const cancellationPolicy = booking
    ? displayCancellationPolicyFromPurchase(booking.purchase_snapshot, '')
    : '';

  const copyBookingRef = () => {
    if (!publicRef) return;
    void navigator.clipboard?.writeText(publicRef).then(
      () => {
        setCopiedRef(true);
        window.setTimeout(() => setCopiedRef(false), 2000);
      },
      () => setCopiedRef(false)
    );
  };

  return (
    <div className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-[1000px]">
      <header className="mb-5">
        <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-8 w-auto" />
      </header>
        {error && !booking && (
          <ErrorState
            className="py-6"
            title="Could not load this booking"
            body={userFacingError(error, USER_ERROR.booking)}
            retry={{ onClick: () => void load() }}
            back={{ onClick: goToBookings, label: 'Open Trips' }}
            extra={
              <button type="button" onClick={() => onNavigate('contact')} className="tv-btn-ghost">
                Contact support
              </button>
            }
          />
        )}

        {!booking && !error && (
          <div
            className="tv-card p-4 sm:p-5 space-y-3"
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
          <div className="overflow-hidden tv-confirm-shell">
            <div
              className={`tv-confirm-hero border-b border-black/[0.08] px-5 py-5 sm:px-8 ${
                paidActive
                  ? 'tv-confirm-hero--good'
                  : cancelled
                    ? 'tv-confirm-hero--bad'
                    : needsPay || confirming
                      ? 'tv-confirm-hero--warn'
                      : 'tv-confirm-hero--info'
              }`}
            >
              {paidActive ? (
                <div className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <CheckCircle className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <h1 className="font-sans text-3xl font-bold tracking-tight text-ink">Booking confirmed!</h1>
                    <p className="mt-1 text-sm text-ink-muted">You're all set. Your adventure is booked.</p>
                  </div>
                </div>
              ) : (
                <div>
                  <StatusChip tone={statusChipTone}>{statusChipLabel}</StatusChip>
                  <h1 className="mt-2 font-sans text-3xl font-bold tracking-tight text-ink">
                    {cancelled
                      ? 'Booking cancelled'
                      : confirming
                        ? reconciling
                          ? 'Checking your payment'
                          : 'Confirming your payment'
                        : needsPay
                          ? BOOKING_CONFIRMATION_NEEDS_PAY_TITLE
                          : 'Booking received'}
                  </h1>
                  <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-muted">
                    {cancelled
                      ? bookingConfirmationCancelledBody(booking)
                      : confirming
                        ? stalledConfirming
                          ? 'Payment is still settling. Open Trips in a moment if this does not update.'
                          : 'This usually takes a few seconds. We will not mark the booking confirmed until payment is recorded.'
                        : needsPay
                          ? BOOKING_CONFIRMATION_NEEDS_PAY_BODY
                          : 'We saved your booking. The status updates when payment is recorded.'}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-0 px-5 sm:px-6 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.08] pb-4">
                  <div>
                    <p className="text-xs font-semibold text-ink-muted">Booking reference</p>
                    <p className="mt-0.5 font-mono text-lg font-bold tracking-wide text-ink">
                      {publicRef ?? 'Reference pending'}
                    </p>
                  </div>
                  <div className="tv-confirm-no-print flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={copyBookingRef}
                      disabled={!publicRef}
                      className="tv-btn-ghost text-sm disabled:opacity-50"
                      aria-label="Copy booking reference"
                    >
                      {copiedRef ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiedRef ? 'Copied' : 'Copy'}
                    </button>
                    {/* Phase 1674: printable receipt beside Copy for offline voucher use. */}
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="tv-btn-ghost text-sm print:hidden"
                      aria-label="Print booking confirmation"
                    >
                      <Printer className="w-4 h-4" aria-hidden />
                      Print
                    </button>
                  </div>
                </div>

              <div className="grid gap-5 border-b border-black/[0.08] py-5 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
                <div className="overflow-hidden rounded-lg bg-black/[0.04]">
                  {coverImage ? (
                    <img src={coverImage} alt="" className="aspect-[5/4] w-full object-cover md:aspect-[4/5]" />
                  ) : (
                    <div className="aspect-[5/4] w-full md:aspect-[4/5]" />
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold leading-snug text-ink break-words">{listingTitle || (stayCheckOut ? 'Your stay' : 'Your experience')}</h2>
                  {optionLabel ? <p className="mt-1 text-sm font-semibold text-ink-muted break-words">{optionLabel}</p> : null}
                  <dl className="mt-4 space-y-2.5 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                    {stayCheckOut ? 'Stay' : 'Tour'}
                  </p>
                  <p className="mt-1 text-base font-semibold text-ink break-words [overflow-wrap:anywhere]">
                    {listingTitle || (stayCheckOut ? 'Your stay' : 'Your tour')}
                  </p>
                  {optionLabel ? (
                    <p className="mt-1 text-sm text-ink-muted break-words [overflow-wrap:anywhere]">
                      Option · <span className="font-medium text-ink">{optionLabel}</span>
                    </p>
                  ) : null}
                </div>
                    <div className="tv-confirm-fact">
                      <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                      <div>
                        <dt className="text-xs font-semibold text-ink-muted">{stayCheckOut ? 'Stay dates' : 'Date'}</dt>
                        <dd className="font-semibold text-ink">{dateLabel}</dd>
                        {confirmationNightCount ? (
                          <dd className="text-ink-muted">
                            {confirmationNightCount} night{confirmationNightCount === 1 ? '' : 's'}
                          </dd>
                        ) : null}
                      </div>
                    </div>
                    {!stayCheckOut && startHm ? (
                      <div className="tv-confirm-fact">
                        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                        <div>
                          <dt className="text-xs font-semibold text-ink-muted">Departure</dt>
                          <dd className="font-semibold text-ink">{startHm}</dd>
                        </div>
                      </div>
                    ) : null}
                    <div className="tv-confirm-fact">
                      <Users className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                      <div>
                        <dt className="text-xs font-semibold text-ink-muted">Participants</dt>
                        <dd className="font-semibold text-ink">{formatBookingParticipantsLabel(booking)}</dd>
                      </div>
                    </div>
                    {arrival ? (
                      <div className="tv-confirm-fact">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                        <div>
                          <dt className="text-xs font-semibold text-ink-muted">{arrival.label}</dt>
                          <dd className="font-semibold text-ink break-words" data-pending={pickupPending && !arrival.value ? 'true' : 'false'}>
                            {arrival.value ?? `${arrival.label} is not confirmed yet.`}
                          </dd>
                          {arrival.time ? <dd className="text-ink-muted">Pickup time {arrival.time}</dd> : null}
                        </div>
                      </div>
                    ) : null}
                    {!isStayBooking &&
                    collected &&
                    (() => {
                      const phone = displayBookingContactPhoneFromPurchase(
                        booking.purchase_snapshot,
                        booking.payment_status
                      );
                      if (!phone) return null;
                      return (
                        <div className="tv-confirm-fact">
                          <div>
                            <dt className="text-xs font-semibold text-ink-muted">Operator</dt>
                            <dd className="font-semibold text-ink">
                              <a href={`tel:${phone}`} className="underline-offset-2 hover:underline">
                                {formatBookingContactForDisplay(phone)}
                              </a>
                            </dd>
                          </div>
                        </div>
                      );
                    })()}
                  </dl>
                </div>
              </div>

              {collected && booking.amount_paid != null && (
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/[0.08] py-4">
                  <div>
                    {paidNightlyBreakdown ? (
                      <p className="text-sm text-ink-muted">
                        {paidNightlyBreakdown.nights} night{paidNightlyBreakdown.nights === 1 ? '' : 's'} ×{' '}
                        {formatMoney(Number(booking.nightly_amount), booking.currency)}
                        {booking.cleaning_fee != null && Number(booking.cleaning_fee) > 0
                          ? ` + ${formatMoney(Number(booking.cleaning_fee), booking.currency)} cleaning`
                          : ''}
                      </p>
                    ) : null}
                    <p className="text-xs font-semibold text-ink-muted">{cancelled ? payLabel : 'Amount paid'}</p>
                    {/* Phase 1861: money + TEST as siblings with an explicit space (avoid “€89TEST”). */}
                    <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-sans text-2xl font-bold tabular-nums text-ink">
                      <span>{formatMoney(Number(booking.amount_paid), booking.currency)}</span>
                      {isStripeTestCheckoutSession(booking.checkout_session_id) || appStripeIsTestMode() ? (
                        <span className="text-sm font-semibold text-amber-800">{' '}TEST</span>
                      ) : null}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-ink">{payLabel}</p>
                </div>
              )}

              {cancellationPolicy ? (
                <details className="border-b border-black/[0.08] py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-ink">Cancellation terms</summary>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{cancellationPolicy}</p>
                </details>
              ) : null}

              <p className="py-4 text-sm text-ink-muted">
                {cancelled
                  ? bookingConfirmationCancelledNextStep(booking)
                  : needsPay
                    ? payLabel === 'Hold expired'
                      ? TRAVELER_HOLD_EXPIRED_PAY_NOW_NOTE
                      : 'Payment is still required. You can finish it from here or from Trips.'
                    : "Your booking details and any updates from your operator are available in Trips."}
              </p>
              {payNowError ? (
                <NoticeCallout title="Could not open checkout" tone="danger">
                  {payNowError}
                </NoticeCallout>
              ) : null}

              <div className="tv-confirm-no-print flex flex-col gap-2 sm:flex-row sm:items-center">
                {needsPay ? (
                  <button
                    type="button"
                    onClick={() => void handlePayNow()}
                    disabled={payingNow}
                    className="tv-btn-primary w-full sm:w-auto"
                  >
                    {payingNow ? TRAVELER_OPENING_CHECKOUT_CTA : TRAVELER_PAY_NOW_TEST_CTA}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={goToBookings}
                  className={needsPay ? 'tv-btn-secondary w-full sm:w-auto' : 'tv-btn-primary w-full sm:w-auto'}
                >
                  {/* Phase 1616: primary trip action from this confirmation. */}
                  View booking in Trips
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate(stayCheckOut ? 'stays' : 'packages')}
                  className="tv-btn-ghost w-full justify-center sm:w-auto"
                >
                  Explore more experiences
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
