/**
 * Consumer: list of the logged-in user's bookings with status.
 * RLS ensures only rows where guest_email = auth user email are returned.
 */
import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { LogIn, RefreshCw, CalendarDays, MapPin, ChevronDown, X, Copy, Check, Printer, Star } from 'lucide-react';
import TravelerReviewComposeDialog, {
  type TravelerReviewTarget,
} from '../components/TravelerReviewComposeDialog';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import { travelerLoginHref } from '../lib/travelerAuthLinks';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { SkeletonListItem, SkeletonConsumerPage } from '../components/ui/Skeleton';
import { useAuth } from '../contexts/AuthContext';
import { fetchConsumerProfileRow } from '../data/supabase-consumer-profile';
import { displayReviewGuestName } from '../lib/review-public-identity';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  fetchMyBookings,
  cancelBookingAsCustomer,
  executeBookingRefund,
  updateGuestBookingSpecialRequests,
  resumePendingBookingCheckout,
  type BookingRow,
} from '../data/supabase-bookings';
import StayRequestActions from '../components/StayRequestActions';
import SupplierCancelResolutionPanel from '../components/SupplierCancelResolutionPanel';
import BookingSupportCasePanel from '../components/BookingSupportCasePanel';
import { isStayRequestAwaitingHost } from '../lib/stay-request-approval';
import {
  fetchSupportCasesForBookings,
  type BookingSupportCaseRow,
} from '../data/supabase-support-cases';
import { fetchListingOpsByIds, pgTimeToHm, type ListingOpsMeta } from '../data/supabase-listings';
import { stayRangeFromBooking, nightsOccupiedByStay } from '../lib/stayOccupancy';
import {
  stayPaidAdjacentNightCount,
} from '../lib/booking-confirmation-copy';
import { formatMoney, isStripeTestCheckoutSession, appStripeIsTestMode } from '../lib/money';
import {
  travelerPaymentLabel,
  REFUND_DUE_MANUAL_COPY,
  REFUND_PROCESSING_COPY,
  REFUND_DELAYED_COPY,
  bookingPaymentWasCollected,
  isRefundDueBooking,
} from '../lib/payment-states';
import { formatBookingParticipantsLabel } from '../lib/participant-mix';
import { formatBookingDateDisplay } from '../lib/booking-flow';
import { bookingLifecycleLabel } from '../lib/status-language';
import {
  travelerSelfCancelRefundChoice,
  travelerSelfCancelDeadlineMs,
  travelerSelfCancelAvailable,
  travelerSelfCancelUnavailableMessage,
  travelerSelfCancelStartHm,
  supplierCancellationReasonLabel,
  travelerSelfCancelBlock,
  travelerSelfCancelError,
  travelerSelfCancelIsUnpaidCheckout,
} from '../lib/cancellation-policy';
import { resolveStayCancelPolicyFromSnapshot } from '../lib/stay-cancellation-preset';
import { resolveDepartureTimezone } from '../lib/tour-departure-cutoff';
import { openHostCancelRequestVisible } from '../lib/host-cancel-request-visibility';
import {
  messagingComposeBlock,
  fetchCancellationRequestsForBookings,
  notifyCancellationResolved,
  respondToCancellationRequest,
  type CancellationRequestRow,
} from '../data/supabase-booking-ops';
import BookingMessageThread from '../components/BookingMessageThread';
import StatusChip, { toneForPaymentLabel, toneForTravelerTripCard } from '../components/StatusChip';
import NoticeCallout from '../components/NoticeCallout';
import {
  bookingIsRental,
  bookingIsStayNight,
  bookingProductNoun,
  listingPickupCopyIncomplete,
  resolvePartnerPickupCopy,
} from '../lib/pickup-completeness';
import { parseRentalPurchaseSnapshot } from '../lib/rental-booking-domain';
import RentalCollectionMap from '../components/supplier/listing-creation/RentalCollectionMap';
import { formatRentalQuantityLabel, rentalReturnPoint } from '../lib/rental-presentation';
import { isRentalCategoryId } from '../types/rental';
import { travelerPickupAddressFromRecord } from '../lib/pickup-area';
import {
  displayListingTitleFromPurchase,
  displayOptionLabelFromPurchase,
  displayStartTimeFromPurchase,
  displayDepartureTimezoneFromPurchase,
  formatTravelerDepartureClock,
  displayDurationFromPurchase,
  displayCancellationPolicyFromPurchase,
  displayCheckInAddressFromPurchase,
  displayBookingContactPhoneFromPurchase,
  displayFulfillmentFromPurchase,
  displayStayCheckInTimeFromPurchase,
  displayStayCheckOutTimeFromPurchase,
  displayStayHouseRulesFromPurchase,
  displayIncludesFromPurchase,
  displayExcludesFromPurchase,
  type PurchaseSnapshot,
} from '../lib/purchase-snapshot';
import { optionLogisticsLines, readOptionLogistics } from '../lib/option-logistics';
import SavedStayPrice from '../components/booking/SavedStayPrice';
import { readStayBookingPrice } from '../lib/stay-price';
import { TRAVERION_STANDARD_CANCELLATION_POLICY } from '../types/listingExtras';
import { formatBookingContactForDisplay } from '../lib/listing-booking-contact-phone';
import { decrementAvailabilityBooked } from '../data/supabase-availability';
import { clearBookingsUnread } from '../lib/customerBookingNotifications';
import { guestFacingBookingNotes } from '../lib/booking-notes';
import { bookingMatchesTripView, travelerTripIsLive, travelerBookingNeedsPayNow, travelerTripReferenceLabel, sortTravelerCancelledTrips, tripAllowsBrowseLiveListing, tripAllowsLeaveReview } from '../lib/trip-views';
import { travelerPublicBookingReference } from '../lib/public-booking-reference';
import { bookingEligibleForReview } from '../lib/review-eligibility';
import { partnerBookingNumberMatchesFilterQuery } from '../lib/partner-bookings-search';
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
  TRAVELER_OPENING_CHECKOUT_CTA,
  TRAVELER_PAY_NOW_TEST_CTA,
  TRAVELER_HOLD_EXPIRED_PAY_NOW_NOTE,
  readStripeCheckoutReturnBanner,
} from '../lib/booking-confirmation-copy';

interface MyBookingsProps {
  onNavigate: (page: string) => void;
  onTourSelect?: (tour: { id: string; listingExtras?: { inventoryFamily?: 'tour' | 'stay' } }) => void;
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

const TRIPS_HEADING_ID = 'trips-heading';
const TRIPS_TABPANEL_ID = 'trips-tabpanel';

function tripsTabId(view: 'upcoming' | 'past' | 'cancelled'): string {
  return `trips-tab-${view}`;
}

export default function MyBookings({ onNavigate, onTourSelect }: MyBookingsProps) {
  const { user, loading: authLoading } = useAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [listingOps, setListingOps] = useState<Record<string, ListingOpsMeta>>({});
  const [cancelRequests, setCancelRequests] = useState<Record<string, CancellationRequestRow>>({});
  const [cancelRequestsError, setCancelRequestsError] = useState<string | null>(null);
  const [supportCasesByBooking, setSupportCasesByBooking] = useState<
    Record<string, BookingSupportCaseRow[]>
  >({});
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
  const [tripSearchQuery, setTripSearchQuery] = useState('');
  const [openTripId, setOpenTripId] = useState<string | null>(null);
  const [tripDetailTab, setTripDetailTab] = useState<'overview' | 'details' | 'messages'>('overview');
  const [focusMessageId, setFocusMessageId] = useState<string | null>(null);
  const [reviewedListingIds, setReviewedListingIds] = useState<Set<string>>(new Set());
  const [myReviewsByListing, setMyReviewsByListing] = useState<
    Record<
      string,
      { rating: number; comment: string; guest_name: string; is_anonymous: boolean }
    >
  >({});
  const [reviewTarget, setReviewTarget] = useState<TravelerReviewTarget | null>(null);
  const [reviewProfileDisplayName, setReviewProfileDisplayName] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<{ title: string; body: string } | null>(null);
  // Phase 1677: copy feedback for expanded trip reference.
  const [copiedTripRefId, setCopiedTripRefId] = useState<string | null>(null);
  const loadGenRef = useRef(0);
  const tripsUserIdRef = useRef<string | null>(null);

  const getSelfCancelStartHm = useCallback((b: BookingRow): string => {
    const isStay = bookingIsStayNight(b);
    const snap = b.purchase_snapshot;
    const rentalSnap = parseRentalPurchaseSnapshot(snap);
    if (rentalSnap?.pickupAt) {
      const d = new Date(rentalSnap.pickupAt);
      if (!Number.isNaN(d.getTime())) {
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
    }
    // Official start only (never pickup). Blank snap clock → live start_time for SQL parity.
    const purchasedStart = displayStartTimeFromPurchase(snap, null);
    const liveStart = b.start_time ? pgTimeToHm(b.start_time) ?? null : null;
    const cancelRef =
      snap && typeof snap === 'object' && 'cancelReferenceStartHm' in snap
        ? String((snap as PurchaseSnapshot).cancelReferenceStartHm ?? '').trim()
        : '';
    return travelerSelfCancelStartHm({
      isStay,
      checkInHm: displayStayCheckInTimeFromPurchase(snap, null),
      startTimeHm: purchasedStart || liveStart,
      cancelReferenceStartHm: cancelRef || null,
    });
  }, []);

  const getRefundChoiceForCancel = useCallback((b: BookingRow): 'full_refund' | 'no_refund' => {
    const snapTz = displayDepartureTimezoneFromPurchase(b.purchase_snapshot);
    const policy = resolveStayCancelPolicyFromSnapshot(b.purchase_snapshot);
    return travelerSelfCancelRefundChoice({
      bookingDate: b.booking_date,
      startTimeHm: getSelfCancelStartHm(b),
      departureTimezone: snapTz,
      paymentStatus: b.payment_status,
      freeCancelHours: policy.freeCancelHours,
    });
  }, [getSelfCancelStartHm]);

  const getSelfCancelAvailable = useCallback((b: BookingRow): boolean => {
    const snapTz = displayDepartureTimezoneFromPurchase(b.purchase_snapshot);
    const policy = resolveStayCancelPolicyFromSnapshot(b.purchase_snapshot);
    return travelerSelfCancelAvailable({
      bookingDate: b.booking_date,
      startTimeHm: getSelfCancelStartHm(b),
      departureTimezone: snapTz,
      paymentStatus: b.payment_status,
      freeCancelHours: policy.freeCancelHours,
    });
  }, [getSelfCancelStartHm]);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured() || !user?.id) {
      setLoading(false);
      setBookings([]);
      return;
    }
    const gen = ++loadGenRef.current;
    setLoading(true);
    setLoadError(null);
    setCancelRequestsError(null);
    try {
      const list = await fetchMyBookings();
      if (gen !== loadGenRef.current) return;
      setBookings(list);
      const ids = [...new Set(list.map((b) => b.listing_id))];
      try {
        const ops = await fetchListingOpsByIds(ids);
        if (gen !== loadGenRef.current) return;
        setListingOps(ops);
        setTitles(Object.fromEntries(Object.entries(ops).map(([id, v]) => [id, v.title])));
      } catch {
        if (gen !== loadGenRef.current) return;
        // Keep prior ops/titles — purchased snap titles still render on Trips cards.
      }
      try {
        const reqs = await fetchCancellationRequestsForBookings(list.map((b) => b.id));
        if (gen !== loadGenRef.current) return;
        const open: Record<string, CancellationRequestRow> = {};
        for (const r of reqs) {
          if (r.status === 'requested' && !open[r.booking_id]) open[r.booking_id] = r;
        }
        setCancelRequests(open);
        setCancelRequestsError(null);
      } catch (cancelErr) {
        if (gen !== loadGenRef.current) return;
        // Keep prior open-cancel map — infrastructure failure must not hide Accept/Decline.
        setCancelRequestsError(userFacingError(cancelErr, USER_ERROR.trips));
      }
      try {
        const cases = await fetchSupportCasesForBookings(list.map((b) => b.id));
        if (gen !== loadGenRef.current) return;
        setSupportCasesByBooking(cases);
      } catch {
        if (gen !== loadGenRef.current) return;
        // Keep prior cases — support UI is additive.
      }
      if (supabase && user?.id) {
        const { data: reviewed, error: reviewErr } = await supabase
          .from('reviews')
          .select('listing_id, rating, comment, guest_name, is_anonymous')
          .eq('user_id', user.id);
        if (gen === loadGenRef.current && !reviewErr) {
          const byListing: Record<
            string,
            { rating: number; comment: string; guest_name: string; is_anonymous: boolean }
          > = {};
          for (const row of reviewed ?? []) {
            const lid = String((row as { listing_id?: string }).listing_id ?? '').trim();
            if (!lid) continue;
            byListing[lid] = {
              rating: Number((row as { rating?: number }).rating) || 0,
              comment: String((row as { comment?: string | null }).comment ?? '').trim(),
              guest_name: String((row as { guest_name?: string | null }).guest_name ?? '').trim(),
              is_anonymous: Boolean((row as { is_anonymous?: boolean | null }).is_anonymous),
            };
          }
          setMyReviewsByListing(byListing);
          setReviewedListingIds(new Set(Object.keys(byListing)));
        }
      }
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      // Keep prior trips visible — infrastructure failure must not look like an empty account.
      setLoadError(userFacingError(e, USER_ERROR.trips));
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setReviewProfileDisplayName(null);
      return;
    }
    let cancelled = false;
    void fetchConsumerProfileRow(user.id)
      .then((row) => {
        if (!cancelled) setReviewProfileDisplayName((row?.display_name ?? '').trim() || null);
      })
      .catch(() => {
        if (!cancelled) setReviewProfileDisplayName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    setStayDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const b of bookings) {
        // Keep in-progress edits; seed only new booking ids from saved notes.
        if (Object.prototype.hasOwnProperty.call(prev, b.id)) {
          next[b.id] = prev[b.id]!;
        } else {
          next[b.id] = extractPlaceOfStay(b.special_requests);
        }
      }
      return next;
    });
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
      setActionSuccess(null);
      const res = await updateGuestBookingSpecialRequests(b.id, nextNotes);
      setStaySavingId(null);
      // Phase 1859 / 1794: success:true may still carry a soft secondary warning (thread/email).
      if (res.success) {
        await load();
        if (res.error) {
          setActionSuccess({ title: 'Place of stay saved', body: res.error });
        }
      } else {
        setActionError(userFacingError(res.error, 'Could not save place of stay.'));
      }
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
      // Phase 1726: toast follows server refund_choice (SQL may coerce near cutoff).
      const serverChoice = res.refundChoice ?? refundChoice;
      const serverUnpaid = res.unpaidCheckout ?? unpaid;
      let baseBody = serverUnpaid
        ? TRAVELER_CANCEL_UNPAID_CHECKOUT_SUCCESS
        : serverChoice === 'full_refund'
          ? TRAVELER_SELF_CANCEL_SUCCESS_REFUND_DUE
          : TRAVELER_SELF_CANCEL_SUCCESS_NO_REFUND;
      if (!serverUnpaid && serverChoice === 'full_refund' && res.refundExecution?.success) {
        baseBody =
          'Booking cancelled. Your refund was submitted to Stripe. My bookings will show Refunded when Stripe confirms it — bank timing varies.';
      } else if (
        !serverUnpaid &&
        serverChoice === 'full_refund' &&
        res.refundExecution &&
        !res.refundExecution.success
      ) {
        baseBody = `${TRAVELER_SELF_CANCEL_SUCCESS_REFUND_DUE} ${REFUND_DELAYED_COPY}`;
      }
      // Phase 1859: cancel is authoritative; append soft notify warning when present.
      setActionSuccess({
        title: serverUnpaid ? 'Checkout cancelled' : 'Booking cancelled',
        body: res.notifyWarning ? `${baseBody}\n\n${res.notifyWarning}` : baseBody,
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
      const res = await respondToCancellationRequest(req.id, accept, { bookingId: b.id });
      setRespondingId(null);
      if (!res.ok) {
        setActionError(userFacingError(res.error, 'Could not update this cancellation request.'));
        return;
      }
      const ops = listingOps[b.listing_id];
      // Phase 1707: fire resolves even when unpublished listing hid supplier_id from RLS.
      // Phase 1797: always notify — blank guest_email / missing ops still resolve via 1788/1729.
      // Phase 1859: await soft notify — response already committed.
      const notify = await notifyCancellationResolved({
        accepted: accept,
        customerEmail: b.guest_email,
        customerName: b.guest_name,
        listingTitle: displayListingTitleFromPurchase(
          b.purchase_snapshot,
          ops?.title || titles[b.listing_id],
          'Booking'
        ),
        bookingId: b.id,
        bookingNumber: typeof b.booking_number === 'number' ? b.booking_number : undefined,
        bookingDate: b.booking_date,
        supplierId: ops?.supplier_id ?? null,
        listingId: b.listing_id,
        guests: b.guests,
        // Phase 1721: unique key per cancellation_requests row (re-request after decline).
        requestId: req.id,
      });
      const soft = !notify.sent && !notify.skipped ? notify.error : null;
      if (accept) {
        setActionSuccess({
          title: 'Cancellation accepted',
          body: soft ? `${TRAVELER_ACCEPT_CANCEL_SUCCESS}\n\n${soft}` : TRAVELER_ACCEPT_CANCEL_SUCCESS,
        });
        setTripView('cancelled');
      } else {
        setActionSuccess({
          title: 'Cancellation declined',
          body: soft ? `${TRAVELER_DECLINE_CANCEL_SUCCESS}\n\n${soft}` : TRAVELER_DECLINE_CANCEL_SUCCESS,
        });
      }
      await load();
    },
    [listingOps, titles, load]
  );

  const handlePayNow = useCallback(async (b: BookingRow) => {
    setActionError(null);
    setPayingId(b.id);
    // Phase 1773: pass a lead name when the unpaid hold never captured guest_name.
    const fromMeta =
      typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '';
    const fromEmail = (user?.email ?? '').split('@')[0]?.trim() ?? '';
    const customerName = (b.guest_name ?? '').trim() || fromMeta || fromEmail || undefined;
    const res = await resumePendingBookingCheckout({ bookingId: b.id, customerName });
    setPayingId(null);
    if (!res.success || !res.checkoutUrl) {
      setActionError(userFacingError(res.error, USER_ERROR.checkout));
      return;
    }
    window.location.assign(res.checkoutUrl);
  }, [user]);

  // Phase 1379 + layout: clear prior traveler trips before paint on account switch (useEffect ran one frame too late).
  useLayoutEffect(() => {
    if (!user?.id) {
      tripsUserIdRef.current = null;
      loadGenRef.current += 1;
      setBookings([]);
      setListingOps({});
      setTitles({});
      setCancelRequests({});
      setCancelRequestsError(null);
      setLoadError(null);
      return;
    }
    if (tripsUserIdRef.current !== user.id) {
      tripsUserIdRef.current = user.id;
      loadGenRef.current += 1;
      setBookings([]);
      setListingOps({});
      setTitles({});
      setCancelRequests({});
      setCancelRequestsError(null);
      setLoadError(null);
      setOpenTripId(null);
      setActionError(null);
      setActionSuccess(null);
      setCancelConfirm(null);
      setTripSearchQuery('');
    }
  }, [user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setLoading(false);
      return;
    }
    void load();
  }, [user?.id, load, authLoading]);

  useEffect(() => {
    if (user?.id) clearBookingsUnread(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const read = () => {
      const id = new URLSearchParams(window.location.search).get('booking')?.trim() || null;
      setOpenTripId(id);
      if (id) setTripDetailTab('overview');
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);

  useEffect(() => {
    if (!openTripId || bookings.length === 0) return;
    const b = bookings.find((row) => row.id === openTripId);
    if (!b) return;
    if (bookingMatchesTripView(b, 'cancelled')) setTripView('cancelled');
    else if (bookingMatchesTripView(b, 'past')) setTripView('past');
    else setTripView('upcoming');
  }, [openTripId, bookings]);

  useEffect(() => {
    if (loading || !openTripId) return;
    if (bookings.some((b) => b.id === openTripId)) return;
    // Phase 1369/1379: foreign or stale ?booking= must not stick after account switch or a failed load.
    setOpenTripId(null);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.get('booking')) return;
    url.searchParams.delete('booking');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [bookings, loading, openTripId]);

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
    if (paymentBanner !== 'cancelled') return;
    onNavigate('cart');
  }, [paymentBanner, onNavigate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!readStripeCheckoutReturnBanner(url.search)) return;
    url.searchParams.delete('payment');
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, '', next);
  }, []);

  const selectTripView = useCallback(
    (view: 'upcoming' | 'past' | 'cancelled') => {
      setTripView(view);
      setTripDetailTab((tab) => (view !== 'upcoming' && tab === 'details' ? 'overview' : tab));
      setOpenTripId((current) => {
        if (!current) return null;
        const row = bookings.find((b) => b.id === current);
        if (row && bookingMatchesTripView(row, view)) return current;
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.delete('booking');
          window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        }
        return null;
      });
    },
    [bookings]
  );

  const refundDueCount = useMemo(() => bookings.filter(isRefundDueBooking).length, [bookings]);
  const tripViewBookings = useMemo(() => {
    const rows = bookings.filter((b) => bookingMatchesTripView(b, tripView));
    if (tripView === 'cancelled') return sortTravelerCancelledTrips(rows);
    const dir = tripView === 'past' ? -1 : 1;
    return [...rows].sort((a, b) => dir * (a.booking_date ?? '').localeCompare(b.booking_date ?? ''));
  }, [bookings, tripView]);

  const visibleBookings = useMemo(() => {
    const q = tripSearchQuery.trim();
    if (!q) return tripViewBookings;
    const qLower = q.toLowerCase();
    return tripViewBookings.filter((b) => {
      const ops = listingOps[b.listing_id];
      const title = displayListingTitleFromPurchase(
        b.purchase_snapshot,
        titles[b.listing_id] || ops?.title,
        bookingProductNoun(b)
      ).toLowerCase();
      // Phase 1486: desk parity — match Ref # on collapsed cards (Partner Bookings 1484 / admin 1053).
      const publicRef = (travelerPublicBookingReference(b.public_reference) ?? '').toLowerCase();
      const destination = `${ops?.city ?? ''} ${ops?.destination ?? ''}`.toLowerCase();
      return (
        partnerBookingNumberMatchesFilterQuery(q, b.booking_number) ||
        title.includes(qLower) ||
        (publicRef.length > 0 && publicRef.includes(qLower)) ||
        destination.includes(qLower)
      );
    });
  }, [tripViewBookings, tripSearchQuery, listingOps, titles]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-paper tv-page">
        <div className="tv-shell px-4 sm:px-6 lg:px-8 py-8 pb-12">
          <header className="mb-6 border-b border-black/[0.06] pb-5">
            <p className="tv-eyebrow">Your travel</p>
            <h1 id={TRIPS_HEADING_ID} className="tv-page-title">
              My bookings
            </h1>
            <p className="mt-2 text-sm text-ink-muted">Upcoming and past tours, stays, and rentals you booked.</p>
          </header>
          <section aria-labelledby={TRIPS_HEADING_ID}>
          <div className="max-w-md tv-card p-5">
            <h2 className="tv-section-heading">Bookings unavailable</h2>
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
                onClick={() => onNavigate('stays')}
                className="tv-btn-ghost"
              >
                Browse stays
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
          </section>
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
        <div className="tv-shell px-4 sm:px-6 lg:px-8 py-8 pb-12">
          <header className="mb-6 border-b border-black/[0.06] pb-5">
            <p className="tv-eyebrow">Your travel</p>
            <h1 id={TRIPS_HEADING_ID} className="tv-page-title">
              My bookings
            </h1>
            <p className="mt-2 text-sm text-ink-muted leading-relaxed max-w-xl">
              Manage upcoming, past, and cancelled tours, stays, and rentals after you sign in.
            </p>
          </header>
          <section aria-labelledby={TRIPS_HEADING_ID}>
          <EmptyState
            icon={LogIn}
            className="pt-2 pb-0"
            title="Log in to see your bookings"
            body="Bookings are tied to your traveler account. You have not signed in, so there is nothing to show."
            action={
              <div className="flex flex-wrap gap-2">
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
                {/* Phase 1612: Wishlist parity — browse while logged out. */}
                <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-ghost">
                  Browse tours
                </button>
                <button type="button" onClick={() => onNavigate('stays')} className="tv-btn-ghost">
                  Browse stays
                </button>
              </div>
            }
          />
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper tv-page">
      <div className="tv-shell px-4 sm:px-6 lg:px-8 py-6 pb-10 sm:py-7">
        <header className="tv-trips-header mx-auto mb-4 max-w-[1080px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 id={TRIPS_HEADING_ID} className="tv-page-title !text-[1.5rem] sm:!text-[1.625rem]">
                My bookings
              </h1>
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="lux-flat inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-ink-muted hover:bg-black/[0.04] hover:text-ink disabled:opacity-50"
              aria-label="Refresh bookings"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
              Refresh
            </button>
          </div>
        </header>

        <section className="mx-auto max-w-[1080px]" aria-labelledby={TRIPS_HEADING_ID}>
        {loadError && (
          <ErrorState
            className="py-6"
            title="My bookings unavailable"
            body={userFacingError(loadError, USER_ERROR.trips)}
            retry={{ onClick: () => void load() }}
            extra={
              <button type="button" onClick={() => onNavigate('contact')} className="tv-btn-ghost">
                Contact support
              </button>
            }
          />
        )}
        {!loadError && cancelRequestsError ? (
          <div className="mb-5 max-w-lg">
            <NoticeCallout title="Cancellation status unavailable" tone="warn">
              <p>{cancelRequestsError}</p>
              <button type="button" onClick={() => void load()} className="tv-btn-ghost mt-3 -ml-2">
                Retry
              </button>
            </NoticeCallout>
          </div>
        ) : null}
        {actionError ? (
          <div className="mb-5 max-w-lg">
            <NoticeCallout title="Could not complete that action" tone="danger">
              <p>{actionError}</p>
              <button type="button" onClick={() => setActionError(null)} className="tv-btn-ghost mt-3 -ml-2">
                Dismiss
              </button>
            </NoticeCallout>
          </div>
        ) : null}
        {actionSuccess ? (
          <div className="mb-5 max-w-lg">
            <NoticeCallout title={actionSuccess.title} tone="warn">
              <p>{actionSuccess.body}</p>
              <button type="button" onClick={() => setActionSuccess(null)} className="tv-btn-ghost mt-3 -ml-2">
                Dismiss
              </button>
            </NoticeCallout>
          </div>
        ) : null}
        {paymentBanner === 'success' && (
          <div className="mb-5 max-w-lg">
            <h2 className="tv-section-heading">Payment received</h2>
            <p className="mt-2 text-sm text-ink-muted">
              {loading
                ? 'Updating your bookings…'
                : pendingPayBookings.length > 0
                  ? 'Stripe reported success. If a booking still shows Pay now, wait a moment and refresh — confirmation can lag the redirect.'
                  : `Your booking is confirmed. Open this page anytime for details. ${BOOKING_CONFIRMED_UI_FOLLOWUP_NOTE} ${BOOKING_CONFIRMATION_EMAIL_DISCLAIMER}`}
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
          <div className="mb-5 max-w-lg">
            <h2 className="tv-section-heading">Payment not completed</h2>
            <p className="mt-2 text-sm text-ink-muted">
              {pendingPayBookings.some((b) => bookingIsStayNight(b))
                ? STRIPE_CHECKOUT_CANCELLED_STAY_COPY
                : STRIPE_CHECKOUT_CANCELLED_TOUR_COPY}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {pendingPayBookings[0] ? (
                <button type="button" onClick={() => onNavigate('cart')} className="tv-btn-primary">
                  View cart
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-primary">
                    Browse tours
                  </button>
                  <button type="button" onClick={() => onNavigate('stays')} className="tv-btn-ghost">
                    Browse stays
                  </button>
                </>
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
        ) : loadError && bookings.length === 0 ? null : bookings.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No trips yet"
            body="You have not booked a tour or stay, so this list is empty. When you complete a booking, it appears here."
            action={
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-primary">
                  Browse tours
                </button>
                <button type="button" onClick={() => onNavigate('stays')} className="tv-btn-ghost">
                  Browse stays
                </button>
              </div>
            }
          />
        ) : (
          <div className="space-y-3">
            <div className="tv-trips-toolbar">
              <div
                className="tv-trips-toolbar__tabs"
                role="tablist"
                aria-label="Trip status"
              >
                {([
                  ['upcoming', 'Upcoming'],
                  ['past', 'Past'],
                  ['cancelled', 'Cancelled'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    id={tripsTabId(id)}
                    aria-controls={TRIPS_TABPANEL_ID}
                    aria-selected={tripView === id}
                    onClick={() => selectTripView(id)}
                    className={`tv-trips-toolbar__tab lux-flat${
                      tripView === id ? ' is-active' : ''
                    }${tripView === id && id === 'cancelled' ? ' is-cancelled' : ''}${
                      tripView === id && id === 'past' ? ' is-past' : ''
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="tv-trips-toolbar__search">
                <span className="sr-only">Search bookings</span>
                <input
                  id="trips-search"
                  type="search"
                  value={tripSearchQuery}
                  onChange={(e) => setTripSearchQuery(e.target.value)}
                  placeholder="Search bookings"
                  className="tv-input tv-trips-toolbar__search-input"
                />
              </label>
            </div>
            <div
              id={TRIPS_TABPANEL_ID}
              role="tabpanel"
              aria-labelledby={tripsTabId(tripView)}
            >
            {visibleBookings.length === 0 ? (
              tripSearchQuery.trim() && tripViewBookings.length > 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  className="py-8"
                  title="No trips match your search"
                  body="Try the booking reference from your confirmation (for example TV- or #42) or a word from the trip name or destination."
                  action={
                    <button type="button" onClick={() => setTripSearchQuery('')} className="tv-btn-secondary">
                      Clear search
                    </button>
                  }
                />
              ) : (
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
                    ? 'Nothing is scheduled yet. Book a tour or stay to see it here.'
                    : tripView === 'past'
                      ? 'You have no completed trips in this list yet. That is normal until a booked date has passed.'
                      : 'You have no cancelled or refunded bookings. Bookings that still show Refund due appear here until Stripe records a refund.'
                }
                action={
                  tripView === 'upcoming' ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-primary">
                        Browse tours
                      </button>
                      <button type="button" onClick={() => onNavigate('stays')} className="tv-btn-ghost">
                        Browse stays
                      </button>
                    </div>
                  ) : bookings.length > 0 ? (
                    // Phase 1610: Past/Cancelled empty but other trips exist — jump to Upcoming.
                    <button type="button" onClick={() => selectTripView('upcoming')} className="tv-btn-secondary">
                      View upcoming trips
                    </button>
                  ) : undefined
                }
              />
              )
            ) : (
          <div className="space-y-4">
            {tripView === 'cancelled' && refundDueCount > 0 ? (
              <NoticeCallout title="Refunds in progress" tone="warn">
                {refundDueCount} trip{refundDueCount === 1 ? '' : 's'} still need a completed Stripe refund.
                Open a trip for status details.
              </NoticeCallout>
            ) : null}
          <div className="space-y-3">
            {visibleBookings.map((b) => {
              const open = openTripId === b.id;
              const lifecycle = bookingLifecycleLabel(
                b.status,
                b.payment_status,
                {
                  hold_expires_at: b.hold_expires_at,
                  created_at: b.created_at,
                },
                {
                  approval_status: b.approval_status,
                  approval_expires_at: b.approval_expires_at,
                }
              );
              const payLabel = travelerPaymentLabel(b);
              const guestNotes = guestFacingBookingNotes(b.special_requests);
              const openCancelRaw = cancelRequests[b.id];
              const openCancel =
                openCancelRaw &&
                openHostCancelRequestVisible({
                  bookingStatus: b.status,
                  requestStatus: openCancelRaw.status,
                })
                  ? openCancelRaw
                  : undefined;
              const isStay = bookingIsStayNight(b);
              const isRental = bookingIsRental(b);
              const rentalSnap = isRental ? parseRentalPurchaseSnapshot(b.purchase_snapshot) : null;
              const ops = listingOps[b.listing_id];
              const rentalQtyLabel = (() => {
                if (!rentalSnap) return null;
                const rawCat = (b.purchase_snapshot as { rentalCategory?: unknown } | null)?.rentalCategory;
                const cat =
                  typeof rawCat === 'string' && isRentalCategoryId(rawCat) ? rawCat : null;
                const extras =
                  ops?.listing_extras && typeof ops.listing_extras === 'object'
                    ? (ops.listing_extras as { rental?: { category?: unknown } })
                    : null;
                const extrasCat = extras?.rental?.category;
                const fromExtras =
                  typeof extrasCat === 'string' && isRentalCategoryId(extrasCat) ? extrasCat : null;
                return formatRentalQuantityLabel(rentalSnap.quantity, cat ?? fromExtras);
              })();
              const rentalReturn = rentalSnap ? rentalReturnPoint(rentalSnap) : null;
              const tripTitle = displayListingTitleFromPurchase(
                b.purchase_snapshot,
                titles[b.listing_id] || ops?.title,
                bookingProductNoun(b)
              );
              const tripOption = displayOptionLabelFromPurchase(b.purchase_snapshot, null);
              // Phase 1716: host Pickup Planner saves override notes — same precedence as partner UI.
              const tripPickup = resolvePartnerPickupCopy({
                purchaseSnapshot: b.purchase_snapshot,
                bookingOptionId: b.booking_option_id,
                specialRequests: b.special_requests,
                listingMeetingPoint: ops?.meeting_point,
                listingPickupInstructions: ops?.pickup_instructions,
              });
              const tripMeeting = tripPickup.meetingPoint;
              const tripPickupInstructions = tripPickup.pickupInstructions;
              const tripDuration = displayDurationFromPurchase(b.purchase_snapshot, null);
              const tripFulfillment = displayFulfillmentFromPurchase(b.purchase_snapshot);
              const chosenPickup =
                tripFulfillment === 'pickup'
                  ? travelerPickupAddressFromRecord({
                      snapshot: b.purchase_snapshot,
                      specialRequests: b.special_requests,
                    })
                  : '';
              const tripPlaceHeading =
                tripFulfillment === 'pickup' ? (chosenPickup ? 'Pickup location' : 'Pickup area') : 'Meeting point';
              const tripPlaceValue = chosenPickup || tripMeeting;
              const tripLogistics = optionLogisticsLines({
                ...readOptionLogistics(b.purchase_snapshot),
                fulfillment: tripFulfillment,
              });
              const tripHidesExactPickup = readOptionLogistics(b.purchase_snapshot)?.pickupTiming === 'before_start';
              const tripCancelPolicy = displayCancellationPolicyFromPurchase(
                b.purchase_snapshot,
                TRAVERION_STANDARD_CANCELLATION_POLICY
              );
              const liveTrip = travelerTripIsLive(b);
              const pickupMissing =
                liveTrip &&
                !isStay &&
                !isRental &&
                listingPickupCopyIncomplete(tripMeeting || null, tripPickupInstructions || null) &&
                !b.pickup_time;
              const thumb = ops?.image ?? null;
              const placeLine = (() => {
                if (rentalSnap?.pickupAddress?.trim()) return rentalSnap.pickupAddress.trim();
                const snapAddr = displayCheckInAddressFromPurchase(
                  b.purchase_snapshot,
                  b.payment_status
                );
                if (snapAddr) return snapAddr;
                return (ops?.city || ops?.destination || '').trim() || null;
              })();
              const placeLabel = rentalSnap?.pickupAddress?.trim()
                ? 'Pickup'
                : displayCheckInAddressFromPurchase(
                      b.purchase_snapshot,
                      b.payment_status
                    )
                  ? 'Check-in address'
                  : 'Place';
              const dateLine = (() => {
                if (rentalSnap?.pickupAt && rentalSnap.returnAt) {
                  const pick = new Date(rentalSnap.pickupAt);
                  const ret = new Date(rentalSnap.returnAt);
                  if (!Number.isNaN(pick.getTime()) && !Number.isNaN(ret.getTime())) {
                    const fmt = (d: Date) =>
                      d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
                    const option = rentalSnap.variantName?.trim();
                    // Quantity lives in the meta row — keep the when-line to option + window only.
                    return [option, `${fmt(pick)} → ${fmt(ret)}`].filter(Boolean).join(' · ');
                  }
                }
                if (isStay) {
                  const stay = stayRangeFromBooking(b);
                  if (stay) {
                    return `${formatBookingDateDisplay(stay.checkIn)} → ${formatBookingDateDisplay(stay.checkOut)}`;
                  }
                }
                return b.booking_date ? formatBookingDateDisplay(b.booking_date) : 'Date TBC';
              })();
              // Phase 1551/1581/1588: nights from stayRange; paid+nightly via stayPaidAdjacentNightCount.
              const stayNightsSuffix = (() => {
                if (!isStay) return '';
                const stay = stayRangeFromBooking(b);
                if (!stay) return '';
                const stayNights = nightsOccupiedByStay(stay.checkIn, stay.checkOut).length;
                const n = stayPaidAdjacentNightCount({
                  amountPaid: b.amount_paid,
                  nightlyAmount: b.nightly_amount,
                  cleaningFee: b.cleaning_fee,
                  paymentCollected: bookingPaymentWasCollected(b.payment_status),
                  columnNights: b.nights,
                  snapshotNights: (b.purchase_snapshot as PurchaseSnapshot | null | undefined)?.nights,
                  occupancyNights: stayNights,
                });
                return n != null && n > 0 ? ` · ${n === 1 ? '1 night' : `${n} nights`}` : '';
              })();
              const timeBit = (() => {
                if (isStay || rentalSnap?.pickupAt) return null;
                const live = b.start_time ? pgTimeToHm(b.start_time) : null;
                const shown = displayStartTimeFromPurchase(b.purchase_snapshot, live);
                if (!shown) return null;
                return formatTravelerDepartureClock(
                  shown,
                  displayDepartureTimezoneFromPurchase(b.purchase_snapshot)
                );
              })();
              const ref =
                travelerPublicBookingReference(b.public_reference) ??
                travelerTripReferenceLabel(b.booking_number);
              const needsPay = travelerBookingNeedsPayNow(b);
              const statusTone = toneForTravelerTripCard(lifecycle, payLabel, {
                hostCancellation: Boolean(openCancel),
              });
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
                data-open={open ? 'true' : 'false'}
                className={`tv-trip-card ${statusAccent} ${
                  openCancel && !open ? 'ring-1 ring-amber-300/80' : ''
                }`}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`trip-panel-${b.id}`}
                  onClick={() => {
                    const next = open ? null : b.id;
                    setOpenTripId(next);
                    if (next) setTripDetailTab('overview');
                    const url = new URL(window.location.href);
                    if (next) url.searchParams.set('booking', next);
                    else url.searchParams.delete('booking');
                    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
                    // Phase 1629: keep expanded trip details on-screen on mobile (Inbox parity).
                    if (next) {
                      window.requestAnimationFrame(() => {
                        document
                          .getElementById(`trip-panel-${next}`)
                          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                      });
                    }
                  }}
                  className="tv-trip-card__hit lux-flat"
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="tv-trip-card__thumb"
                      width={84}
                      height={84}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="tv-trip-card__thumb tv-trip-card__thumb--empty" aria-hidden>
                      <CalendarDays className="h-5 w-5 text-finland/45" />
                    </div>
                  )}
                  <div className="tv-trip-card__body min-w-0 flex-1">
                    <div className="tv-trip-card__top">
                      <div className="min-w-0">
                        <h3 className="tv-trip-card__title" title={tripTitle}>
                          {tripTitle}
                        </h3>
                        <p className="tv-trip-card__when">
                          {dateLine}
                          {timeBit ? ` · ${timeBit}` : ''}
                          {tripOption ? ` · ${tripOption}` : ''}
                        </p>
                      </div>
                      <div className="tv-trip-card__aside">
                        {b.amount_paid != null &&
                        Number(b.amount_paid) > 0 &&
                        bookingPaymentWasCollected(b.payment_status) ? (
                          <p className="tv-trip-card__price">
                            {formatMoney(Number(b.amount_paid), b.currency)}
                            {isStripeTestCheckoutSession(b.checkout_session_id) || appStripeIsTestMode() ? (
                              <span className="tv-trip-card__test">Test</span>
                            ) : null}
                          </p>
                        ) : null}
                        <span className="tv-trip-card__view" aria-hidden>
                          {open ? 'Close' : 'View booking'}
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform duration-180 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
                            aria-hidden
                          />
                        </span>
                      </div>
                    </div>
                    <div className="tv-trip-card__meta">
                      <span className="tv-trip-card__chips">
                        {openCancel ? <StatusChip tone="warn">Host cancellation</StatusChip> : null}
                        <StatusChip tone={toneForPaymentLabel(lifecycle)}>{lifecycle}</StatusChip>
                        {payLabel !== lifecycle ? (
                          <StatusChip tone={toneForPaymentLabel(payLabel)}>{payLabel}</StatusChip>
                        ) : null}
                        {tripView === 'upcoming' && pickupMissing ? (
                          <StatusChip tone="warn">Pickup needed</StatusChip>
                        ) : null}
                      </span>
                      <span className="tv-trip-card__facts-inline">
                        {placeLine ? (
                          <span className="inline-flex min-w-0 max-w-[14rem] items-center gap-1 truncate sm:max-w-[18rem]">
                            <MapPin className="h-3 w-3 shrink-0 text-ink-faint" aria-hidden />
                            <span className="truncate">{placeLine}</span>
                          </span>
                        ) : null}
                        <span className="shrink-0">
                          {isRental ? rentalQtyLabel : formatBookingParticipantsLabel(b)}
                          {stayNightsSuffix}
                        </span>
                        {ref ? (
                          <span className="tv-trip-card__ref shrink-0 font-mono">{ref}</span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                </button>
                {!open &&
                tripView === 'past' &&
                tripAllowsLeaveReview(ops) &&
                bookingEligibleForReview(b) ? (
                  <div className="tv-trip-card__actions">
                    <button
                      type="button"
                      onClick={() =>
                        setReviewTarget({
                          bookingId: b.id,
                          listingId: b.listing_id,
                          listingTitle: tripTitle,
                          imageUrl: thumb,
                          mode: reviewedListingIds.has(b.listing_id) ? 'edit' : 'write',
                        })
                      }
                      className="tv-trip-card__action-link lux-flat"
                    >
                      <Star className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {reviewedListingIds.has(b.listing_id) ? 'Edit review' : 'Write review'}
                    </button>
                    <span className="tv-trip-card__action-sep" aria-hidden>
                      ·
                    </span>
                    <button
                      type="button"
                      className="tv-trip-card__action-link lux-flat"
                      onClick={() => {
                        setOpenTripId(b.id);
                        setTripDetailTab('overview');
                        const url = new URL(window.location.href);
                        url.searchParams.set('booking', b.id);
                        window.history.replaceState({}, '', `${url.pathname}${url.search}`);
                      }}
                    >
                      View booking
                    </button>
                  </div>
                ) : null}
                {!open && tripView === 'cancelled' ? (
                  <div className="tv-trip-card__actions">
                    <button
                      type="button"
                      className="tv-trip-card__action-link lux-flat"
                      onClick={() => {
                        setOpenTripId(b.id);
                        setTripDetailTab('overview');
                        const url = new URL(window.location.href);
                        url.searchParams.set('booking', b.id);
                        window.history.replaceState({}, '', `${url.pathname}${url.search}`);
                      }}
                    >
                      View cancellation details
                    </button>
                  </div>
                ) : null}
                {(needsPay && !open) || (openCancel && !open) ? (
                  <div className="flex flex-wrap gap-2 border-t border-black/[0.05] px-3.5 py-3 sm:px-4">
                    {needsPay && !open ? (
                      <button
                        type="button"
                        onClick={() => void handlePayNow(b)}
                        disabled={payingId === b.id}
                        className="tv-btn-primary"
                      >
                        {payingId === b.id ? TRAVELER_OPENING_CHECKOUT_CTA : TRAVELER_PAY_NOW_TEST_CTA}
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
                <div
                  id={`trip-panel-${b.id}`}
                  className="tv-trip-card__panel space-y-3 border-t border-black/[0.06] px-3.5 py-3 sm:px-4 motion-safe:animate-fade-in"
                  data-trip-lifecycle={tripView}
                >
                  <div className="tv-trip-card__tabs flex gap-1" role="tablist" aria-label="Booking sections">
                    {(
                      tripView === 'upcoming'
                        ? ([
                            ['overview', 'Overview'],
                            ['details', 'Details'],
                            ['messages', 'Messages'],
                          ] as const)
                        : ([
                            ['overview', 'Overview'],
                            ['messages', 'Messages'],
                          ] as const)
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={tripDetailTab === id}
                        onClick={() => setTripDetailTab(id)}
                        className={`min-h-8 rounded-md px-2.5 text-[12.5px] font-semibold ${
                          tripDetailTab === id
                            ? 'bg-finland text-white'
                            : 'text-ink-muted hover:bg-black/[0.04]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {tripDetailTab === 'overview' &&
                  tripView === 'past' &&
                  tripAllowsLeaveReview(ops) &&
                  bookingEligibleForReview(b) ? (
                    (() => {
                      const mine = myReviewsByListing[b.listing_id];
                      if (mine && mine.rating >= 1) {
                        const preview =
                          mine.comment.length > 140
                            ? `${mine.comment.slice(0, 140).trimEnd()}…`
                            : mine.comment;
                        const identityLabel = mine.is_anonymous
                          ? 'Posted anonymously'
                          : `Posted as ${displayReviewGuestName(mine)}`;
                        return (
                          <div className="tv-trip-card__review-summary">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className="inline-flex items-center gap-0.5"
                                  aria-label={`${mine.rating} out of 5 stars`}
                                >
                                  {[1, 2, 3, 4, 5].map((i) => (
                                    <Star
                                      key={i}
                                      className={`h-3.5 w-3.5 ${
                                        i <= mine.rating
                                          ? 'fill-[#073b83] text-[#073b83]'
                                          : 'text-[#d1d5db]'
                                      }`}
                                      aria-hidden
                                    />
                                  ))}
                                </span>
                                <span className="text-[12px] font-semibold tabular-nums text-ink">
                                  {mine.rating}/5
                                </span>
                              </div>
                              {preview ? (
                                <p className="mt-1 text-[12.5px] leading-snug text-ink-muted line-clamp-2">
                                  {preview}
                                </p>
                              ) : null}
                              <p className="mt-1 text-[11.5px] text-ink-faint">{identityLabel}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setReviewTarget({
                                  bookingId: b.id,
                                  listingId: b.listing_id,
                                  listingTitle: tripTitle,
                                  imageUrl: thumb,
                                  mode: 'edit',
                                })
                              }
                              className="tv-btn-ghost shrink-0 !min-h-9 !px-2.5 !text-[13px]"
                            >
                              Edit review
                            </button>
                          </div>
                        );
                      }
                      return (
                        <div className="tv-trip-card__review-invite">
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-ink">
                              {isStay ? 'How was your stay?' : 'How was the experience?'}
                            </p>
                            <p className="mt-0.5 text-[12.5px] text-ink-muted">
                              Share feedback for other travelers.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setReviewTarget({
                                bookingId: b.id,
                                listingId: b.listing_id,
                                listingTitle: tripTitle,
                                imageUrl: thumb,
                                mode: 'write',
                              })
                            }
                            className="tv-btn-secondary shrink-0 !min-h-9 !px-3 !text-[13px]"
                          >
                            <Star className="h-3.5 w-3.5" aria-hidden />
                            Write a review
                          </button>
                        </div>
                      );
                    })()
                  ) : null}
                  {tripDetailTab === 'overview' && isStayRequestAwaitingHost(b) ? (
                    <StayRequestActions
                      role="traveler"
                      booking={{
                        ...b,
                        listingTitle: tripTitle,
                      }}
                      onDone={() => void load()}
                    />
                  ) : null}
                  {tripDetailTab === 'overview' && tripView === 'upcoming' ? (
                    <SupplierCancelResolutionPanel
                      booking={b}
                      listingExtras={ops?.listing_extras}
                      onContactOperator={() => {
                        setTripDetailTab('messages');
                        setFocusMessageId(b.id);
                      }}
                      onContactSupport={() => onNavigate('contact')}
                      onResolved={(opts) => {
                        void load().then(() => {
                          if (opts?.newBookingId) {
                            setOpenTripId(opts.newBookingId);
                            setTripView('upcoming');
                            const url = new URL(window.location.href);
                            url.searchParams.set('booking', opts.newBookingId);
                            window.history.replaceState({}, '', `${url.pathname}${url.search}`);
                          }
                        });
                      }}
                    />
                  ) : null}
                  {tripDetailTab === 'overview' && tripView !== 'past' ? (
                    <BookingSupportCasePanel
                      booking={b}
                      cases={supportCasesByBooking[b.id] ?? []}
                      onContactOperator={() => {
                        setTripDetailTab('messages');
                        setFocusMessageId(b.id);
                      }}
                      onContactSupport={() => onNavigate('contact')}
                      onOpened={() => void load()}
                    />
                  ) : null}
                  <dl className={`tv-trip-card__facts ${tripDetailTab === 'messages' ? 'hidden' : ''}`}>
                    {tripDetailTab === 'overview' ? (
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                        {isStay ? 'Stay dates' : 'Departure'}
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-ink leading-snug">
                        {dateLine}
                        {timeBit ? ` · ${timeBit}` : ''}
                      </dd>
                    </div>
                    ) : null}
                    {tripDetailTab === 'overview' && placeLine ? (
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                          {placeLabel}
                        </dt>
                        <dd className="mt-1 text-sm font-semibold text-ink break-words [overflow-wrap:anywhere] whitespace-pre-wrap leading-snug">
                          {placeLine}
                        </dd>
                        {isRental && rentalReturn?.address ? (
                          <p className="mt-1 text-sm text-ink-muted">
                            Return: {rentalReturn.sameAsPickup ? `same place · ${rentalReturn.address}` : rentalReturn.address}
                          </p>
                        ) : null}
                        {isRental && !rentalReturn?.sameAsPickup && rentalSnap?.returnInstructions ? (
                          <p className="mt-1 text-sm text-ink-muted">{rentalSnap.returnInstructions}</p>
                        ) : null}
                        {isRental &&
                        typeof rentalSnap?.pickupLat === 'number' &&
                        typeof rentalSnap.pickupLng === 'number' ? (
                          <div className="mt-3 max-w-md">
                            <RentalCollectionMap
                              lat={rentalSnap.pickupLat}
                              lng={rentalSnap.pickupLng}
                              label={rentalReturn?.sameAsPickup ? 'Pickup and return map' : 'Pickup location map'}
                            />
                          </div>
                        ) : null}
                        {isRental && rentalReturn && !rentalReturn.sameAsPickup && rentalReturn.lat != null && rentalReturn.lng != null ? (
                          <div className="mt-3 max-w-md">
                            <RentalCollectionMap lat={rentalReturn.lat} lng={rentalReturn.lng} label="Return location map" />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {isStay && tripDetailTab === 'overview' && readStayBookingPrice(b.purchase_snapshot) ? (
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Price</dt>
                        <dd>
                          <SavedStayPrice
                            snapshot={b.purchase_snapshot}
                            currency={b.currency}
                            amountPaid={bookingPaymentWasCollected(b.payment_status) ? Number(b.amount_paid) : null}
                          />
                        </dd>
                      </div>
                    ) : null}
                    {isStay &&
                    tripView === 'upcoming' &&
                    (() => {
                      const inT = displayStayCheckInTimeFromPurchase(b.purchase_snapshot, null);
                      const outT = displayStayCheckOutTimeFromPurchase(b.purchase_snapshot, null);
                      if (!inT && !outT) return null;
                      return (
                        <div className="sm:col-span-2">
                          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                            House times
                          </dt>
                          <dd className="mt-0.5 text-sm text-ink">
                            {[
                              inT ? `Check-in from ${inT}` : null,
                              outT ? `Check-out by ${outT}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </dd>
                        </div>
                      );
                    })()}
                    {isStay && tripDetailTab === 'details' && displayStayHouseRulesFromPurchase(b.purchase_snapshot) ? (
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                          House rules (when you booked)
                        </dt>
                        <dd className="mt-0.5 text-sm text-ink break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                          {displayStayHouseRulesFromPurchase(b.purchase_snapshot)}
                        </dd>
                      </div>
                    ) : null}
                    {tripDetailTab === 'details' && !isStay && (displayIncludesFromPurchase(b.purchase_snapshot)?.length ?? 0) > 0 ? (
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                          Included (when you booked)
                        </dt>
                        <dd className="mt-0.5 text-sm text-ink">
                          <ul className="list-disc space-y-1 pl-4">
                            {displayIncludesFromPurchase(b.purchase_snapshot)!.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    ) : null}
                    {tripDetailTab === 'details' && !isStay && (displayExcludesFromPurchase(b.purchase_snapshot)?.length ?? 0) > 0 ? (
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                          Not included (when you booked)
                        </dt>
                        <dd className="mt-0.5 text-sm text-ink">
                          <ul className="list-disc space-y-1 pl-4">
                            {displayExcludesFromPurchase(b.purchase_snapshot)!.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    ) : null}
                    {tripDetailTab === 'overview' &&
                    tripView === 'upcoming' &&
                    !isStay &&
                    tripPlaceValue ? (
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                          {tripPlaceHeading}
                        </dt>
                        <dd className="mt-0.5 text-sm text-ink break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                          {tripPlaceValue}
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tripPlaceValue)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 block text-sm font-semibold text-finland underline-offset-2 hover:underline"
                          >
                            Directions
                          </a>
                        </dd>
                        {tripLogistics.map((line) => (
                          <dd key={line} className="mt-0.5 text-sm text-ink-muted">{line}</dd>
                        ))}
                      </div>
                    ) : null}
                    {tripDetailTab === 'details' && !isStay && tripPickupInstructions && !pickupMissing ? (
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                          Pickup
                        </dt>
                        <dd className="mt-0.5 text-sm text-ink break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                          {b.pickup_time && !tripHidesExactPickup ? `${pgTimeToHm(b.pickup_time)} · ` : ''}
                          {tripPickupInstructions}
                        </dd>
                      </div>
                    ) : null}
                    {tripDetailTab === 'details' && !isStay &&
                    (() => {
                      const phone = displayBookingContactPhoneFromPurchase(
                        b.purchase_snapshot,
                        b.payment_status
                      );
                      if (!phone) return null;
                      return (
                        <div className="sm:col-span-2">
                          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                            Experience provider contact
                          </dt>
                          <dd className="mt-0.5 text-sm text-ink">
                            <a
                              href={`tel:${phone}`}
                              className="font-semibold text-finland underline-offset-2 hover:underline"
                            >
                              {formatBookingContactForDisplay(phone)}
                            </a>
                          </dd>
                        </div>
                      );
                    })()}
                    {tripDetailTab === 'details' && !isStay && tripDuration ? (
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                          Duration
                        </dt>
                        <dd className="mt-0.5 text-sm text-ink">{tripDuration}</dd>
                      </div>
                    ) : null}
                    {tripDetailTab === 'overview' ? (
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                        {isRental
                          ? 'Quantity'
                          : isStay
                            ? 'Guests'
                            : b.guest_breakdown && b.guest_breakdown.length > 0
                              ? 'Participants'
                              : 'Participants'}
                      </dt>
                      <dd className="mt-0.5 text-sm text-ink">
                        {isRental ? rentalQtyLabel : formatBookingParticipantsLabel(b)}
                        {!isRental ? stayNightsSuffix : ''}
                      </dd>
                    </div>
                    ) : null}
                    {tripDetailTab === 'overview' && ref ? (
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                          Reference
                        </dt>
                        <dd className="mt-0.5 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold tracking-wide text-finland">{ref}</span>
                          {/* Phase 1677: Copy/Print parity with booking confirmation. */}
                          <button
                            type="button"
                            className="tv-btn-ghost text-xs min-h-9 px-2 print:hidden"
                            aria-label="Copy booking reference"
                            onClick={() => {
                              void navigator.clipboard?.writeText(ref).then(() => {
                                setCopiedTripRefId(b.id);
                                window.setTimeout(() => {
                                  setCopiedTripRefId((cur) => (cur === b.id ? null : cur));
                                }, 2000);
                              });
                            }}
                          >
                            {copiedTripRefId === b.id ? (
                              <Check className="w-3.5 h-3.5" aria-hidden />
                            ) : (
                              <Copy className="w-3.5 h-3.5" aria-hidden />
                            )}
                            {copiedTripRefId === b.id ? 'Copied' : 'Copy'}
                          </button>
                          <button
                            type="button"
                            className="tv-btn-ghost text-xs min-h-9 px-2 print:hidden"
                            aria-label="Print booking details"
                            onClick={() => window.print()}
                          >
                            <Printer className="w-3.5 h-3.5" aria-hidden />
                            Print
                          </button>
                        </dd>
                      </div>
                    ) : null}
                    {tripDetailTab === 'details' && tripCancelPolicy ? (
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                          Cancellation (at purchase)
                        </dt>
                        <dd className="mt-0.5 text-sm text-ink-muted break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                          {tripCancelPolicy}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  {tripDetailTab === 'overview' &&
                  tripView === 'upcoming' &&
                  b.pickup_time &&
                  !tripHidesExactPickup &&
                  (pickupMissing || !tripPickupInstructions) ? (
                    <p className="text-sm text-ink-muted">Pickup {pgTimeToHm(b.pickup_time)}</p>
                  ) : tripDetailTab === 'overview' && tripView === 'upcoming' && pickupMissing ? (
                    <NoticeCallout title="Pickup details pending" tone="warn">
                      {TRAVELER_PICKUP_PENDING_UI_NOTE}
                    </NoticeCallout>
                  ) : null}
                  {tripDetailTab === 'overview' && openCancel && tripView === 'upcoming' ? (
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
                  {tripDetailTab === 'overview' && b.status === 'cancelled' && payLabel === 'Refund processing' ? (
                    <NoticeCallout title="Refund processing" tone="info">
                      {REFUND_PROCESSING_COPY}
                    </NoticeCallout>
                  ) : null}
                  {tripDetailTab === 'overview' && b.status === 'cancelled' && payLabel === 'Refund delayed' ? (
                    <NoticeCallout title="Refund delayed" tone="warn">
                      <p>{REFUND_DELAYED_COPY}</p>
                      <button
                        type="button"
                        className="tv-btn-secondary mt-3"
                        disabled={cancellingId === b.id}
                        onClick={async () => {
                          setCancellingId(b.id);
                          const retry = await executeBookingRefund(b.id);
                          setCancellingId(null);
                          if (retry.success) {
                            setActionSuccess({
                              title: 'Refund resubmitted',
                              body: REFUND_PROCESSING_COPY,
                            });
                            load();
                          } else {
                            setActionError(
                              userFacingError(retry.error, 'Could not resubmit this refund. Try again shortly.')
                            );
                          }
                        }}
                      >
                        {cancellingId === b.id ? 'Retrying…' : 'Retry refund'}
                      </button>
                    </NoticeCallout>
                  ) : null}
                  {tripDetailTab === 'overview' && b.status === 'cancelled' && payLabel === 'Refund due' ? (
                    <NoticeCallout title="Refund due" tone="warn">
                      {REFUND_DUE_MANUAL_COPY}
                      {bookingIsStayNight(b) ? (
                        <button
                          type="button"
                          className="tv-btn-secondary mt-3"
                          disabled={cancellingId === b.id}
                          onClick={async () => {
                            setCancellingId(b.id);
                            const retry = await executeBookingRefund(b.id);
                            setCancellingId(null);
                            if (retry.success) {
                              setActionSuccess({
                                title: 'Refund submitted',
                                body: REFUND_PROCESSING_COPY,
                              });
                              load();
                            } else {
                              setActionError(
                                userFacingError(retry.error, 'Could not submit this refund. Try again shortly.')
                              );
                            }
                          }}
                        >
                          {cancellingId === b.id ? 'Submitting…' : 'Submit refund'}
                        </button>
                      ) : null}
                    </NoticeCallout>
                  ) : null}
                  {b.status === 'cancelled' && guestNotes ? (
                    <p className="text-sm text-ink-muted break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{guestNotes}</p>
                  ) : null}
                  {tripDetailTab === 'details' &&
                  liveTrip &&
                    (b.status === 'pending' || b.status === 'confirmed') &&
                    !isStay &&
                    tripFulfillment === 'pickup' &&
                    !chosenPickup && (
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
                  <div className={`flex flex-wrap items-center gap-2 ${tripDetailTab === 'overview' ? '' : 'hidden'}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setTripDetailTab('messages');
                        setFocusMessageId(b.id);
                      }}
                      className="tv-btn-secondary !min-h-9 !text-[13px]"
                    >
                      {isStay ? 'Message host' : 'Contact operator'}
                    </button>
                    {tripView === 'upcoming' &&
                    onTourSelect &&
                    tripAllowsBrowseLiveListing(ops) ? (
                      <button
                        type="button"
                        onClick={() => {
                          onTourSelect({
                            id: b.listing_id,
                            ...(isStay
                              ? { listingExtras: { inventoryFamily: 'stay' as const } }
                              : {}),
                          });
                        }}
                        className="tv-btn-ghost !min-h-9 !text-[13px]"
                        title="Opens the live marketplace page. Details above are what you booked."
                      >
                        {isStay ? 'Browse listing' : 'Browse tour'}
                      </button>
                    ) : null}
                    {tripView === 'upcoming' &&
                    liveTrip &&
                    (payLabel === 'Checkout expired' || payLabel === 'Hold expired') &&
                    travelerBookingNeedsPayNow(b) ? (
                      <NoticeCallout title="Checkout expired" tone="warn">
                        {TRAVELER_HOLD_EXPIRED_PAY_NOW_NOTE}
                      </NoticeCallout>
                    ) : null}
                    {tripView === 'upcoming' && liveTrip && travelerBookingNeedsPayNow(b) && (
                      <button
                        type="button"
                        onClick={() => void handlePayNow(b)}
                        disabled={payingId === b.id}
                        className="tv-btn-primary !min-h-9"
                      >
                        {payingId === b.id ? TRAVELER_OPENING_CHECKOUT_CTA : TRAVELER_PAY_NOW_TEST_CTA}
                      </button>
                    )}
                    {tripView === 'upcoming' &&
                      liveTrip &&
                      !openCancel &&
                      (travelerBookingNeedsPayNow(b) || b.status === 'confirmed') &&
                      getSelfCancelAvailable(b) && (
                      <div className="tv-trip-card__cancel-strip w-full">
                        <p className="text-[12.5px] leading-relaxed text-ink-muted">
                          {(() => {
                            if (travelerSelfCancelIsUnpaidCheckout(b)) {
                              return 'No payment taken — you can cancel this checkout hold.';
                            }
                            const policy = resolveStayCancelPolicyFromSnapshot(b.purchase_snapshot);
                            const tz = resolveDepartureTimezone(
                              displayDepartureTimezoneFromPurchase(b.purchase_snapshot)
                            );
                            const deadline = travelerSelfCancelDeadlineMs({
                              bookingDate: b.booking_date,
                              startTimeHm: getSelfCancelStartHm(b),
                              departureTimezone: tz,
                              freeCancelHours: policy.freeCancelHours,
                            });
                            const when = deadline
                              ? new Intl.DateTimeFormat('en-GB', {
                                  timeZone: tz,
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hourCycle: 'h23',
                                }).format(new Date(deadline))
                              : null;
                            const hours =
                              policy.freeCancelHours != null
                                ? `${policy.freeCancelHours}h free cancel`
                                : 'Cancellation policy applies';
                            return when
                              ? `${hours} · deadline ${when} (local) · full refund if cancelled in time`
                              : hours;
                          })()}
                        </p>
                        <button
                          type="button"
                          onClick={() => setCancelConfirm(b)}
                          disabled={cancellingId !== null}
                          className="tv-btn-ghost !min-h-9 text-red-700"
                        >
                          {travelerSelfCancelIsUnpaidCheckout(b)
                            ? TRAVELER_CANCEL_UNPAID_CHECKOUT_CTA
                            : TRAVELER_SELF_CANCEL_CTA}
                        </button>
                      </div>
                    )}
                    {tripView === 'upcoming' &&
                      liveTrip &&
                      !openCancel &&
                      b.status === 'confirmed' &&
                      !travelerSelfCancelIsUnpaidCheckout(b) &&
                      !getSelfCancelAvailable(b) && (
                      <p className="w-full text-[12.5px] leading-relaxed text-ink-muted">
                        {(() => {
                          const policy = resolveStayCancelPolicyFromSnapshot(b.purchase_snapshot);
                          const tz = resolveDepartureTimezone(
                            displayDepartureTimezoneFromPurchase(b.purchase_snapshot)
                          );
                          const deadline = travelerSelfCancelDeadlineMs({
                            bookingDate: b.booking_date,
                            startTimeHm: getSelfCancelStartHm(b),
                            departureTimezone: tz,
                            freeCancelHours: policy.freeCancelHours,
                          });
                          const when = deadline
                            ? new Intl.DateTimeFormat('en-GB', {
                                timeZone: tz,
                                day: 'numeric',
                                month: 'long',
                                hour: '2-digit',
                                minute: '2-digit',
                                hourCycle: 'h23',
                              }).format(new Date(deadline))
                            : null;
                          if (policy.freeCancelHours == null) {
                            return travelerSelfCancelUnavailableMessage({ freeCancelHours: null });
                          }
                          return when
                            ? `Self-cancellation closed at ${when} (local). Contact the operator or Traverion Support if you need help.`
                            : travelerSelfCancelUnavailableMessage({
                                freeCancelHours: policy.freeCancelHours,
                              });
                        })()}
                      </p>
                    )}
                    {tripView === 'cancelled' ? (
                      <button
                        type="button"
                        onClick={() => onNavigate('contact')}
                        className="tv-btn-ghost !min-h-9 !text-[13px]"
                      >
                        Contact Traverion Support
                      </button>
                    ) : null}
                    {tripView === 'past' ? (
                      <button
                        type="button"
                        onClick={() => onNavigate('contact')}
                        className="tv-btn-ghost !min-h-9 !text-[13px] text-ink-muted"
                      >
                        Report a problem
                      </button>
                    ) : null}
                    {tripView === 'upcoming' ? (
                      <button
                        type="button"
                        onClick={() => onNavigate('contact')}
                        className="tv-btn-ghost !min-h-9 !text-[13px] text-ink-muted"
                      >
                        Traverion Support
                      </button>
                    ) : null}
                  </div>
                  {(() => {
                    const msg = {
                      status: b.status,
                      payment_status: b.payment_status,
                      openCancellation: Boolean(openCancel),
                    };
                    const block = messagingComposeBlock(msg);
                    if (tripDetailTab !== 'messages') return null;
                    return (
                    <BookingMessageThread
                      bookingId={b.id}
                      canCompose={block === 'none'}
                      composeBlock={block === 'closed' ? 'closed' : 'unpaid'}
                      viewerRole="traveler"
                      listingTitle={displayListingTitleFromPurchase(
                        b.purchase_snapshot,
                        titles[b.listing_id],
                        'Booking'
                      )}
                      listingId={b.listing_id}
                      supplierId={ops?.supplier_id}
                      customerEmail={b.guest_email}
                      customerName={b.guest_name}
                      bookingNumber={typeof b.booking_number === 'number' ? b.booking_number : undefined}
                      bookingDate={b.booking_date}
                      autoFocus={focusMessageId === b.id}
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
          </div>
        )}
        </section>

        {cancelConfirm && (
          <div ref={cancelSheetRef} className="tv-sheet-overlay z-50">
            <button type="button" tabIndex={-1} className="absolute inset-0" aria-label="Close" onClick={closeCancelConfirm} />
            <div className="tv-sheet-panel relative max-w-lg motion-safe:animate-slide-up" role="dialog" aria-modal="true" aria-labelledby="cancel-trip-title">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="tv-eyebrow !mb-0">Cancellation</p>
                  <h3 id="cancel-trip-title" className="mt-2 font-sans text-xl font-bold tracking-tight text-ink">
                    {travelerSelfCancelIsUnpaidCheckout(cancelConfirm)
                      ? 'Cancel checkout?'
                      : 'Cancel your booking?'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeCancelConfirm}
                  className="lux-flat lux-tap-target inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-black/[0.04] hover:text-ink"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" aria-hidden />
                </button>
              </div>
              <div className="mt-4 rounded-2xl bg-paper px-4 py-3.5 ring-1 ring-black/[0.05]">
                <p className="font-semibold text-ink leading-snug">
                  {displayListingTitleFromPurchase(
                    cancelConfirm.purchase_snapshot,
                    titles[cancelConfirm.listing_id],
                    'This booking'
                  )}
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  {(() => {
                    if (bookingIsStayNight(cancelConfirm)) {
                      const stay = stayRangeFromBooking(cancelConfirm);
                      if (stay) {
                        return `${formatBookingDateDisplay(stay.checkIn)} → ${formatBookingDateDisplay(stay.checkOut)}`;
                      }
                    }
                    return cancelConfirm.booking_date
                      ? formatBookingDateDisplay(cancelConfirm.booking_date)
                      : 'Date TBC';
                  })()}
                  {(() => {
                    if (bookingIsStayNight(cancelConfirm)) return null;
                    const shown = displayStartTimeFromPurchase(
                      cancelConfirm.purchase_snapshot,
                      cancelConfirm.start_time ? pgTimeToHm(cancelConfirm.start_time) : null
                    );
                    if (!shown) return null;
                    return ` · ${formatTravelerDepartureClock(
                      shown,
                      displayDepartureTimezoneFromPurchase(cancelConfirm.purchase_snapshot)
                    )}`;
                  })()}
                  {travelerPublicBookingReference(cancelConfirm.public_reference)
                    ? ` · ${travelerPublicBookingReference(cancelConfirm.public_reference)}`
                    : ''}
                </p>
                <p className="mt-1.5 text-sm text-ink">
                  {(() => {
                    if (bookingIsRental(cancelConfirm)) {
                      const snap = parseRentalPurchaseSnapshot(cancelConfirm.purchase_snapshot);
                      if (!snap) return null;
                      const rawCat = (cancelConfirm.purchase_snapshot as { rentalCategory?: unknown } | null)
                        ?.rentalCategory;
                      const cat =
                        typeof rawCat === 'string' && isRentalCategoryId(rawCat) ? rawCat : null;
                      const extras = listingOps[cancelConfirm.listing_id]?.listing_extras as
                        | { rental?: { category?: unknown } }
                        | null
                        | undefined;
                      const extrasCat = extras?.rental?.category;
                      const fromExtras =
                        typeof extrasCat === 'string' && isRentalCategoryId(extrasCat) ? extrasCat : null;
                      return formatRentalQuantityLabel(snap.quantity, cat ?? fromExtras);
                    }
                    return formatBookingParticipantsLabel(cancelConfirm);
                  })()}
                </p>
              </div>
              {travelerSelfCancelIsUnpaidCheckout(cancelConfirm) ? (
                <div className="mt-4 rounded-2xl bg-finland/[0.06] px-4 py-3.5 ring-1 ring-finland/15">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-finland">No payment taken</p>
                  <p className="mt-1.5 text-sm text-ink leading-relaxed">{TRAVELER_CANCEL_UNPAID_CHECKOUT_POLICY}</p>
                </div>
              ) : (
                <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3.5 ring-1 ring-emerald-200/80">
                  <p className="text-sm text-ink leading-relaxed">
                    {(() => {
                      const startHm = getSelfCancelStartHm(cancelConfirm);
                      const tz = resolveDepartureTimezone(
                        displayDepartureTimezoneFromPurchase(cancelConfirm.purchase_snapshot)
                      );
                      const policy = resolveStayCancelPolicyFromSnapshot(cancelConfirm.purchase_snapshot);
                      const deadline = travelerSelfCancelDeadlineMs({
                        bookingDate: cancelConfirm.booking_date,
                        startTimeHm: startHm,
                        departureTimezone: tz,
                        freeCancelHours: policy.freeCancelHours,
                      });
                      const when = deadline
                        ? new Intl.DateTimeFormat('en-GB', {
                            timeZone: tz,
                            day: 'numeric',
                            month: 'long',
                            hour: '2-digit',
                            minute: '2-digit',
                            hourCycle: 'h23',
                          }).format(new Date(deadline))
                        : null;
                      return when
                        ? `You can cancel for a full refund until ${when} (local time).`
                        : TRAVELER_SELF_CANCEL_FULL_REFUND_POLICY;
                    })()}
                  </p>
                  {cancelConfirm.amount_paid != null && Number(cancelConfirm.amount_paid) > 0 ? (
                    <p className="mt-2 text-sm font-semibold text-ink">
                      Refund: {formatMoney(Number(cancelConfirm.amount_paid), cancelConfirm.currency)}
                    </p>
                  ) : null}
                </div>
              )}
              <p className="mt-3 text-xs text-ink-muted leading-relaxed">{TRAVELER_SELF_CANCEL_DELIVERY_NOTE}</p>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={closeCancelConfirm}
                  className="tv-btn-secondary w-full sm:w-auto"
                >
                  {travelerSelfCancelIsUnpaidCheckout(cancelConfirm) ? 'Keep checkout' : 'Keep booking'}
                </button>
                <button
                  type="button"
                  onClick={() => handleCancelBooking(cancelConfirm)}
                  disabled={cancellingId !== null}
                  className="tv-btn-primary w-full sm:w-auto bg-red-700 hover:bg-red-800"
                >
                  {cancellingId === cancelConfirm.id
                    ? 'Cancelling…'
                    : travelerSelfCancelIsUnpaidCheckout(cancelConfirm)
                      ? TRAVELER_CANCEL_UNPAID_CHECKOUT_CTA
                      : 'Confirm cancellation'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {user ? (
        <TravelerReviewComposeDialog
          open={reviewTarget !== null}
          target={reviewTarget}
          userId={user.id}
          userMetadata={(user.user_metadata as Record<string, unknown> | null) ?? null}
          profileDisplayName={
            reviewProfileDisplayName ||
            (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null) ||
            (typeof user.user_metadata?.display_name === 'string'
              ? user.user_metadata.display_name
              : null)
          }
          onClose={() => setReviewTarget(null)}
          onSubmitted={(listingId) => {
            setReviewedListingIds((prev) => {
              const next = new Set(prev);
              next.add(listingId);
              return next;
            });
            // Refresh this listing's review preview without a full trips reload.
            if (supabase && user?.id) {
              void supabase
                .from('reviews')
                .select('listing_id, rating, comment, guest_name, is_anonymous')
                .eq('user_id', user.id)
                .eq('listing_id', listingId)
                .maybeSingle()
                .then(({ data }) => {
                  if (!data) return;
                  setMyReviewsByListing((prev) => ({
                    ...prev,
                    [listingId]: {
                      rating: Number(data.rating) || 0,
                      comment: String(data.comment ?? '').trim(),
                      guest_name: String(data.guest_name ?? '').trim(),
                      is_anonymous: Boolean(data.is_anonymous),
                    },
                  }));
                });
            }
          }}
        />
      ) : null}
    </div>
  );
}
