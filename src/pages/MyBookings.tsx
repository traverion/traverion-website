/**
 * Consumer: list of the logged-in user's bookings with status.
 * RLS ensures only rows where guest_email = auth user email are returned.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { LogIn, RefreshCw, ArrowLeft, CalendarDays, MapPin, ChevronDown } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { travelerLoginHref } from '../lib/travelerAuthLinks';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { SkeletonListItem, SkeletonConsumerPage } from '../components/ui/Skeleton';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  fetchMyBookings,
  cancelBookingAsCustomer,
  updateGuestBookingSpecialRequests,
  resumePendingBookingCheckout,
  type BookingRow,
} from '../data/supabase-bookings';
import { fetchListingOpsByIds, pgTimeToHm, type ListingOpsMeta } from '../data/supabase-listings';
import { parseStayCheckOutFromNotes } from '../lib/stayOccupancy';
import { formatMoney, isStripeTestCheckoutSession } from '../lib/money';
import { travelerPaymentLabel, REFUND_DUE_MANUAL_COPY, bookingPaymentWasCollected, isRefundDueBooking } from '../lib/payment-states';
import { formatBookingParticipantsLabel } from '../lib/participant-mix';
import { bookingLifecycleLabel } from '../lib/status-language';
import { travelerSelfCancelRefundChoice, supplierCancellationReasonLabel, travelerSelfCancelBlock, travelerSelfCancelError, travelerSelfCancelIsUnpaidCheckout } from '../lib/cancellation-policy';
import {
  messagingComposeBlock,
  fetchCancellationRequestsForBookings,
  notifyCancellationResolved,
  respondToCancellationRequest,
  type CancellationRequestRow,
} from '../data/supabase-booking-ops';
import BookingMessageThread from '../components/BookingMessageThread';
import StatusChip, { toneForPaymentLabel } from '../components/StatusChip';
import NoticeCallout from '../components/NoticeCallout';
import { listingPickupCopyIncomplete } from '../lib/pickup-completeness';
import { decrementAvailabilityBooked } from '../data/supabase-availability';
import { clearBookingsUnread } from '../lib/customerBookingNotifications';
import { guestFacingBookingNotes } from '../lib/booking-notes';
import { bookingIsCancelledTrip, bookingMatchesTripView, travelerTripIsLive, travelerBookingNeedsPayNow, travelerTripReferenceLabel, sortTravelerCancelledTrips } from '../lib/trip-views';
import {
  BOOKING_CONFIRMATION_EMAIL_DISCLAIMER,
  BOOKING_CONFIRMED_UI_FOLLOWUP_NOTE,
  STRIPE_CHECKOUT_CANCELLED_TOUR_COPY,
  STRIPE_CHECKOUT_CANCELLED_STAY_COPY,
  TRAVELER_CANCELLATION_RESPONSE_DELIVERY_NOTE,
  TRAVELER_SELF_CANCEL_DELIVERY_NOTE,
  TRAVELER_SELF_CANCEL_FULL_REFUND_POLICY,
  TRAVELER_ACCEPT_HOST_CANCEL_REFUND_POLICY,
  TRAVELER_PICKUP_PENDING_UI_NOTE,
  TRAVELER_SELF_CANCEL_CTA,
  TRAVELER_SELF_CANCEL_SUCCESS_REFUND_DUE,
  TRAVELER_SELF_CANCEL_SUCCESS_NO_REFUND,
  TRAVELER_CANCEL_UNPAID_CHECKOUT_CTA,
  TRAVELER_CANCEL_UNPAID_CHECKOUT_SUCCESS,
  TRAVELER_CANCEL_UNPAID_CHECKOUT_POLICY,
  TRAVELER_ACCEPT_CANCEL_SUCCESS,
  TRAVELER_DECLINE_CANCEL_SUCCESS,
  readStripeCheckoutReturnBanner,
} from '../lib/booking-confirmation-copy';

interface MyBookingsProps {
  onNavigate: (page: string) => void;
  onTourSelect?: (tour: { id: string }) => void;
}

function extractPlaceOfStay(notes: string | null | undefined): string {
  const text = (notes ?? '').trim();
  if (!text) return '';
  const line = text
    .split(/\n+/)
    .map((l) => l.trim())
    .find((l) => /^place of stay:/i.test(l));
  return line ? line.replace(/^place of stay:/i, '').trim() : '';
}

function mergePlaceOfStayIntoNotes(notes: string | null | undefined, place: string): string {
  const raw = (notes ?? '').trim();
  const kept = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^place of stay:/i.test(l));
  const normalized = place.trim();
  if (normalized) kept.unshift(`Place of stay: ${normalized}`);
  return kept.join('\n');
}

export default function MyBookings({ onNavigate, onTourSelect }: MyBookingsProps) {
  const { user, loading: authLoading } = useAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [listingOps, setListingOps] = useState<Record<string, ListingOpsMeta>>({});
  const [cancelRequests, setCancelRequests] = useState<Record<string, CancellationRequestRow>>({});
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<BookingRow | null>(null);
  const cancelSheetRef = useRef<HTMLDivElement>(null);
  const closeCancelConfirm = useCallback(() => setCancelConfirm(null), []);
  useDialogFocus(cancelConfirm !== null, cancelSheetRef, closeCancelConfirm);
  const [stayDrafts, setStayDrafts] = useState<Record<string, string>>({});
  const [staySavingId, setStaySavingId] = useState<string | null>(null);
  const [paymentBanner, setPaymentBanner] = useState<'success' | 'cancelled' | null>(() =>
    typeof window === 'undefined' ? null : readStripeCheckoutReturnBanner(window.location.search)
  );
  const [tripView, setTripView] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming');
  const [openTripId, setOpenTripId] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<{ title: string; body: string } | null>(null);

  const getRefundChoiceForCancel = useCallback((b: BookingRow): 'full_refund' | 'no_refund' => {
    return travelerSelfCancelRefundChoice({
      bookingDate: b.booking_date,
      startTimeHm: pgTimeToHm(b.start_time),
      paymentStatus: b.payment_status,
    });
  }, []);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured() || !user?.email) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const list = await fetchMyBookings();
      setBookings(list);
      const ids = [...new Set(list.map((b) => b.listing_id))];
      const ops = await fetchListingOpsByIds(ids);
      setListingOps(ops);
      setTitles(Object.fromEntries(Object.entries(ops).map(([id, v]) => [id, v.title])));
      const reqs = await fetchCancellationRequestsForBookings(list.map((b) => b.id));
      const open: Record<string, CancellationRequestRow> = {};
      for (const r of reqs) {
        if (r.status === 'requested' && !open[r.booking_id]) open[r.booking_id] = r;
      }
      setCancelRequests(open);
    } catch (e) {
      setLoadError(userFacingError(e, USER_ERROR.trips));
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const b of bookings) {
      next[b.id] = extractPlaceOfStay(b.special_requests);
    }
    setStayDrafts(next);
  }, [bookings]);

  const handleSaveStay = useCallback(
    async (b: BookingRow) => {
      setActionError(null);
      const place = (stayDrafts[b.id] ?? '').trim();
      const nextNotes = mergePlaceOfStayIntoNotes(b.special_requests, place);
      if (nextNotes.trim() === (b.special_requests ?? '').trim()) {
        return;
      }
      setStaySavingId(b.id);
      const res = await updateGuestBookingSpecialRequests(b.id, nextNotes);
      setStaySavingId(null);
      if (res.success) await load();
      else setActionError(userFacingError(res.error, 'Could not save place of stay.'));
    },
    [stayDrafts, load]
  );

  const handleCancelBooking = useCallback(async (b: BookingRow) => {
    setCancellingId(b.id);
    setActionError(null);
    setActionSuccess(null);
    const closed = travelerSelfCancelBlock(b);
    if (closed !== 'none') {
      setCancellingId(null);
      setCancelConfirm(null);
      setActionError(travelerSelfCancelError(closed));
      return;
    }
    const refundChoice = getRefundChoiceForCancel(b);
    const unpaid = travelerSelfCancelIsUnpaidCheckout(b);
    const res = await cancelBookingAsCustomer(b.id, refundChoice);
    setCancellingId(null);
    setCancelConfirm(null);
    if (res.success) {
      if (b.booking_date) await decrementAvailabilityBooked(b.listing_id, b.booking_date, b.guests ?? 1);
      setActionSuccess({
        title: unpaid ? 'Checkout cancelled' : 'Booking cancelled',
        body: unpaid
          ? TRAVELER_CANCEL_UNPAID_CHECKOUT_SUCCESS
          : refundChoice === 'full_refund'
            ? TRAVELER_SELF_CANCEL_SUCCESS_REFUND_DUE
            : TRAVELER_SELF_CANCEL_SUCCESS_NO_REFUND,
      });
      setTripView('cancelled');
      load();
    } else {
      setActionError(userFacingError(res.error, 'Could not cancel this booking. Try again.'));
    }
  }, [getRefundChoiceForCancel, load]);

  const handleRespondCancellation = useCallback(
    async (b: BookingRow, req: CancellationRequestRow, accept: boolean) => {
      setRespondingId(req.id);
      setActionError(null);
      setActionSuccess(null);
      const res = await respondToCancellationRequest(req.id, accept);
      setRespondingId(null);
      if (!res.ok) {
        setActionError(userFacingError(res.error, 'Could not update this cancellation request.'));
        return;
      }
      const ops = listingOps[b.listing_id];
      if (ops?.supplier_id && b.guest_email) {
        void notifyCancellationResolved({
          accepted: accept,
          customerEmail: b.guest_email,
          customerName: b.guest_name,
          listingTitle: ops.title || titles[b.listing_id] || 'Booking',
          bookingId: b.id,
          bookingNumber: typeof b.booking_number === 'number' ? b.booking_number : undefined,
          bookingDate: b.booking_date,
          supplierId: ops.supplier_id,
          listingId: b.listing_id,
          guests: b.guests,
        });
      }
      if (accept) {
        setActionSuccess({ title: 'Cancellation accepted', body: TRAVELER_ACCEPT_CANCEL_SUCCESS });
        setTripView('cancelled');
      } else {
        setActionSuccess({ title: 'Cancellation declined', body: TRAVELER_DECLINE_CANCEL_SUCCESS });
      }
      await load();
    },
    [listingOps, titles, load]
  );

  const handlePayNow = useCallback(async (b: BookingRow) => {
    setActionError(null);
    setPayingId(b.id);
    const res = await resumePendingBookingCheckout({ bookingId: b.id });
    setPayingId(null);
    if (!res.success || !res.checkoutUrl) {
      setActionError(userFacingError(res.error, USER_ERROR.checkout));
      return;
    }
    window.location.assign(res.checkoutUrl);
  }, []);

  useEffect(() => {
    if (user) load();
    else setLoading(false);
  }, [user, load]);

  useEffect(() => {
    if (user?.id) clearBookingsUnread(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = new URLSearchParams(window.location.search).get('booking')?.trim();
    if (id) setOpenTripId(id);
  }, []);

  useEffect(() => {
    if (!openTripId || bookings.length === 0) return;
    const b = bookings.find((row) => row.id === openTripId);
    if (!b) return;
    const today = new Date().toISOString().slice(0, 10);
    if (bookingIsCancelledTrip(b)) setTripView('cancelled');
    else if (b.booking_date && b.booking_date < today) setTripView('past');
    else setTripView('upcoming');
  }, [openTripId, bookings]);

  /** Webhook may lag a few seconds behind the redirect — refresh once more after payment. */
  useEffect(() => {
    if (paymentBanner !== 'success') return;
    const id = window.setTimeout(() => void load(), 2800);
    return () => window.clearTimeout(id);
  }, [paymentBanner, load]);

  const pendingPayBookings = useMemo(
    () => bookings.filter((b) => travelerBookingNeedsPayNow(b)),
    [bookings]
  );

  useEffect(() => {
    if (paymentBanner !== 'cancelled' || pendingPayBookings.length === 0) return;
    if (openTripId) return;
    const first = pendingPayBookings[0];
    setOpenTripId(first.id);
    setTripView('upcoming');
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('booking', first.id);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, [paymentBanner, pendingPayBookings, openTripId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!readStripeCheckoutReturnBanner(url.search)) return;
    url.searchParams.delete('payment');
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, '', next);
  }, []);

  const todayIso = new Date().toISOString().slice(0, 10);
  const refundDueCount = useMemo(() => bookings.filter(isRefundDueBooking).length, [bookings]);
  const visibleBookings = useMemo(() => {
    const rows = bookings.filter((b) => bookingMatchesTripView(b, tripView, todayIso));
    if (tripView !== 'cancelled') return rows;
    return sortTravelerCancelledTrips(rows);
  }, [bookings, todayIso, tripView]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-paper tv-page">
        <div className="max-w-2xl mx-auto px-4 py-12 pb-16">
          <header className="mb-8 rounded-2xl bg-paper-raised p-5 sm:p-7 shadow-soft ring-1 ring-black/[0.06]">
            <div className="inline-flex items-center gap-2 rounded-full bg-finland/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland ring-1 ring-finland/15 mb-3">
              Your bookings
            </div>
            <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Trips</h1>
            <p className="mt-2 text-sm text-ink-muted">Upcoming and past tours you booked.</p>
          </header>
          <div className="max-w-md rounded-2xl bg-paper-raised p-5 shadow-soft ring-1 ring-black/[0.06]">
            <h2 className="font-display text-2xl text-ink">Bookings unavailable</h2>
            <p className="mt-3 text-sm text-ink-muted">
              Booking history is available only in the live app setup.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('packages')}
                className="tv-btn-primary"
              >
                Browse tours
              </button>
              <button
                type="button"
                onClick={() => onNavigate('contact')}
                className="tv-btn-ghost"
              >
                Contact support
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    if (authLoading) {
      return <SkeletonConsumerPage titleWidth="w-28" />;
    }
    return (
      <div className="min-h-screen bg-paper tv-page">
        <div className="max-w-xl mx-auto px-4 py-12 pb-16">
          <header className="mb-6 rounded-2xl bg-paper-raised p-5 sm:p-7 shadow-soft ring-1 ring-black/[0.06]">
            <div className="inline-flex items-center gap-2 rounded-full bg-finland/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland ring-1 ring-finland/15 mb-3">
              Your bookings
            </div>
            <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Trips</h1>
          </header>
          <EmptyState
            icon={LogIn}
            className="pt-2 pb-0"
            title="Log in to see your trips"
            body="Bookings are tied to your traveler account. You have not signed in, so there is nothing to show."
            action={
              <button
                type="button"
                onClick={() => {
                  window.history.pushState({}, '', travelerLoginHref('bookings'));
                  onNavigate('auth');
                }}
                className="tv-btn-primary"
              >
                Log in
              </button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper tv-page">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 pb-16">
        <header className="mb-8 rounded-2xl bg-paper-raised p-5 sm:p-7 shadow-soft ring-1 ring-black/[0.06]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">Your bookings</p>
              <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Trips</h1>
              <p className="mt-2 text-sm text-ink-muted max-w-md leading-relaxed">
                Manage upcoming, past, and cancelled tours and stays — payment, pickup, and references in one place.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('account')}
                className="lux-flat inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
              >
                <ArrowLeft className="w-4 h-4" />
                Account
              </button>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="lux-flat inline-flex items-center gap-2 px-3 py-2 text-sm text-ink-muted hover:text-ink disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </header>

        {loadError && (
          <ErrorState
            className="py-6"
            title="Trips unavailable"
            body={userFacingError(loadError, USER_ERROR.trips)}
            retry={{ onClick: () => void load() }}
            extra={
              <button type="button" onClick={() => onNavigate('contact')} className="tv-btn-ghost">
                Contact support
              </button>
            }
          />
        )}
        {actionError ? (
          <div className="mb-8 max-w-lg">
            <NoticeCallout title="Could not complete that action" tone="danger">
              <p>{actionError}</p>
              <button type="button" onClick={() => setActionError(null)} className="tv-btn-ghost mt-3 -ml-2">
                Dismiss
              </button>
            </NoticeCallout>
          </div>
        ) : null}
        {actionSuccess ? (
          <div className="mb-8 max-w-lg">
            <NoticeCallout title={actionSuccess.title} tone="warn">
              <p>{actionSuccess.body}</p>
              <button type="button" onClick={() => setActionSuccess(null)} className="tv-btn-ghost mt-3 -ml-2">
                Dismiss
              </button>
            </NoticeCallout>
          </div>
        ) : null}
        {paymentBanner === 'success' && (
          <div className="mb-8 max-w-lg">
            <h2 className="font-display text-2xl text-ink">Payment received</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Your booking is confirmed. Open this page anytime for details. {BOOKING_CONFIRMED_UI_FOLLOWUP_NOTE}{' '}
              {BOOKING_CONFIRMATION_EMAIL_DISCLAIMER}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => onNavigate('home')} className="tv-btn-primary">
                Home
              </button>
              <button type="button" onClick={() => setPaymentBanner(null)} className="tv-btn-ghost">
                Dismiss
              </button>
            </div>
          </div>
        )}
        {paymentBanner === 'cancelled' && (
          <div className="mb-8 max-w-lg">
            <h2 className="font-display text-2xl text-ink">Payment not completed</h2>
            <p className="mt-2 text-sm text-ink-muted">
              {pendingPayBookings.some((b) => Boolean(b.check_out))
                ? STRIPE_CHECKOUT_CANCELLED_STAY_COPY
                : STRIPE_CHECKOUT_CANCELLED_TOUR_COPY}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {pendingPayBookings[0] ? (
                <button
                  type="button"
                  onClick={() => void handlePayNow(pendingPayBookings[0])}
                  disabled={payingId === pendingPayBookings[0].id}
                  className="tv-btn-primary"
                >
                  {payingId === pendingPayBookings[0].id ? 'Opening checkout…' : 'Pay now'}
                </button>
              ) : (
                <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-primary">
                  Browse tours
                </button>
              )}
              <button type="button" onClick={() => setPaymentBanner(null)} className="tv-btn-ghost">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading your trips">
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
          </div>
        ) : bookings.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No trips yet"
            body="You have not booked a tour or stay, so this list is empty. When you complete a booking, it appears here."
            action={
              <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-primary">
                Browse tours
              </button>
            }
          />
        ) : (
          <div className="space-y-6">
            <div className="flex gap-1 rounded-full bg-paper-raised p-1 w-fit shadow-soft ring-1 ring-black/[0.06]">
              {([
                ['upcoming', 'Upcoming'],
                ['past', 'Past'],
                ['cancelled', 'Cancelled'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTripView(id)}
                  className={`lux-flat rounded-full px-3.5 py-1.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-150 ${
                    tripView === id
                      ? id === 'cancelled'
                        ? 'bg-rose-600 text-white shadow-sm ring-1 ring-rose-700/20'
                        : id === 'past'
                          ? 'bg-stone-700 text-white shadow-sm'
                          : 'bg-finland text-white shadow-sm ring-1 ring-finland/30'
                      : 'text-ink-muted hover:bg-finland/10 hover:text-finland'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {visibleBookings.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                className="py-8"
                title={
                  tripView === 'upcoming'
                    ? 'No upcoming trips'
                    : tripView === 'past'
                      ? 'No past trips'
                      : 'No cancelled trips'
                }
                body={
                  tripView === 'upcoming'
                    ? 'Nothing is scheduled. If you have trips, they may be under Past. Book a tour to add one here.'
                    : tripView === 'past'
                      ? 'You have no completed trips in this list yet. That is normal until a booked date has passed.'
                      : 'You have no cancelled or refunded trips. Trips that still show Refund due appear here until Stripe records a refund.'
                }
                action={
                  tripView === 'upcoming' ? (
                    <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-primary">
                      Browse tours
                    </button>
                  ) : undefined
                }
              />
            ) : (
          <div className="space-y-4">
            {tripView === 'cancelled' && refundDueCount > 0 ? (
              <NoticeCallout title="Refund due" tone="warn">
                {refundDueCount} trip{refundDueCount === 1 ? '' : 's'} still show Refund due. {REFUND_DUE_MANUAL_COPY}{' '}
                Open a trip below for the details.
              </NoticeCallout>
            ) : null}
          <div className="space-y-3">
            {visibleBookings.map((b) => {
              const open = openTripId === b.id;
              const lifecycle = bookingLifecycleLabel(b.status, b.payment_status);
              const payLabel = travelerPaymentLabel(b);
              const guestNotes = guestFacingBookingNotes(b.special_requests);
              const openCancel = cancelRequests[b.id];
              const isStay = Boolean(
                (b.check_out && /^\d{4}-\d{2}-\d{2}$/.test(b.check_out)) || parseStayCheckOutFromNotes(b.special_requests)
              );
              const ops = listingOps[b.listing_id];
              const liveTrip = travelerTripIsLive(b);
              const pickupMissing =
                liveTrip &&
                !isStay &&
                listingPickupCopyIncomplete(ops?.meeting_point, ops?.pickup_instructions) &&
                !b.pickup_time;
              const thumb = ops?.image ?? null;
              const placeLine = (ops?.city || ops?.destination || '').trim() || null;
              const dateLine = (() => {
                const out =
                  b.check_out && /^\d{4}-\d{2}-\d{2}$/.test(b.check_out)
                    ? b.check_out
                    : parseStayCheckOutFromNotes(b.special_requests);
                if (out && b.booking_date) {
                  return `${new Date(`${b.booking_date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} → ${new Date(`${out}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`;
                }
                return b.booking_date
                  ? new Date(`${b.booking_date}T12:00:00`).toLocaleDateString(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })
                  : 'Date TBC';
              })();
              const timeBit = b.start_time && !b.check_out ? pgTimeToHm(b.start_time) : null;
              const ref = travelerTripReferenceLabel(b.booking_number);
              const needsPay = travelerBookingNeedsPayNow(b);
              const statusTone = openCancel ? 'warn' : toneForPaymentLabel(lifecycle);
              const statusAccent =
                statusTone === 'good'
                  ? 'border-l-[3px] border-l-emerald-500'
                  : statusTone === 'warn'
                    ? 'border-l-[3px] border-l-amber-500'
                    : statusTone === 'bad'
                      ? 'border-l-[3px] border-l-rose-500'
                      : statusTone === 'info'
                        ? 'border-l-[3px] border-l-finland'
                        : 'border-l-[3px] border-l-black/10';
              return (
              <article
                key={b.id}
                className={`rounded-2xl bg-paper-raised shadow-soft ring-1 transition-[box-shadow,ring-color] overflow-hidden ${statusAccent} ${
                  open
                    ? 'ring-finland/25 shadow-soft-lg'
                    : openCancel
                      ? 'ring-amber-300/80'
                      : 'ring-black/[0.06]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    const next = open ? null : b.id;
                    setOpenTripId(next);
                    const url = new URL(window.location.href);
                    if (next) url.searchParams.set('booking', next);
                    else url.searchParams.delete('booking');
                    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
                  }}
                  className="lux-flat flex w-full items-start gap-3.5 p-3.5 sm:gap-4 sm:p-4 text-left"
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="h-20 w-20 sm:h-24 sm:w-24 rounded-xl object-cover shrink-0 bg-black/[0.04]"
                      width={96}
                      height={96}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div
                      className="flex h-20 w-20 sm:h-24 sm:w-24 shrink-0 items-center justify-center rounded-xl bg-finland/[0.06] ring-1 ring-finland/10"
                      aria-hidden
                    >
                      <CalendarDays className="h-7 w-7 text-finland/50" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                          {dateLine}
                          {timeBit ? ` · ${timeBit}` : ''}
                        </p>
                        <h3 className="mt-0.5 font-semibold text-ink line-clamp-2 leading-snug">
                          {titles[b.listing_id] ?? (isStay ? 'Stay' : 'Tour')}
                        </h3>
                      </div>
                      <ChevronDown
                        className={`mt-1 h-4 w-4 shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
                        aria-hidden
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {openCancel ? <StatusChip tone="warn">Host cancellation</StatusChip> : null}
                      <StatusChip tone={toneForPaymentLabel(lifecycle)}>{lifecycle}</StatusChip>
                      {payLabel !== lifecycle ? (
                        <StatusChip tone={toneForPaymentLabel(payLabel)}>{payLabel}</StatusChip>
                      ) : null}
                      {pickupMissing ? <StatusChip tone="warn">Pickup needed</StatusChip> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                      {placeLine ? (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                          <span className="truncate">{placeLine}</span>
                        </span>
                      ) : null}
                      <span>
                        {formatBookingParticipantsLabel(b)}
                        {b.nights ? ` · ${b.nights === 1 ? '1 night' : `${b.nights} nights`}` : ''}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-ink-muted">
                      {ref ? (
                        <span className="font-mono text-finland font-semibold tracking-wide">{ref}</span>
                      ) : null}
                      {ref &&
                      b.amount_paid != null &&
                      Number(b.amount_paid) > 0 &&
                      bookingPaymentWasCollected(b.payment_status)
                        ? ' · '
                        : ''}
                      {b.amount_paid != null &&
                      Number(b.amount_paid) > 0 &&
                      bookingPaymentWasCollected(b.payment_status)
                        ? `${formatMoney(Number(b.amount_paid), b.currency)}${isStripeTestCheckoutSession(b.checkout_session_id) ? ' TEST' : ''}`
                        : null}
                    </p>
                  </div>
                </button>
                {(needsPay && !open) || (openCancel && !open) ? (
                  <div className="flex flex-wrap gap-2 border-t border-black/[0.05] px-3.5 py-3 sm:px-4">
                    {needsPay && !open ? (
                      <button
                        type="button"
                        onClick={() => void handlePayNow(b)}
                        disabled={payingId === b.id}
                        className="tv-btn-primary"
                      >
                        {payingId === b.id ? 'Opening checkout…' : 'Pay now'}
                      </button>
                    ) : null}
                    {openCancel && !open ? (
                      <>
                        <button
                          type="button"
                          className="tv-btn-primary bg-red-700 hover:bg-red-800"
                          disabled={respondingId === openCancel.id}
                          onClick={() => void handleRespondCancellation(b, openCancel, true)}
                        >
                          {respondingId === openCancel.id ? 'Saving…' : 'Accept cancellation'}
                        </button>
                        <button
                          type="button"
                          className="tv-btn-secondary"
                          disabled={respondingId === openCancel.id}
                          onClick={() => void handleRespondCancellation(b, openCancel, false)}
                        >
                          Decline
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
                {open ? (
                <div className="space-y-3 border-t border-black/[0.05] px-3.5 py-4 sm:px-4 motion-safe:animate-fade-in">
                  {b.pickup_time ? (
                    <p className="text-sm text-ink-muted">Pickup {pgTimeToHm(b.pickup_time)}</p>
                  ) : pickupMissing ? (
                    <NoticeCallout title="Pickup details pending" tone="warn">
                      {TRAVELER_PICKUP_PENDING_UI_NOTE}
                    </NoticeCallout>
                  ) : null}
                  {openCancel ? (
                    <NoticeCallout
                      title="The host requested cancellation"
                      tone="danger"
                      action={
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="tv-btn-primary bg-red-700 hover:bg-red-800"
                            disabled={respondingId === openCancel.id}
                            onClick={() => void handleRespondCancellation(b, openCancel, true)}
                          >
                            {respondingId === openCancel.id ? 'Saving…' : 'Accept cancellation'}
                          </button>
                          <button
                            type="button"
                            className="tv-btn-secondary"
                            disabled={respondingId === openCancel.id}
                            onClick={() => void handleRespondCancellation(b, openCancel, false)}
                          >
                            Keep booking
                          </button>
                        </div>
                      }
                    >
                      <p>
                        Reason: {supplierCancellationReasonLabel(openCancel.reason_code)}
                        {openCancel.reason_text ? ` — ${openCancel.reason_text}` : ''}
                      </p>
                      <p className="mt-1">
                        {TRAVELER_ACCEPT_HOST_CANCEL_REFUND_POLICY}
                        {openCancel.expires_at
                          ? ` (request noted until ${new Date(openCancel.expires_at).toLocaleString()}).`
                          : '.'}{' '}
                        {TRAVELER_CANCELLATION_RESPONSE_DELIVERY_NOTE}
                      </p>
                    </NoticeCallout>
                  ) : null}
                  {b.status === 'cancelled' && payLabel === 'Refund due' ? (
                    <NoticeCallout title="Refund due" tone="warn">
                      {REFUND_DUE_MANUAL_COPY}
                    </NoticeCallout>
                  ) : null}
                  {b.status === 'cancelled' && guestNotes ? (
                    <p className="text-sm text-ink-muted whitespace-pre-wrap">{guestNotes}</p>
                  ) : null}
                  {liveTrip &&
                    (b.status === 'pending' || b.status === 'confirmed') &&
                    !b.check_out &&
                    !parseStayCheckOutFromNotes(b.special_requests) && (
                    <div className="max-w-lg">
                      <label htmlFor={`stay-${b.id}`} className="block text-xs font-medium text-ink-muted mb-1">
                        Place of stay
                      </label>
                      <input
                        id={`stay-${b.id}`}
                        type="text"
                        value={stayDrafts[b.id] ?? ''}
                        onChange={(e) =>
                          setStayDrafts((d) => ({
                            ...d,
                            [b.id]: e.target.value,
                          }))
                        }
                        placeholder="Hotel name or address"
                        className="tv-input"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveStay(b)}
                        disabled={staySavingId === b.id}
                        className="tv-btn-secondary mt-2"
                      >
                        {staySavingId === b.id ? 'Saving…' : 'Save place of stay'}
                      </button>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {onTourSelect && (
                      <button
                        type="button"
                        onClick={() => onTourSelect({ id: b.listing_id })}
                        className="tv-btn-ghost"
                      >
                        {b.check_out || parseStayCheckOutFromNotes(b.special_requests) ? 'View stay' : 'View tour'}
                      </button>
                    )}
                    {liveTrip && travelerBookingNeedsPayNow(b) && (
                      <button
                        type="button"
                        onClick={() => void handlePayNow(b)}
                        disabled={payingId === b.id}
                        className="tv-btn-primary"
                      >
                        {payingId === b.id ? 'Opening checkout…' : 'Pay now'}
                      </button>
                    )}
                    {liveTrip &&
                      !openCancel &&
                      (travelerBookingNeedsPayNow(b) || b.status === 'confirmed') && (
                      <button
                        type="button"
                        onClick={() => setCancelConfirm(b)}
                        disabled={cancellingId !== null}
                        className="tv-btn-ghost text-red-700"
                      >
                        {travelerSelfCancelIsUnpaidCheckout(b)
                          ? TRAVELER_CANCEL_UNPAID_CHECKOUT_CTA
                          : TRAVELER_SELF_CANCEL_CTA}
                      </button>
                    )}
                  </div>
                  {(() => {
                    const msg = {
                      status: b.status,
                      payment_status: b.payment_status,
                      openCancellation: Boolean(openCancel),
                    };
                    const block = messagingComposeBlock(msg);
                    if (block === 'unpaid') return null;
                    return (
                    <BookingMessageThread
                      bookingId={b.id}
                      canCompose={block === 'none'}
                      composeBlock={block === 'closed' ? 'closed' : 'unpaid'}
                      viewerRole="traveler"
                      listingTitle={titles[b.listing_id] ?? 'Booking'}
                      listingId={b.listing_id}
                      supplierId={ops?.supplier_id}
                      customerEmail={b.guest_email}
                      customerName={b.guest_name}
                      bookingNumber={typeof b.booking_number === 'number' ? b.booking_number : undefined}
                      bookingDate={b.booking_date}
                    />
                    );
                  })()}
                </div>
                ) : null}
              </article>
            );
            })}
          </div>
          </div>
            )}
          </div>
        )}

        {cancelConfirm && (
          <div ref={cancelSheetRef} className="tv-sheet-overlay z-50">
            <button type="button" tabIndex={-1} className="absolute inset-0" aria-label="Close" onClick={closeCancelConfirm} />
            <div className="tv-sheet-panel relative motion-safe:animate-slide-up" role="dialog" aria-modal="true" aria-labelledby="cancel-trip-title">
              <h3 id="cancel-trip-title" className="font-display text-2xl text-ink">
                {travelerSelfCancelIsUnpaidCheckout(cancelConfirm)
                  ? 'Cancel this checkout?'
                  : 'Cancel this booking?'}
              </h3>
              <p className="mt-2 text-sm text-ink-muted">
                {titles[cancelConfirm.listing_id] ?? 'Tour'} · {cancelConfirm.booking_date ? new Date(cancelConfirm.booking_date).toLocaleDateString() : 'Date TBC'}
              </p>
              <p className="mt-3 text-sm text-ink-muted">
                {travelerSelfCancelIsUnpaidCheckout(cancelConfirm)
                  ? TRAVELER_CANCEL_UNPAID_CHECKOUT_POLICY
                  : getRefundChoiceForCancel(cancelConfirm) === 'full_refund'
                  ? `You are more than 24 hours before the scheduled ${
                      cancelConfirm.check_out || parseStayCheckOutFromNotes(cancelConfirm.special_requests)
                        ? 'check-in'
                        : 'start'
                    }. ${TRAVELER_SELF_CANCEL_FULL_REFUND_POLICY}`
                  : `This ${
                      cancelConfirm.check_out || parseStayCheckOutFromNotes(cancelConfirm.special_requests)
                        ? 'check-in is'
                        : 'start is'
                    } within 24 hours. No refund applies for a traveler-initiated cancellation.`}
              </p>
              <p className="mt-2 text-xs text-ink-muted leading-relaxed">{TRAVELER_SELF_CANCEL_DELIVERY_NOTE}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={closeCancelConfirm}
                  className="tv-btn-secondary"
                >
                  {travelerSelfCancelIsUnpaidCheckout(cancelConfirm) ? 'Keep checkout' : 'Keep booking'}
                </button>
                <button
                  type="button"
                  onClick={() => handleCancelBooking(cancelConfirm)}
                  disabled={cancellingId !== null}
                  className="tv-btn-primary bg-red-700 hover:bg-red-800"
                >
                  {cancellingId === cancelConfirm.id ? 'Cancelling…' : 'Yes, cancel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
