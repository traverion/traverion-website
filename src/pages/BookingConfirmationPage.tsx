/**
 * Minimal post–Stripe Checkout screen for one booking (no site header/footer).
 * Stripe redirects here with ?session_id=cs_…; we resolve the row via RLS.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle, Calendar, LogIn, Copy, Check, Printer, MapPin, ExternalLink } from 'lucide-react';
import RentalCollectionMap from '../components/supplier/listing-creation/RentalCollectionMap';
import {
  rentalPickupHandoverLabel,
  rentalReturnHandoverLabel,
  rentalReturnPoint,
} from '../lib/rental-presentation';
import { Skeleton } from '../components/ui/Skeleton';
import ErrorState from '../components/ErrorState';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { fetchMyBookingByCheckoutSessionId,
  reconcileCheckoutSession,
  resumePendingBookingCheckout,
  type BookingWithPaymentRow,
} from '../data/supabase-bookings';
import { fetchListingById, fetchListingOpsByIds, pgTimeToHm } from '../data/supabase-listings';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import CheckoutPageShell, { CHECKOUT_TWO_COL } from '../components/checkout/CheckoutPageShell';
import { rentalQuantityUnits } from '../lib/rental-presentation';
import type { RentalCategoryId } from '../types/rental';
import { isRentalCategoryId } from '../types/rental';
import { nightsOccupiedByStay, stayRangeFromBooking } from '../lib/stayOccupancy';
import { formatMoney } from '../lib/money';
import {
  showStripeTestAmountBadge,
  STRIPE_TEST_AMOUNT_BADGE,
  TRAVELER_TEST_MODE_LABEL,
  travelerPayNowCtaLabel,
} from '../lib/traveler-env-presentation';
import NoticeCallout from '../components/NoticeCallout';
import StatusChip, { toneForPaymentLabel } from '../components/StatusChip';
import {
  bookingIsRental,
  bookingIsStayNight,
  bookingProductNoun,
  listingPickupCopyIncomplete,
  resolvePartnerPickupCopy,
} from '../lib/pickup-completeness';
import { parseRentalPurchaseSnapshot } from '../lib/rental-booking-domain';
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
import { optionLogisticsLines, readOptionLogistics } from '../lib/option-logistics';
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
  stayConfirmationPaidNightlyBreakdown,
  stayPaidAdjacentNightCount,
} from '../lib/booking-confirmation-copy';
import { formatBookingParticipantsLabel } from '../lib/participant-mix';
import SavedStayPrice from '../components/booking/SavedStayPrice';
import { readStayBookingPrice } from '../lib/stay-price';
import { formatBookingDateDisplay } from '../lib/booking-flow';
import { travelerFacingBookingOptions } from '../lib/legacy-participant-options';
import { travelerPaymentLabel, bookingPaymentWasCollected } from '../lib/payment-states';
import {
  confirmationShouldReconcileCheckout,
  confirmationStillWaitingAfterReconcile,
} from '../lib/checkout-confirmation-reconcile';
import {
  isStayRequestAwaitingHost,
  stayRequestIsCapturePending,
  stayRequestLifecycleLabel,
} from '../lib/stay-request-approval';

const SESSION_RETURN_KEY = 'traverion_checkout_return_session_id';

function confirmationMapHref(address: string, lat: number | null, lng: number | null): string {
  if (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function confirmationEmailSentence(
  notice: 'idle' | 'sent' | 'failed' | 'pending' | 'unknown',
  email: string
): string | null {
  if (!email || notice === 'idle') return null;
  if (notice === 'sent') return `We've sent your booking confirmation to ${email}.`;
  if (notice === 'failed') {
    return `We couldn't send the confirmation email to ${email}. Your booking is saved in My bookings.`;
  }
  if (notice === 'pending') {
    return `Your confirmation email to ${email} is still being sent. Open My bookings if it does not arrive.`;
  }
  return `A confirmation email goes to ${email} when the mail provider accepts it. If it does not arrive, open My bookings.`;
}

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
  const [celebrateSuccess, setCelebrateSuccess] = useState(false);
  const [emailNotice, setEmailNotice] = useState<'idle' | 'sent' | 'failed' | 'pending' | 'unknown'>('idle');
  const [coverImage, setCoverImage] = useState('');
  const [meetingPoint, setMeetingPoint] = useState('');
  const [rentalCategoryId, setRentalCategoryId] = useState<RentalCategoryId | null>(null);
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
    setRentalCategoryId(null);
    setError(null);
    setPollCount(0);
    setReconcileAttempted(false);
    setReconciling(false);
    setPayNowError(null);
  }, []);

  const load = useCallback(async () => {
    if (!sessionId) {
      setError('Missing payment session. Open the link from your payment receipt or go to My bookings.');
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
          'We could not find this booking for your account yet. If you just paid, wait a few seconds and refresh — or open My bookings.'
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
              `Your ${bookingProductNoun(row).toLowerCase()}`
            )
          );
          const stay = bookingIsStayNight(row);
          const rental = bookingIsRental(row);
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
              !rental &&
              listingPickupCopyIncomplete(tripPickup.meetingPoint || null, tripPickup.pickupInstructions || null) &&
              !row.pickup_time
          );
        } catch {
          if (gen !== loadGenRef.current) return;
          setListingTitle(
            displayListingTitleFromPurchase(
              row.purchase_snapshot,
              '',
              `Your ${bookingProductNoun(row).toLowerCase()}`
            )
          );
          const stay = bookingIsStayNight(row);
          const rental = bookingIsRental(row);
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
              !rental &&
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
          const listingRentalCat = listing?.listingExtras?.rental?.category;
          setRentalCategoryId(
            typeof listingRentalCat === 'string' && isRentalCategoryId(listingRentalCat)
              ? listingRentalCat
              : null
          );
        } catch {
          if (gen !== loadGenRef.current) return;
          setOptionLabel(displayOptionLabelFromPurchase(row.purchase_snapshot, ''));
          setRentalCategoryId(null);
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
  const isRentalBooking = booking ? bookingIsRental(booking) : false;
  const rentalSnap = booking ? parseRentalPurchaseSnapshot(booking.purchase_snapshot) : null;
  const rentalReturn = rentalSnap ? rentalReturnPoint(rentalSnap) : null;
  const stayRange = isStayBooking && booking ? stayRangeFromBooking(booking) : null;
  const stayCheckOut = stayRange?.checkOut ?? null;
  const stayNights = stayRange ? nightsOccupiedByStay(stayRange.checkIn, stayRange.checkOut).length : null;

  const dateLabel = useMemo(() => {
    if (rentalSnap?.pickupAt && rentalSnap.returnAt) {
      const pick = new Date(rentalSnap.pickupAt);
      const ret = new Date(rentalSnap.returnAt);
      if (!Number.isNaN(pick.getTime()) && !Number.isNaN(ret.getTime())) {
        const start = formatBookingDateDisplay(pick.toISOString().slice(0, 10));
        const end = formatBookingDateDisplay(ret.toISOString().slice(0, 10));
        if (start && end) {
          const clock = (d: Date) =>
            d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
          const option = rentalSnap.variantName?.trim();
          return [option, `${start} ${clock(pick)} → ${end} ${clock(ret)}`].filter(Boolean).join(' · ');
        }
      }
    }
    if (!booking?.booking_date) return '—';
    const start = formatBookingDateDisplay(booking.booking_date);
    if (!start) return booking.booking_date;
    if (stayCheckOut) {
      const end = formatBookingDateDisplay(stayCheckOut);
      return end ? `${start} → ${end}` : start;
    }
    return start;
  }, [booking?.booking_date, stayCheckOut, rentalSnap]);

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

  /** Subtle success motion once per booking id (never invents confirmed state). */
  useEffect(() => {
    if (!paidActive || !booking?.id) {
      setCelebrateSuccess(false);
      return;
    }
    const key = `tv_confirm_celebrate_${booking.id}`;
    try {
      if (sessionStorage.getItem(key)) {
        setCelebrateSuccess(false);
        return;
      }
      sessionStorage.setItem(key, '1');
    } catch {
      /* still animate once in this mount */
    }
    setCelebrateSuccess(true);
  }, [paidActive, booking?.id]);

  useEffect(() => {
    if (!paidActive || !booking?.id || !supabase) {
      setEmailNotice('idle');
      return;
    }
    let cancelled = false;
    setEmailNotice('pending');
    void supabase
      .rpc('traveler_confirmation_email_status', { p_booking_id: booking.id })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return;
        if (rpcError) {
          setEmailNotice('unknown');
          return;
        }
        const status = typeof data === 'string' ? data : '';
        if (status === 'sent' || status === 'skipped') setEmailNotice('sent');
        else if (status === 'failed') setEmailNotice('failed');
        else setEmailNotice('pending');
      });
    return () => {
      cancelled = true;
    };
  }, [booking?.id, paidActive]);

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
          <p className="tv-eyebrow mb-2">Booking confirmation</p>
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
          <p className="tv-eyebrow mb-2">Booking confirmation</p>
          <h1 className="font-display text-2xl tracking-tight text-ink">No checkout in this link</h1>
          <p className="text-ink-muted text-sm mt-2 mb-6 leading-relaxed">
            {userFacingError(
              error,
              'This page needs the return link from payment. Open My bookings if you already booked.'
            )}
          </p>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={goToBookings} className="tv-btn-primary w-full">
              <Calendar className="w-4 h-4" aria-hidden />
              Open My bookings
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

  const awaitingHost = booking ? isStayRequestAwaitingHost(booking) : false;
  const capturePending = booking ? stayRequestIsCapturePending(booking) : false;
  const statusChipLabel = cancelled
    ? payLabel
    : paidActive
      ? 'Confirmed'
      : awaitingHost || capturePending
        ? stayRequestLifecycleLabel(booking!)
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
      : awaitingHost || capturePending || confirming || needsPay
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
  const logistics = readOptionLogistics(booking?.purchase_snapshot);
  const logisticsLines = optionLogisticsLines({
    ...logistics,
    fulfillment: displayFulfillmentFromPurchase(booking?.purchase_snapshot) ?? logistics?.fulfillment,
  });
  const hideExactPickupClock = logistics?.pickupTiming === 'before_start';
  const cancellationPolicy = booking
    ? displayCancellationPolicyFromPurchase(booking.purchase_snapshot, '')
    : '';
  const purchaseSnap =
    booking?.purchase_snapshot && typeof booking.purchase_snapshot === 'object'
      ? (booking.purchase_snapshot as PurchaseSnapshot)
      : null;
  const pickupMapLat =
    displayFulfillmentFromPurchase(booking?.purchase_snapshot) === 'pickup' &&
    typeof purchaseSnap?.travelerPickupLat === 'number'
      ? purchaseSnap.travelerPickupLat
      : null;
  const pickupMapLng =
    displayFulfillmentFromPurchase(booking?.purchase_snapshot) === 'pickup' &&
    typeof purchaseSnap?.travelerPickupLng === 'number'
      ? purchaseSnap.travelerPickupLng
      : null;
  const arrivalInstructions = (purchaseSnap?.pickupInstructions ?? '').trim();
  const emailLine = booking
    ? confirmationEmailSentence(emailNotice, (booking.guest_email ?? user?.email ?? '').trim())
    : null;

  const rentalPickupParts = (() => {
    if (!rentalSnap?.pickupAt) return null;
    const d = new Date(rentalSnap.pickupAt);
    if (Number.isNaN(d.getTime())) return null;
    return {
      date: formatBookingDateDisplay(d.toISOString().slice(0, 10)) || d.toISOString().slice(0, 10),
      time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      label: `${formatBookingDateDisplay(d.toISOString().slice(0, 10)) || d.toISOString().slice(0, 10)} · ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`,
    };
  })();
  const rentalReturnParts = (() => {
    if (!rentalSnap?.returnAt) return null;
    const d = new Date(rentalSnap.returnAt);
    if (Number.isNaN(d.getTime())) return null;
    return {
      date: formatBookingDateDisplay(d.toISOString().slice(0, 10)) || d.toISOString().slice(0, 10),
      time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      label: `${formatBookingDateDisplay(d.toISOString().slice(0, 10)) || d.toISOString().slice(0, 10)} · ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`,
    };
  })();
  const rentalQtyLabel = (() => {
    if (!rentalSnap || typeof rentalSnap.quantity !== 'number' || rentalSnap.quantity <= 0) return null;
    const rawCat = (booking?.purchase_snapshot as { rentalCategory?: unknown } | null)?.rentalCategory;
    const cat =
      (typeof rawCat === 'string' && isRentalCategoryId(rawCat) ? rawCat : null) ?? rentalCategoryId;
    const units = cat
      ? rentalQuantityUnits({ category: cat } as import('../types/rental').RentalDetails)
      : { singular: 'item', plural: 'items' };
    return `${rentalSnap.quantity} ${rentalSnap.quantity === 1 ? units.singular : units.plural}`;
  })();
  const rentalDurationLabel =
    rentalSnap && typeof rentalSnap.durationCount === 'number' && rentalSnap.durationCount > 0
      ? `${rentalSnap.durationCount} ${
          rentalSnap.durationUnit === 'hour'
            ? rentalSnap.durationCount === 1
              ? 'hour'
              : 'hours'
            : rentalSnap.durationCount === 1
              ? 'day'
              : 'days'
        }`
      : null;
  const rentalPickupHandover = rentalSnap ? rentalPickupHandoverLabel(rentalSnap) : '';
  const rentalReturnHandover = rentalSnap ? rentalReturnHandoverLabel(rentalSnap) : '';
  const rentalReturnPlace = rentalReturn
    ? rentalReturn.sameAsPickup
      ? rentalReturn.address
        ? `Same as pickup · ${rentalReturn.address}`
        : 'Same as pickup'
      : rentalReturn.address || null
    : null;
  const depositDisclosure = (
    (rentalSnap?.depositDisclosure ?? '').trim() ||
    (typeof rentalSnap?.depositAmountMinor === 'number' && rentalSnap.depositAmountMinor > 0
      ? `Security deposit: ${formatMoney(rentalSnap.depositAmountMinor / 100, rentalSnap.currency || booking?.currency || 'EUR')}`
      : '')
  ).trim();
  const explorePage = isRentalBooking ? 'rentals' : stayCheckOut ? 'stays' : 'packages';
  const participantsLabel = isRentalBooking
    ? null
    : stayCheckOut
      ? 'Guests'
      : 'Participants';
  const participantsValue = booking ? formatBookingParticipantsLabel(booking) : '—';
  const summaryDateLine = isRentalBooking
    ? [rentalPickupParts?.label, rentalReturnParts ? `→ ${rentalReturnParts.label}` : null]
        .filter(Boolean)
        .join(' ')
    : dateLabel;
  const summaryQtyLine = isRentalBooking
    ? rentalQtyLabel
    : stayCheckOut
      ? participantsValue
      : participantsValue;
  const locationAddress = isRentalBooking
    ? (rentalSnap?.pickupAddress ?? '').trim()
    : stayCheckOut
      ? (meetingPoint || '').trim()
      : (arrival?.value ?? '').trim();
  const locationDirectionsHref = locationAddress
    ? confirmationMapHref(
        locationAddress,
        isRentalBooking
          ? typeof rentalSnap?.pickupLat === 'number'
            ? rentalSnap.pickupLat
            : null
          : pickupMapLat,
        isRentalBooking
          ? typeof rentalSnap?.pickupLng === 'number'
            ? rentalSnap.pickupLng
            : null
          : pickupMapLng
      )
    : null;
  const hasEmbeddedPickupMap =
    isRentalBooking &&
    typeof rentalSnap?.pickupLat === 'number' &&
    typeof rentalSnap.pickupLng === 'number';
  const hasEmbeddedReturnMap =
    isRentalBooking &&
    Boolean(rentalReturn) &&
    !rentalReturn!.sameAsPickup &&
    rentalReturn!.lat != null &&
    rentalReturn!.lng != null;
  const hasTourPickupMap =
    !isRentalBooking &&
    !stayCheckOut &&
    pickupMapLat != null &&
    pickupMapLng != null;
  const locationInstructions = [
    isRentalBooking ? (rentalSnap?.pickupInstructions ?? '').trim() : '',
    isRentalBooking && !rentalReturn?.sameAsPickup ? (rentalSnap?.returnInstructions ?? '').trim() : '',
    isRentalBooking ? (rentalSnap?.collectionNotes ?? '').trim() : '',
    isRentalBooking ? (rentalSnap?.returnCollectionNotes ?? '').trim() : '',
    !isRentalBooking ? arrivalInstructions : '',
    ...(!isRentalBooking && !stayCheckOut ? logisticsLines : []),
  ].filter(Boolean);
  const showLocationBlock =
    Boolean(locationAddress) ||
    hasEmbeddedPickupMap ||
    hasEmbeddedReturnMap ||
    hasTourPickupMap ||
    Boolean(arrival?.value) ||
    Boolean(pickupPending && arrival);

  const fact = (label: string, value: ReactNode) => (
    <div className="tv-confirm-fact min-w-0 !p-0">
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">{label}</dt>
        <dd className="mt-0.5 text-[13px] font-semibold leading-snug text-ink break-words [overflow-wrap:anywhere]">
          {value}
        </dd>
      </div>
    </div>
  );

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
    <CheckoutPageShell
      onBrandClick={() => onNavigate(explorePage)}
      srBackLabel="Back to Traverion"
      secureLabel="Secure booking"
    >
        {error && !booking && (
          <ErrorState
            className="py-6"
            title="Could not load this booking"
            body={userFacingError(error, USER_ERROR.booking)}
            retry={{ onClick: () => void load() }}
            back={{ onClick: goToBookings, label: 'Open My bookings' }}
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
          <>
            <div
              className={`tv-confirm-shell tv-checkout-panel tv-confirm-hero mb-4 ${
                paidActive
                  ? 'tv-confirm-hero--good'
                  : cancelled
                    ? 'tv-confirm-hero--bad'
                    : needsPay || confirming || awaitingHost || capturePending
                      ? 'tv-confirm-hero--warn'
                      : 'tv-confirm-hero--info'
              }`}
            >
              {paidActive ? (
                <div className="flex items-start gap-2.5">
                  <span
                    className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm ${
                      celebrateSuccess ? 'tv-confirm-success-icon--animate' : ''
                    }`}
                  >
                    <CheckCircle className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h1 className="font-sans text-xl font-bold tracking-tight text-ink sm:text-2xl">
                      Booking confirmed!
                    </h1>
                    <p className="mt-0.5 text-[13px] text-ink-muted">Your adventure is booked.</p>
                    {emailLine ? (
                      <p className="mt-1 max-w-xl text-[13px] leading-snug text-ink-muted break-words [overflow-wrap:anywhere]">
                        {emailLine}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusChip tone="good">Paid · Confirmed</StatusChip>
                      {showStripeTestAmountBadge(booking.checkout_session_id) ? (
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                          {TRAVELER_TEST_MODE_LABEL}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <StatusChip tone={statusChipTone}>{statusChipLabel}</StatusChip>
                  <h1 className="mt-2 font-sans text-xl font-bold tracking-tight text-ink sm:text-2xl">
                    {cancelled
                      ? 'Booking cancelled'
                      : awaitingHost
                        ? 'Booking request sent'
                        : capturePending || confirming
                          ? reconciling || capturePending
                            ? 'Checking your payment'
                            : 'Confirming your payment'
                          : needsPay
                            ? BOOKING_CONFIRMATION_NEEDS_PAY_TITLE
                            : 'Booking received'}
                  </h1>
                  <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-muted">
                    {cancelled
                      ? bookingConfirmationCancelledBody(booking)
                      : awaitingHost
                        ? 'Your host has up to 24 hours to respond. Your payment method has been authorized, but payment has not yet been captured. The authorization may appear as a pending transaction on your bank statement.'
                        : capturePending
                          ? 'The host accepted your request. We are confirming payment capture — this usually takes a few seconds.'
                          : confirming
                            ? stalledConfirming
                              ? 'Payment is still settling. Open My bookings in a moment if this does not update.'
                              : 'This usually takes a few seconds. We will not mark the booking confirmed until payment is recorded.'
                            : needsPay
                              ? BOOKING_CONFIRMATION_NEEDS_PAY_BODY
                              : 'We saved your booking. The status updates when payment is recorded.'}
                  </p>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.06] pt-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                    Booking reference
                  </p>
                  <p className="mt-0.5 font-mono text-base font-bold tracking-wide text-ink break-all sm:text-lg">
                    {publicRef ?? 'Reference pending'}
                  </p>
                  {(booking.guest_name ?? '').trim() ? (
                    <p className="mt-0.5 text-[12px] text-ink-muted break-words [overflow-wrap:anywhere]">
                      Booked for {(booking.guest_name ?? '').trim()}
                    </p>
                  ) : null}
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
            </div>

            <div className={CHECKOUT_TWO_COL}>
              <div className="tv-checkout-panel min-w-0 space-y-0 p-4 sm:p-5">
              <div className="flex flex-col gap-3 border-b border-black/[0.08] pb-3.5 sm:flex-row sm:items-center">
                {coverImage ? (
                  <img
                    src={coverImage}
                    alt=""
                    className="h-28 w-full shrink-0 rounded-lg object-cover ring-1 ring-black/[0.06] sm:h-24 sm:w-36"
                  />
                ) : (
                  <div className="flex h-28 w-full shrink-0 items-center justify-center rounded-lg bg-black/[0.04] ring-1 ring-black/[0.06] sm:h-24 sm:w-36">
                    <Calendar className="h-6 w-6 text-ink-faint" aria-hidden />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="font-sans text-[15px] font-bold leading-snug tracking-tight text-ink break-words [overflow-wrap:anywhere] sm:text-base">
                    {listingTitle || (stayCheckOut ? 'Your stay' : isRentalBooking ? 'Your rental' : 'Your experience')}
                  </h2>
                  {(isRentalBooking && rentalSnap?.variantName) || optionLabel ? (
                    <p className="mt-0.5 text-[13px] text-ink-muted break-words [overflow-wrap:anywhere]">
                      {isRentalBooking && rentalSnap?.variantName
                        ? rentalSnap.variantName
                        : optionLabel}
                    </p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-muted">
                    {summaryDateLine ? <span className="font-medium text-ink">{summaryDateLine}</span> : null}
                    {summaryQtyLine ? <span>{summaryQtyLine}</span> : null}
                    {confirmationNightCount ? (
                      <span>
                        {confirmationNightCount} night{confirmationNightCount === 1 ? '' : 's'}
                      </span>
                    ) : null}
                    {rentalDurationLabel ? <span>{rentalDurationLabel}</span> : null}
                  </div>
                </div>
              </div>

              {(isRentalBooking &&
                (rentalSnap?.pickupAddress ||
                  rentalReturnPlace ||
                  rentalPickupHandover ||
                  rentalReturnHandover)) ||
              (!isRentalBooking && !stayCheckOut && arrival?.time && !hideExactPickupClock) ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-b border-black/[0.08] py-3.5">
                  {isRentalBooking ? (
                    <>
                      {rentalSnap?.pickupAddress ? fact('Pickup place', rentalSnap.pickupAddress) : null}
                      {rentalReturnPlace ? fact('Return place', rentalReturnPlace) : null}
                      {rentalPickupHandover ? fact('Pickup handover', rentalPickupHandover) : null}
                      {rentalReturnHandover ? fact('Return handover', rentalReturnHandover) : null}
                    </>
                  ) : arrival?.time && !hideExactPickupClock ? (
                    fact('Pickup time', arrival.time)
                  ) : null}
                </dl>
              ) : null}

              {showLocationBlock ? (
                <div className="border-b border-black/[0.08] py-3.5">
                  <div className="tv-confirm-fact !p-0">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                        Location & directions
                      </p>
                      {locationAddress ? (
                        <p
                          className="mt-0.5 text-[13px] font-semibold leading-snug text-ink break-words [overflow-wrap:anywhere]"
                          data-pending={pickupPending && !arrival?.value ? 'true' : 'false'}
                        >
                          {locationAddress}
                        </p>
                      ) : arrival && !arrival.value ? (
                        <p className="mt-0.5 text-[13px] font-semibold text-ink" data-pending="true">
                          {arrival.label} is not confirmed yet.
                        </p>
                      ) : null}
                      {locationDirectionsHref ? (
                        <a
                          href={locationDirectionsHref}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-finland hover:underline"
                        >
                          Open directions
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                      ) : null}
                      {hasEmbeddedPickupMap ||
                      hasEmbeddedReturnMap ||
                      hasTourPickupMap ||
                      locationInstructions.length > 0 ? (
                        <details className="mt-2 group">
                          <summary className="cursor-pointer text-[13px] font-semibold text-finland">
                            Show map & instructions
                          </summary>
                          <div className="mt-2 space-y-2.5">
                            {locationInstructions.map((line) => (
                              <p
                                key={line.slice(0, 48)}
                                className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-muted"
                              >
                                {line}
                              </p>
                            ))}
                            {hasEmbeddedPickupMap ? (
                              <RentalCollectionMap
                                lat={rentalSnap!.pickupLat!}
                                lng={rentalSnap!.pickupLng!}
                                label={
                                  rentalReturn?.sameAsPickup
                                    ? 'Pickup and return map'
                                    : 'Pickup location map'
                                }
                                compact
                              />
                            ) : null}
                            {hasEmbeddedReturnMap ? (
                              <RentalCollectionMap
                                lat={rentalReturn!.lat!}
                                lng={rentalReturn!.lng!}
                                label="Return location map"
                                compact
                              />
                            ) : null}
                            {hasTourPickupMap ? (
                              <RentalCollectionMap
                                lat={pickupMapLat!}
                                lng={pickupMapLng!}
                                label="Pickup location map"
                                compact
                              />
                            ) : null}
                          </div>
                        </details>
                      ) : null}
                    </div>
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
                  <div className="border-b border-black/[0.08] py-3">
                    <div className="tv-confirm-fact !p-0">
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                          Operator
                        </dt>
                        <dd className="mt-0.5 text-[13px] font-semibold text-ink">
                          <a href={`tel:${phone}`} className="underline-offset-2 hover:underline">
                            {formatBookingContactForDisplay(phone)}
                          </a>
                        </dd>
                      </div>
                    </div>
                  </div>
                );
              })()}

              </div>

              <aside className="mt-4 min-w-0 space-y-3 lg:mt-0 lg:sticky lg:top-4 lg:self-start">
              <div className="tv-checkout-panel p-4 sm:p-5">
              {collected && booking.amount_paid != null && (
                <div className="border-b border-black/[0.08] pb-3.5">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                      <SavedStayPrice
                        snapshot={booking.purchase_snapshot}
                        currency={booking.currency}
                        amountPaid={Number(booking.amount_paid)}
                        totalLabel="Booked total"
                      />
                      {paidNightlyBreakdown && !readStayBookingPrice(booking.purchase_snapshot) ? (
                        <p className="text-[13px] text-ink-muted">
                          {paidNightlyBreakdown.nights} night{paidNightlyBreakdown.nights === 1 ? '' : 's'} ×{' '}
                          {formatMoney(Number(booking.nightly_amount), booking.currency)}
                          {booking.cleaning_fee != null && Number(booking.cleaning_fee) > 0
                            ? ` + ${formatMoney(Number(booking.cleaning_fee), booking.currency)} cleaning`
                            : ''}
                        </p>
                      ) : null}
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                        {cancelled ? payLabel : 'Amount paid'}
                      </p>
                      {/* Phase 1861: money + TEST as siblings with an explicit space (avoid “€89TEST”). */}
                      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-sans text-2xl font-bold tabular-nums text-ink">
                        <span>{formatMoney(Number(booking.amount_paid), booking.currency)}</span>
                        {showStripeTestAmountBadge(booking.checkout_session_id) ? (
                          <span className="text-sm font-semibold text-amber-800">
                            {' '}
                            {STRIPE_TEST_AMOUNT_BADGE}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <p className="text-[13px] font-semibold text-ink">{payLabel}</p>
                  </div>
                  {depositDisclosure ? (
                    <p className="mt-2 text-[13px] leading-snug text-ink-muted">{depositDisclosure}</p>
                  ) : null}
                  {(cancellationPolicy || rentalSnap?.cancellationLabel) && paidActive ? (
                    <p className="mt-2 text-[13px] font-medium leading-snug text-ink">
                      {(rentalSnap?.cancellationLabel || cancellationPolicy).split('.')[0]}.
                    </p>
                  ) : null}
                </div>
              )}

              {cancellationPolicy || rentalSnap?.cancellationLabel ? (
                <details className="border-b border-black/[0.08] py-3">
                  <summary className="cursor-pointer text-[13px] font-semibold text-ink">
                    Cancellation terms
                  </summary>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                    {cancellationPolicy || rentalSnap?.cancellationLabel}
                  </p>
                </details>
              ) : null}

              <p className="py-3 text-[13px] text-ink-muted">
                {cancelled
                  ? bookingConfirmationCancelledNextStep(booking)
                  : needsPay
                    ? payLabel === 'Checkout expired' || payLabel === 'Hold expired'
                      ? TRAVELER_HOLD_EXPIRED_PAY_NOW_NOTE
                      : 'Payment is still required. You can finish it from here or from My bookings.'
                    : 'Your booking details and updates are available in My bookings.'}
              </p>
              {payNowError ? (
                <NoticeCallout title="Could not open checkout" tone="danger">
                  {payNowError}
                </NoticeCallout>
              ) : null}

              <div className="tv-confirm-no-print flex flex-col gap-2 pt-1">
                {needsPay ? (
                  <button
                    type="button"
                    onClick={() => void handlePayNow()}
                    disabled={payingNow}
                    className="tv-btn-primary w-full"
                  >
                    {travelerPayNowCtaLabel(payingNow)}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={goToBookings}
                  className={needsPay ? 'tv-btn-secondary w-full' : 'tv-btn-primary w-full'}
                >
                  {/* Phase 1616: primary trip action from this confirmation. */}
                  View in My bookings
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate(explorePage)}
                  className="px-1 py-2 text-center text-sm font-semibold text-finland hover:underline"
                >
                  Explore more experiences
                </button>
              </div>
              </div>
              </aside>
            </div>
          </>
        )}
    </CheckoutPageShell>
  );
}
