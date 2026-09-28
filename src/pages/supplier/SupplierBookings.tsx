import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Mail,
  MapPin,
  RefreshCw,
  Trash2,
  Users,
  CalendarDays,
} from 'lucide-react';
import type { TourPackage } from '../../types/tour';
import { listingHeroImageSrc, orderedPhotoUrls, photoSlotsFromTourPackage } from '../../lib/listingPhotoGrid';
import { formatMoney } from '../../lib/money';
import { isPaidPaymentStatus, partnerPaymentLabel, partnerCollectedAmountCaption, bookingPaymentWasCollected, isRefundDueBooking, REFUND_DUE_MANUAL_COPY } from '../../lib/payment-states';
import { PARTNER_BOOKINGS_CSV_HEADER, partnerBookingCsvValues } from '../../lib/partner-bookings-csv';
import { csvSafeCell } from '../../lib/csv-export';
import { localYmd } from '../../lib/local-ymd';
import { guestFacingBookingNotes } from '../../lib/booking-notes';
import { formatBookingParticipantsLabel } from '../../lib/participant-mix';
import {
  SUPPLIER_CANCELLATION_REASON_CODES,
  isForceMajeureReason,
  snapshotSupplierCancellationPolicy,
  supplierCancellationFeeEur,
  supplierCancellationReasonLabel,
} from '../../lib/cancellation-policy';
import {
  bookingAllowsMessaging,
  messagingComposeBlock,
  fetchCancellationRequestsForBookings,
  notifyTravelerCancellationRequest,
  requestSupplierCancellation,
  type CancellationRequestRow,
} from '../../data/supabase-booking-ops';
import BookingMessageThread from '../../components/BookingMessageThread';
import NoticeCallout from '../../components/NoticeCallout';
import { PARTNER_CANCELLATION_REQUEST_DELIVERY_NOTE, PARTNER_CANCEL_REQUEST_REFUND_POLICY, PARTNER_CANCEL_REQUEST_SUBMIT_ERROR, PARTNER_CANCEL_REQUEST_CONSEQUENCES_TITLE, PARTNER_CANCEL_REQUEST_FEE_TIMING_NOTE } from '../../lib/booking-confirmation-copy';
import { SkeletonListItem } from '../../components/ui/Skeleton';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import {
  SUPPLIER_PAGE_CLASS,
  SupplierEmptyState,
  SupplierModalHeader,
  SupplierModalShell,
  SupplierPageHero,
} from '../../components/supplier/supplierUi';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import {
  acknowledgeBooking,
  fetchBookingsForSupplier,
  type BookingRow,
  updateBookingStatus,
} from '../../data/supabase-bookings';
import { decrementAvailabilityBooked } from '../../data/supabase-availability';
import { fetchMyListings, pgTimeToHm } from '../../data/supabase-listings';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import { navigateSupplierUrl, openSupplierInbox, openSupplierPickup } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { inventoryFamilyFromListing } from '../../lib/inventory';
import { nightsOccupiedByStay, stayRangeFromBooking } from '../../lib/stayOccupancy';
import { partnerBookingIsLiveTrip, partnerBookingIsOperatingTrip, partnerBookingNeedsLook, partnerBookingIsUnpaidCheckout, partnerBookingIsActiveUnpaidCheckout, partnerBookingShowsCancelAction, partnerBookingIsPastSchedule, partnerStayTouchesScheduleDay, scheduleTodayIsoForBooking } from '../../lib/trip-views';
import { addCalendarDaysYmd } from '../../lib/booking-lifecycle-calendar';
import { formatPartnerCheckoutHoldLabel, partnerUnpaidCheckoutHoldsInventory } from '../../lib/booking-hold';
import { formatStayNightHuman } from '../../lib/stay-calendar';
import { formatBookingDateDisplay } from '../../lib/booking-flow';
import { bookingIsStayNight, partnerBookingHasPickupAttention } from '../../lib/pickup-completeness';
import { parseListingExtras, materializedBookingOptions } from '../../types/listingExtras';
import { comparePartnerBookingsOperational } from '../../lib/partner-bookings-order';
import { partnerBookingNumberMatchesFilterQuery } from '../../lib/partner-bookings-search';
import { displayListingTitleFromPurchase, displayMeetingPointFromPurchase, displayOptionLabelFromPurchase, displayPickupInstructionsFromPurchase, displayFulfillmentFromPurchase, displayDurationFromPurchase, displayStayCheckInTimeFromPurchase, displayStayCheckOutTimeFromPurchase, displayCheckInAddressFromPurchase, displayStayHouseRulesFromPurchase, partnerOpsDepartureDisplay, isPurchaseSnapshot, partnerListingFilterLabelFromBookings } from '../../lib/purchase-snapshot';

const BOOKINGS_PAGE_SIZE = 10;

type ListingBookingMeta = {
  title: string;
  imageUrl: string | null;
  location: string;
  duration: string;
  family: ReturnType<typeof inventoryFamilyFromListing>;
  meetingPoint: string | null;
  pickupInstructions: string | null;
  bookingOptions: Array<{
    id: string;
    name: string;
    pickupPlace: string;
    optionInfo: string;
    travelerStartInstructions?: string;
  }>;
  stayCheckInTime: string | null;
  stayCheckOutTime: string | null;
};

function buildListingMeta(listing: TourPackage): ListingBookingMeta {
  const urls = orderedPhotoUrls(photoSlotsFromTourPackage(listing));
  const imageUrl = listingHeroImageSrc(urls[0] || listing.image);
  const location =
    [listing.city, listing.country ?? listing.destination].filter(Boolean).join(', ') ||
    listing.destination ||
    '—';
  const extras = parseListingExtras(listing.listingExtras as unknown);
  const opts = materializedBookingOptions(extras.bookingOptions).map((o) => ({
    id: o.id,
    name: o.name?.trim() || '',
    pickupPlace: o.pickupPlace,
    optionInfo: o.optionInfo,
    travelerStartInstructions: o.travelerStartInstructions,
  }));
  return {
    title: listing.title,
    imageUrl,
    location,
    duration: listing.duration || '—',
    family: inventoryFamilyFromListing(listing),
    meetingPoint: listing.meetingPoint?.trim() || null,
    pickupInstructions: listing.pickupInstructions?.trim() || null,
    bookingOptions: opts,
    stayCheckInTime: extras.stay?.checkInTime?.trim() || null,
    stayCheckOutTime: extras.stay?.checkOutTime?.trim() || null,
  };
}

function formatBookingMoney(amount: number | null | undefined, currency: string | null | undefined): string | null {
  if (amount == null || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return null;
  return formatMoney(Number(amount), currency);
}

function bookingStatusClass(status: string, paymentStatus?: string | null): string {
  const pay = (paymentStatus ?? '').trim().toLowerCase();
  if (status === 'cancelled' || pay === 'refunded') return 'bg-slate-100 text-slate-600 ring-slate-200/80';
  if (status === 'confirmed') return 'bg-emerald-50 text-emerald-800 ring-emerald-200/80';
  return 'bg-amber-50 text-amber-900 ring-amber-200/80';
}

const CANCELLATION_REASONS = SUPPLIER_CANCELLATION_REASON_CODES.map((id) => ({
  id,
  label: supplierCancellationReasonLabel(id),
}));

/** refund_choice values only — never label these “Full refund” as if Stripe already paid out. */
type RefundChoice = 'full_refund' | 'no_refund' | 'reschedule';
type BookingView = 'today' | 'tomorrow' | 'upcoming' | 'past' | 'all';
type OpsFilter = 'all' | 'unpaid' | 'pickup' | 'cancel' | 'refund_due';

const PARTNER_BOOKINGS_TABPANEL_ID = 'partner-bookings-tabpanel';

function partnerBookingsTabId(view: BookingView): string {
  return `partner-bookings-tab-${view}`;
}

function bookingPaginationRange(totalPages: number, current: number): (number | 'ellipsis')[] {
  if (totalPages <= 1) return [];
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const wanted = new Set([1, totalPages, current - 1, current, current + 1]);
  const sorted = [...wanted].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: (number | 'ellipsis')[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i - 1] + 1 < sorted[i]) out.push('ellipsis');
    out.push(sorted[i]);
  }
  return out;
}

function formatActivityDateLong(bookingDate: string | null, startHm: string | null): string {
  if (!bookingDate) return 'No activity date';
  const datePart = formatBookingDateDisplay(bookingDate);
  if (!datePart) return 'No activity date';
  return startHm ? `${datePart} · ${startHm}` : datePart;
}

function downloadBookingsCsv(
  rows: BookingRow[],
  listingMeta: Record<string, ListingBookingMeta>
): void {
  const lines = rows.map((b) => {
    const meta = listingMeta[b.listing_id];
    const isStay = meta?.family === 'stay' || bookingIsStayNight(b);
    const stayRange = isStay ? stayRangeFromBooking(b) : null;
    const nights = stayRange ? nightsOccupiedByStay(stayRange.checkIn, stayRange.checkOut).length : 0;
    const listingTitle = displayListingTitleFromPurchase(
      b.purchase_snapshot,
      meta?.title,
      ''
    );
    return partnerBookingCsvValues(
      b,
      listingTitle,
      b.start_time ? pgTimeToHm(b.start_time) ?? '' : '',
      b.pickup_time ? pgTimeToHm(b.pickup_time) ?? '' : '',
      { inventory: isStay ? 'stay' : 'tour', nights: nights > 0 ? nights : null }
    )
      .map(csvSafeCell)
      .join(',');
  });
  const csv = [PARTNER_BOOKINGS_CSV_HEADER.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `supplier-bookings-${localYmd()}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function SupplierBookings({
  inventoryFamily,
}: {
  inventoryFamily?: 'tour' | 'stay';
} = {}) {
  const { user, isSupabase } = useSupplierAuth();
  const { role } = useSupplierRole();
  const canEditBookings = canManageBookings(role);

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [listingMeta, setListingMeta] = useState<Record<string, ListingBookingMeta>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelRequestsError, setCancelRequestsError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [view, setView] = useState<BookingView>(() => {
    if (typeof window === 'undefined') return 'all';
    const v = new URLSearchParams(window.location.search).get('view');
    return v === 'today' || v === 'tomorrow' || v === 'upcoming' || v === 'past' || v === 'all' ? v : 'all';
  });
  const [opsFilter, setOpsFilter] = useState<OpsFilter>('all');
  const [filterListingId, setFilterListingId] = useState(() => {
    if (typeof window === 'undefined') return '';
    return (new URLSearchParams(window.location.search).get('listing') ?? '').trim();
  });
  const [filterDateFrom, setFilterDateFrom] = useState(() => {
    if (typeof window === 'undefined') return '';
    const d = (new URLSearchParams(window.location.search).get('from') ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
  });
  const [filterDateTo, setFilterDateTo] = useState(() => {
    if (typeof window === 'undefined') return '';
    const d = (new URLSearchParams(window.location.search).get('to') ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
  });
  const [filterQuery, setFilterQuery] = useState('');
  const [showSearch, setShowSearch] = useState(() => {
    if (typeof window === 'undefined') return false;
    const p = new URLSearchParams(window.location.search);
    return Boolean(p.get('listing') || p.get('from') || p.get('to'));
  });

  const [bookingsListPage, setBookingsListPage] = useState(1);
  const [highlightBookingId, setHighlightBookingId] = useState<string | null>(null);

  const [cancelModal, setCancelModal] = useState<BookingRow | null>(null);
  const [cancelReason, setCancelReason] = useState<string>(CANCELLATION_REASONS[0].id);
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [cancelEvidence, setCancelEvidence] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [openCancels, setOpenCancels] = useState<Record<string, CancellationRequestRow>>({});

  const loadGenRef = useRef(0);
  const bookingsHubUserIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setLoading(false);
      return;
    }
    const gen = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    setCancelRequestsError(null);
    try {
      const [bookingsList, myListings] = await Promise.all([
        fetchBookingsForSupplier(uid),
        fetchMyListings(uid),
      ]);
      if (gen !== loadGenRef.current) return;
      const meta: Record<string, ListingBookingMeta> = {};
      myListings.forEach((listing) => {
        meta[listing.id] = buildListingMeta(listing);
      });
      setBookings(bookingsList.filter(partnerBookingIsLiveTrip));
      setListingMeta(meta);
      try {
        const reqs = await fetchCancellationRequestsForBookings(bookingsList.map((b) => b.id));
        if (gen !== loadGenRef.current) return;
        const open: Record<string, CancellationRequestRow> = {};
        for (const r of reqs) {
          if (r.status === 'requested' && !open[r.booking_id]) open[r.booking_id] = r;
        }
        setOpenCancels(open);
        setCancelRequestsError(null);
      } catch (cancelErr) {
        if (gen !== loadGenRef.current) return;
        // Keep prior open-cancel map — do not pretend there are zero open cancels.
        setCancelRequestsError(userFacingError(cancelErr, USER_ERROR.bookings));
      }
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      setError(userFacingError(e, USER_ERROR.bookings));
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [isSupabase, user?.id]);

  // Phase 1384 + layout: clear prior partner bookings before paint on account switch (useEffect ran one frame too late).
  useLayoutEffect(() => {
    const clearBookingsPartnerWorkspace = () => {
      setBookings([]);
      setListingMeta({});
      setOpenCancels({});
      setError(null);
      setCancelRequestsError(null);
      setCancelModal(null);
      setUpdatingId(null);
    };
    if (!user?.id) {
      bookingsHubUserIdRef.current = null;
      loadGenRef.current += 1;
      clearBookingsPartnerWorkspace();
      setLoading(false);
      return;
    }
    if (bookingsHubUserIdRef.current !== user.id) {
      bookingsHubUserIdRef.current = user.id;
      loadGenRef.current += 1;
      clearBookingsPartnerWorkspace();
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('booking');
      setHighlightBookingId(id && id.length > 0 ? id : null);
      const ops = params.get('ops');
      if (ops === 'refund_due' || ops === 'unpaid' || ops === 'pickup' || ops === 'cancel') {
        setOpsFilter(ops);
        // Money/hold/cancel ops are not schedule-scoped — Today/Upcoming hide unpaid holds.
        if (ops === 'refund_due' || ops === 'unpaid' || ops === 'cancel') setView('all');
      } else if (ops === 'all' || ops === null) {
        if (ops === 'all') setOpsFilter('all');
      }
      const v = params.get('view');
      if (v === 'today' || v === 'tomorrow' || v === 'upcoming' || v === 'past' || v === 'all') {
        if (!(ops === 'refund_due' || ops === 'unpaid' || ops === 'cancel')) setView(v);
      }
      const listing = (params.get('listing') ?? '').trim();
      setFilterListingId(listing);
      const from = (params.get('from') ?? '').trim();
      const to = (params.get('to') ?? '').trim();
      setFilterDateFrom(/^\d{4}-\d{2}-\d{2}$/.test(from) ? from : '');
      setFilterDateTo(/^\d{4}-\d{2}-\d{2}$/.test(to) ? to : '');
      if (listing || from || to) setShowSearch(true);
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  const writeBookingsSearchToUrl = useCallback(
    (patch: {
      listingId?: string;
      from?: string;
      to?: string;
      view?: BookingView;
    }) => {
      const listingId = patch.listingId !== undefined ? patch.listingId : filterListingId;
      const from = patch.from !== undefined ? patch.from : filterDateFrom;
      const to = patch.to !== undefined ? patch.to : filterDateTo;
      const nextView = patch.view !== undefined ? patch.view : view;
      if (patch.listingId !== undefined) setFilterListingId(patch.listingId);
      if (patch.from !== undefined) setFilterDateFrom(patch.from);
      if (patch.to !== undefined) setFilterDateTo(patch.to);
      if (patch.view !== undefined) setView(patch.view);
      const url = new URL(window.location.href);
      if (!listingId) url.searchParams.delete('listing');
      else url.searchParams.set('listing', listingId);
      if (!from) url.searchParams.delete('from');
      else url.searchParams.set('from', from);
      if (!to) url.searchParams.delete('to');
      else url.searchParams.set('to', to);
      if (nextView === 'all') url.searchParams.delete('view');
      else url.searchParams.set('view', nextView);
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    },
    [filterListingId, filterDateFrom, filterDateTo, view]
  );

  const setSelectedBookingId = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('booking', id);
    else url.searchParams.delete('booking');
    window.history.pushState({}, '', `${url.pathname}${url.search}`);
    setHighlightBookingId(id);
  }, []);

  const setOpsFilterAndUrl = useCallback((next: OpsFilter) => {
    setOpsFilter(next);
    if (next === 'refund_due' || next === 'unpaid' || next === 'cancel') setView('all');
    const url = new URL(window.location.href);
    if (next === 'all') url.searchParams.delete('ops');
    else url.searchParams.set('ops', next);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, []);

  const filteredBookings = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    const nowMs = Date.now();
    const rows = bookings.filter((b) => {
      if (!partnerBookingIsLiveTrip(b)) return false;
      const meta = listingMeta[b.listing_id];
      const isStay = meta?.family === 'stay' || bookingIsStayNight(b);
      const stayRange = isStay ? stayRangeFromBooking(b) : null;
      const experienceToday = scheduleTodayIsoForBooking(b, nowMs);
      const experienceTomorrow = addCalendarDaysYmd(experienceToday, 1) ?? experienceToday;
      if (view === 'today' || view === 'tomorrow') {
        const dayIso = view === 'today' ? experienceToday : experienceTomorrow;
        if (opsFilter === 'refund_due' || opsFilter === 'unpaid' || opsFilter === 'cancel') {
          /* Ops filters are money/hold/cancel work — not schedule-scoped. */
        } else if (!partnerBookingIsOperatingTrip(b)) {
          return false;
        } else if (stayRange) {
          if (!partnerStayTouchesScheduleDay(stayRange.checkIn, stayRange.checkOut, dayIso)) return false;
        } else if (b.booking_date !== dayIso) {
          return false;
        }
      }
      if (view === 'upcoming') {
        if (opsFilter === 'refund_due' || opsFilter === 'unpaid' || opsFilter === 'cancel') {
          /* keep */
        } else if (!partnerBookingIsOperatingTrip(b)) {
          return false;
        } else if (stayRange) {
          if (stayRange.checkIn <= experienceToday) return false;
        } else if (!b.booking_date || b.booking_date <= experienceToday) {
          return false;
        }
      }
      if (view === 'past') {
        if (opsFilter === 'refund_due' || opsFilter === 'unpaid' || opsFilter === 'cancel') {
          /* keep */
        } else if (!partnerBookingIsPastSchedule(b, experienceToday)) {
          return false;
        }
      }
      if (opsFilter === 'unpaid') {
        if (!partnerBookingIsUnpaidCheckout(b)) return false;
      }
      if (opsFilter === 'pickup') {
        const meta = listingMeta[b.listing_id];
        const snapMeeting = displayMeetingPointFromPurchase(b.purchase_snapshot, meta?.meetingPoint);
        const snapInstructions = displayPickupInstructionsFromPurchase(
          b.purchase_snapshot,
          meta?.pickupInstructions
        );
        if (
          !partnerBookingHasPickupAttention(
            b,
            snapMeeting,
            snapInstructions,
            isPurchaseSnapshot(b.purchase_snapshot) ? null : meta?.bookingOptions
          )
        )
          return false;
      }
      if (opsFilter === 'cancel') {
        if (!openCancels[b.id]) return false;
      }
      if (opsFilter === 'refund_due') {
        if (!isRefundDueBooking(b)) return false;
      }
      if (inventoryFamily === 'stay' && !isStay && b.id !== highlightBookingId) return false;
      if (inventoryFamily === 'tour' && isStay && b.id !== highlightBookingId) return false;
      if (filterListingId && b.listing_id !== filterListingId) return false;
      if (filterDateFrom || filterDateTo) {
        if (stayRange) {
          const nights = nightsOccupiedByStay(stayRange.checkIn, stayRange.checkOut);
          const overlapsFrom = !filterDateFrom || nights.some((n) => n >= filterDateFrom);
          const overlapsTo = !filterDateTo || nights.some((n) => n <= filterDateTo);
          if (!overlapsFrom || !overlapsTo) return false;
        } else {
          if (filterDateFrom && (!b.booking_date || b.booking_date < filterDateFrom)) return false;
          if (filterDateTo && (!b.booking_date || b.booking_date > filterDateTo)) return false;
        }
      }
      if (!q) return true;

      // Phase 1481: search must match purchased titles shown on rows, not live listing renames.
      // Phase 1484: search must match booking # shown on rows (admin 1053 parity).
      const title = displayListingTitleFromPurchase(
        b.purchase_snapshot,
        listingMeta[b.listing_id]?.title,
        ''
      ).toLowerCase();
      const idLower = b.id.toLowerCase();
      const guestName = (b.guest_name ?? '').toLowerCase();
      const guestEmail = (b.guest_email ?? '').toLowerCase();
      return (
        title.includes(q) ||
        partnerBookingNumberMatchesFilterQuery(q, b.booking_number) ||
        idLower.includes(q) ||
        guestName.includes(q) ||
        guestEmail.includes(q)
      );
    });
    if (opsFilter === 'unpaid') {
      rows.sort((a, b) => {
        const aLive = partnerBookingIsActiveUnpaidCheckout(a) ? 0 : 1;
        const bLive = partnerBookingIsActiveUnpaidCheckout(b) ? 0 : 1;
        if (aLive !== bLive) return aLive - bLive;
        return b.created_at.localeCompare(a.created_at);
      });
    } else {
      // Operational desk: same-day bookings cluster by departure time (multi-schedule).
      const pastFirst = view === 'past';
      rows.sort((a, b) =>
        comparePartnerBookingsOperational(
          {
            booking_date: a.booking_date,
            start_time_hm: a.start_time ? pgTimeToHm(a.start_time) ?? '' : '',
            created_at: a.created_at,
          },
          {
            booking_date: b.booking_date,
            start_time_hm: b.start_time ? pgTimeToHm(b.start_time) ?? '' : '',
            created_at: b.created_at,
          },
          { pastFirst }
        )
      );
    }
    return rows;
  }, [bookings, filterDateFrom, filterDateTo, filterListingId, filterQuery, listingMeta, view, opsFilter, openCancels, inventoryFamily, highlightBookingId]);

  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / BOOKINGS_PAGE_SIZE));
  const safePage = Math.min(Math.max(bookingsListPage, 1), totalPages);
  const paginatedBookings = useMemo(() => {
    const start = (safePage - 1) * BOOKINGS_PAGE_SIZE;
    return filteredBookings.slice(start, start + BOOKINGS_PAGE_SIZE);
  }, [filteredBookings, safePage]);
  const paginationItems = useMemo(() => bookingPaginationRange(totalPages, safePage), [safePage, totalPages]);

  useEffect(() => {
    setBookingsListPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  useEffect(() => {
    setBookingsListPage(1);
  }, [view, filterListingId, filterDateFrom, filterDateTo, filterQuery, opsFilter]);

  useEffect(() => {
    if (!highlightBookingId) return;
    const index = filteredBookings.findIndex((b) => b.id === highlightBookingId);
    if (index >= 0) {
      const targetPage = Math.floor(index / BOOKINGS_PAGE_SIZE) + 1;
      setBookingsListPage(targetPage);
      requestAnimationFrame(() => {
        document.getElementById(`supplier-booking-row-${highlightBookingId}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      });
      return;
    }
    // Deep-link must surface the booking even when an ops chip (Unpaid / Pickup / …) is active.
    setOpsFilter('all');
    setView('all');
    setFilterListingId('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterQuery('');
    const url = new URL(window.location.href);
    url.searchParams.delete('ops');
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, [filteredBookings, highlightBookingId]);

  const handleStatusChange = useCallback(
    async (
      booking: BookingRow,
      status: 'pending' | 'confirmed' | 'cancelled',
      options?: { cancellation_reason?: string; refund_choice?: RefundChoice }
    ) => {
      if (!canEditBookings) return;
      setUpdatingId(booking.id);
      const previousStatus = booking.status;
      const res = await updateBookingStatus(booking.id, status, options);
      if (res.ok) {
        if (status === 'cancelled' && previousStatus === 'confirmed' && booking.booking_date) {
          await decrementAvailabilityBooked(booking.listing_id, booking.booking_date, booking.guests ?? 1);
        }
        setBookings((prev) =>
          prev.map((b) =>
            b.id === booking.id
              ? {
                  ...b,
                  status,
                  cancellation_reason: options?.cancellation_reason ?? b.cancellation_reason,
                  refund_choice: options?.refund_choice ?? b.refund_choice,
                  cancelled_at: status === 'cancelled' ? new Date().toISOString() : b.cancelled_at,
                }
              : b
          )
        );
      } else {
        setCancelError(userFacingError(res.error, 'Could not update this booking.'));
      }
      setUpdatingId(null);
      if (res.ok && status === 'cancelled') {
        setCancelModal(null);
      }
    },
    [canEditBookings]
  );

  const handleRequestSupplierCancel = useCallback(async () => {
    if (!cancelModal || !canEditBookings || !partnerBookingIsOperatingTrip(cancelModal)) return;
    setCancelError(null);
    const explanation = cancelReasonText.trim();
    const minLen = isForceMajeureReason(cancelReason) ? 24 : 12;
    if (explanation.length < minLen) {
      setCancelError(
        isForceMajeureReason(cancelReason)
          ? 'Force majeure needs a clear explanation of why the trip cannot run.'
          : 'Explain what happened (at least a short sentence).'
      );
      return;
    }
    setUpdatingId(cancelModal.id);
    const res = await requestSupplierCancellation({
      bookingId: cancelModal.id,
      reasonCode: cancelReason,
      reasonText: explanation,
      evidenceNote: cancelEvidence.trim() || undefined,
    });
    setUpdatingId(null);
    if (!res.ok) {
      setCancelError(userFacingError(res.error, PARTNER_CANCEL_REQUEST_SUBMIT_ERROR));
      return;
    }
    const email = (cancelModal.guest_email ?? '').trim();
    if (email) {
      void notifyTravelerCancellationRequest({
        customerEmail: email,
        customerName: cancelModal.guest_name,
        listingTitle: displayListingTitleFromPurchase(
          cancelModal.purchase_snapshot,
          listingMeta[cancelModal.listing_id]?.title,
          'Booking'
        ),
        bookingId: cancelModal.id,
        bookingNumber: typeof cancelModal.booking_number === 'number' ? cancelModal.booking_number : undefined,
        bookingDate: cancelModal.booking_date,
        reasonLabel: supplierCancellationReasonLabel(cancelReason),
      });
    }
    setCancelModal(null);
    setCancelReasonText('');
    setCancelEvidence('');
    await load();
  }, [cancelModal, canEditBookings, cancelReason, cancelReasonText, cancelEvidence, listingMeta, load]);

  const handleAcknowledge = useCallback(
    async (booking: BookingRow) => {
      if (!canEditBookings || !partnerBookingIsOperatingTrip(booking)) return;
      setUpdatingId(booking.id);
      const ok = await acknowledgeBooking(booking.id);
      if (ok) {
        setBookings((prev) =>
          prev.map((b) => (b.id === booking.id ? { ...b, acknowledged_at: new Date().toISOString() } : b))
        );
      }
      setUpdatingId(null);
    },
    [canEditBookings]
  );

  const listingOptions = useMemo(
    () =>
      Object.entries(listingMeta)
        .filter(([, m]) => {
          if (!inventoryFamily) return true;
          return m.family === inventoryFamily;
        })
        .map(([id, m]) => ({
          id,
          title: partnerListingFilterLabelFromBookings(id, m.title, bookings),
        })),
    [listingMeta, inventoryFamily, bookings]
  );

  const selectedBooking = useMemo(
    () => (highlightBookingId ? bookings.find((b) => b.id === highlightBookingId) ?? null : null),
    [bookings, highlightBookingId]
  );

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        badge="Operate"
        title={inventoryFamily === 'stay' ? 'Reservations' : 'Bookings'}
        description={
          inventoryFamily === 'stay'
            ? 'Stay nights, guest names, payment truth, and actions that need a decision.'
            : 'Scan guests, products, dates, payment truth, and actions that need a decision.'
        }
        actions={
          bookings.length > 0 ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="tv-btn-ghost"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => downloadBookingsCsv(filteredBookings, listingMeta)}
              disabled={filteredBookings.length === 0}
              className="tv-btn-ghost disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden />
              Export
            </button>
          </div>
          ) : undefined
        }
      >
        {bookings.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-x-1 gap-y-2 border-b border-black/[0.06]" role="tablist" aria-label="Schedule">
            {([
              ['today', 'Today'],
              ['tomorrow', 'Tomorrow'],
              ['upcoming', 'Upcoming'],
              ['past', 'Past'],
              ['all', 'All'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={partnerBookingsTabId(id)}
                aria-controls={PARTNER_BOOKINGS_TABPANEL_ID}
                aria-selected={view === id}
                onClick={() => writeBookingsSearchToUrl({ view: id })}
                className={`lux-flat relative px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  view === id ? 'text-finland' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {label}
                {view === id ? (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-finland" aria-hidden />
                ) : null}
              </button>
            ))}
          </div>
        )}
        {bookings.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Operational filters">
            {([
              ['all', 'All states'],
              ['unpaid', 'Unpaid'],
              ...(inventoryFamily === 'stay' ? [] : [['pickup', 'Pickup details'] as const]),
              ['cancel', 'Cancellation'],
              ['refund_due', 'Refund due'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setOpsFilterAndUrl(id)}
                className={`lux-flat rounded-md px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${
                  opsFilter === id
                    ? id === 'cancel'
                      ? 'bg-rose-600 text-white ring-rose-600'
                      : id === 'unpaid' || id === 'pickup' || id === 'refund_due'
                        ? 'bg-amber-500 text-white ring-amber-500'
                        : 'bg-finland text-white ring-finland'
                    : 'bg-transparent text-ink-muted ring-black/[0.08] hover:text-ink hover:ring-black/[0.14]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </SupplierPageHero>

      {bookings.length > 0 && (
      <div className="mb-8">
        <button
          type="button"
          onClick={() => setShowSearch((v) => !v)}
          className="tv-btn-ghost -ml-2"
        >
          Search{filterQuery || filterListingId || filterDateFrom || filterDateTo ? ' · on' : ''}
        </button>
        {showSearch && (
        <div className="mt-4 space-y-4 motion-safe:animate-fade-in">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <div className="flex min-w-[min(100%,12rem)] flex-1 flex-col gap-1 sm:flex-none sm:min-w-[11rem]">
              <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Listing</label>
              <select
                value={filterListingId}
                onChange={(e) => writeBookingsSearchToUrl({ listingId: e.target.value })}
                className="tv-input"
              >
                <option value="">All listings</option>
                {listingOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Dates</label>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => writeBookingsSearchToUrl({ from: e.target.value })}
                  className="tv-input w-[9.25rem]"
                  aria-label="Activity date from"
                />
                <span className="shrink-0 text-sm text-ink-faint">–</span>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => writeBookingsSearchToUrl({ to: e.target.value })}
                  className="tv-input w-[9.25rem]"
                  aria-label="Activity date to"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
            <div className="flex min-w-[min(100%,14rem)] flex-1 flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Guest</label>
              <input
                type="search"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Name, email, or booking #"
                className="tv-input"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  writeBookingsSearchToUrl({ view: 'all', listingId: '', from: '', to: '' });
                  setOpsFilterAndUrl('all');
                  setFilterQuery('');
                  setBookingsListPage(1);
                }}
                className="tv-btn-ghost"
              >
                Clear
              </button>
              {!loading && (
                <span className="text-sm text-ink-muted">
                  {filteredBookings.length} of {bookings.length}
                </span>
              )}
            </div>
          </div>
        </div>
        )}
      </div>
      )}

      {error && (
        <ErrorState
          className="py-6"
          title="Bookings unavailable"
          body={userFacingError(error, USER_ERROR.bookings)}
          retry={{ onClick: () => void load() }}
          extra={
            <a href="/contact" className="tv-btn-ghost inline-flex">
              Contact support
            </a>
          }
        />
      )}
      {!error && cancelRequestsError ? (
        <div className="mb-5 max-w-lg">
          <NoticeCallout title="Cancellation status unavailable" tone="warn">
            <p>{cancelRequestsError}</p>
            <button type="button" onClick={() => void load()} className="tv-btn-ghost mt-3 -ml-2">
              Retry
            </button>
          </NoticeCallout>
        </div>
      ) : null}

      {loading && bookings.length === 0 ? (
        <div className="space-y-3 animate-fade-in-up" aria-busy="true" aria-label="Loading bookings">
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </div>
      ) : error ? null : bookings.length === 0 ? (
        <SupplierEmptyState
          icon={CalendarDays}
          title={inventoryFamily === 'stay' ? 'No reservations yet' : 'No bookings yet'}
          body={
            inventoryFamily === 'stay'
              ? 'No traveler has reserved a stay night yet. That is normal until a stay is live and someone checks out. When they do, reservations appear here.'
              : 'No traveler has booked your tours yet. That is normal until a listing is live and someone checks out. When they do, bookings appear here.'
          }
          action={
            <button
              type="button"
              onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`)}
              className="tv-btn-primary"
            >
              View listings
            </button>
          }
        />
      ) : (
        <div
          id={PARTNER_BOOKINGS_TABPANEL_ID}
          role="tabpanel"
          aria-labelledby={partnerBookingsTabId(view)}
        >
        {filteredBookings.length === 0 ? (
        <SupplierEmptyState
          icon={CalendarDays}
          title="Nothing in this view"
          body={
            opsFilter === 'unpaid'
              ? 'No unpaid checkouts match these filters. Live holds appear first when present; expired holds stay here until you clear them.'
              : view === 'tomorrow'
                ? 'No tours or stays on tomorrow’s schedule. Switch to Upcoming or All to see the rest.'
                : view === 'today'
                  ? 'Nothing on today’s schedule. Check Tomorrow or Upcoming if guests are arriving later.'
                  : 'You have bookings, but none match this tab, date range, or search. That is a filter — not a missing page.'
          }
          action={
            view === 'today' || view === 'tomorrow' ? (
              <button
                type="button"
                onClick={() => writeBookingsSearchToUrl({ view: 'all' })}
                className="tv-btn-secondary"
              >
                Show all bookings
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4" aria-busy={loading || undefined}>
          <div className="space-y-3">
            {paginatedBookings.map((booking) => {
              const opsStartHm = booking.start_time ? pgTimeToHm(booking.start_time) ?? null : null;
              const dep = partnerOpsDepartureDisplay(booking.purchase_snapshot, opsStartHm);
              const startHm = dep.displayHm || null;
              const meta = listingMeta[booking.listing_id];
              const liveOptionLabel =
                booking.booking_option_id && meta?.bookingOptions?.length
                  ? meta.bookingOptions.find((o) => o.id === booking.booking_option_id)?.name?.trim() || ''
                  : '';
              const optionLabel = displayOptionLabelFromPurchase(
                booking.purchase_snapshot,
                liveOptionLabel
              );
              const listingTitle = displayListingTitleFromPurchase(
                booking.purchase_snapshot,
                meta?.title,
                meta?.family === 'stay' ? 'Stay' : 'Tour'
              );
              const liveMeeting =
                booking.booking_option_id && meta?.bookingOptions?.length
                  ? meta.bookingOptions.find((o) => o.id === booking.booking_option_id)?.pickupPlace?.trim() ||
                    meta?.meetingPoint ||
                    ''
                  : meta?.meetingPoint || '';
              const rowMeeting = displayMeetingPointFromPurchase(
                booking.purchase_snapshot,
                liveMeeting
              );
              const rowPickupInstructions = displayPickupInstructionsFromPurchase(
                booking.purchase_snapshot,
                meta?.pickupInstructions
              );
              const stayRangeForChip =
                meta?.family === 'stay' || bookingIsStayNight(booking)
                  ? stayRangeFromBooking(booking)
                  : null;
              const stayOut = stayRangeForChip?.checkOut ?? null;
              const experienceToday = scheduleTodayIsoForBooking(booking);
              const scheduleDayIso =
                view === 'today'
                  ? experienceToday
                  : view === 'tomorrow'
                    ? addCalendarDaysYmd(experienceToday, 1)
                    : null;
              const stayDayChip =
                stayRangeForChip && scheduleDayIso
                  ? stayRangeForChip.checkIn === scheduleDayIso
                    ? 'In'
                    : stayRangeForChip.checkOut === scheduleDayIso
                      ? 'Out'
                      : 'Stay'
                  : null;
              const dateLine = stayOut
                ? `${formatStayNightHuman(booking.booking_date ?? '')} → ${formatStayNightHuman(stayOut)}`
                : formatActivityDateLong(booking.booking_date, startHm);
              const paidLabel = formatBookingMoney(booking.amount_paid, booking.currency);
              const needsAck = partnerBookingNeedsLook(booking);
              const pickupGap = partnerBookingHasPickupAttention(
                booking,
                rowMeeting,
                rowPickupInstructions,
                isPurchaseSnapshot(booking.purchase_snapshot) ? null : meta?.bookingOptions
              );
              const openCancel = openCancels[booking.id];
              const pay = (booking.payment_status ?? '').trim().toLowerCase();
              const statusAccent =
                openCancel || pickupGap || needsAck
                  ? 'border-l-[3px] border-l-amber-500'
                  : booking.status === 'cancelled' || pay === 'refunded'
                    ? 'border-l-[3px] border-l-slate-400'
                    : booking.status === 'confirmed' || pay === 'paid'
                      ? 'border-l-[3px] border-l-emerald-500'
                      : 'border-l-[3px] border-l-amber-400';
              return (
                <article
                  key={booking.id}
                  id={`supplier-booking-row-${booking.id}`}
                  className={`overflow-hidden rounded-lg border border-black/[0.06] bg-paper ${statusAccent} ${
                    highlightBookingId === booking.id ? 'ring-1 ring-finland/35' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedBookingId(booking.id)}
                    className="lux-flat flex w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left"
                  >
                    {meta?.imageUrl ? (
                      <img
                        src={meta.imageUrl}
                        alt=""
                        className="h-12 w-12 rounded-lg object-cover shrink-0 ring-1 ring-black/[0.06]"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-finland/10 shrink-0 ring-1 ring-finland/15" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 break-words text-sm font-semibold text-ink [overflow-wrap:anywhere] line-clamp-2">
                          {booking.guest_name || 'Guest'}
                        </p>
                        <span className="text-[11px] font-medium text-ink-muted shrink-0">{partnerPaymentLabel(booking)}</span>
                      </div>
                      <p className="mt-0.5 break-words text-xs text-ink-muted [overflow-wrap:anywhere] line-clamp-2">
                        {listingTitle}
                        {optionLabel ? ` · ${optionLabel}` : ''}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {typeof booking.booking_number === 'number' && booking.booking_number > 0 ? (
                          <>
                            <span className="font-mono text-finland font-semibold tracking-wide">
                              #{booking.booking_number}
                            </span>
                            {' · '}
                          </>
                        ) : null}
                        {stayDayChip ? (
                          <>
                            <span className="font-semibold text-finland">{stayDayChip}</span>
                            {' · '}
                          </>
                        ) : null}
                        {dateLine}
                        {dep.purchasedNote ? ` · ${dep.purchasedNote}` : ''}
                        {' · '}
                        {formatBookingParticipantsLabel(booking)}
                        {meta?.family === 'stay' || bookingIsStayNight(booking)
                          ? (() => {
                              const range = stayRangeFromBooking(booking);
                              if (!range) return '';
                              const n = nightsOccupiedByStay(range.checkIn, range.checkOut).length;
                              return n > 0 ? ` · ${n} night${n === 1 ? '' : 's'}` : '';
                            })()
                          : ''}
                        {paidLabel ? ` · ${paidLabel}` : ''}
                      </p>
                      {partnerBookingIsUnpaidCheckout(booking) ? (
                        <p
                          className={`mt-1 text-xs font-medium ${
                            partnerUnpaidCheckoutHoldsInventory(booking) ? 'text-amber-900' : 'text-ink-faint'
                          }`}
                        >
                          {formatPartnerCheckoutHoldLabel(booking)}
                        </p>
                      ) : null}
                      {needsAck ? (
                        <p className="mt-1 text-xs font-medium text-finland">Needs a look</p>
                      ) : null}
                      {pickupGap ? (
                        <p className="mt-1 text-xs font-medium text-amber-800">Pickup details missing</p>
                      ) : null}
                      {openCancel ? (
                        <p className="mt-1 text-xs font-medium text-red-800">Awaiting traveler cancellation response</p>
                      ) : null}
                    </div>
                    <span className="tv-btn-ghost shrink-0 pointer-events-none inline-flex text-xs sm:text-sm">
                      Open
                    </span>
                  </button>
                </article>
              );
            })}

          </div>

          <nav
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            aria-label="Bookings pages"
          >
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">
                {(safePage - 1) * BOOKINGS_PAGE_SIZE + 1}-
                {(safePage - 1) * BOOKINGS_PAGE_SIZE + paginatedBookings.length}
              </span>{' '}
              of {filteredBookings.length}
              {totalPages > 1 ? ` · Page ${safePage} of ${totalPages}` : ''}
            </p>
            {totalPages > 1 ? (
              <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setBookingsListPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="tv-btn-ghost min-h-[40px] min-w-[40px] p-0 disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                {paginationItems.map((item, index) =>
                  item === 'ellipsis' ? (
                    <span key={`ellipsis-${index}`} className="select-none px-1.5 text-sm text-ink-faint" aria-hidden>
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setBookingsListPage(item)}
                      className={`min-h-[40px] min-w-[40px] rounded-lg text-sm font-semibold tabular-nums ${
                        item === safePage
                          ? 'bg-finland text-white shadow-sm'
                          : 'border border-black/[0.08] text-ink hover:bg-paper'
                      }`}
                      aria-label={`Page ${item}`}
                      aria-current={item === safePage ? 'page' : undefined}
                    >
                      {item}
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => setBookingsListPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="tv-btn-ghost min-h-[40px] min-w-[40px] p-0 disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            ) : null}
          </nav>
        </div>
      )}
        </div>
      )}

      {selectedBooking && (
        <SupplierModalShell onClose={() => setSelectedBookingId(null)} maxWidth="lg">
          {(() => {
            const booking = selectedBooking;
            const opsStartHm = booking.start_time ? pgTimeToHm(booking.start_time) ?? null : null;
            const dep = partnerOpsDepartureDisplay(booking.purchase_snapshot, opsStartHm);
            const startHm = dep.displayHm || null;
            const pickupHm = booking.pickup_time ? pgTimeToHm(booking.pickup_time) ?? null : null;
            const meta = listingMeta[booking.listing_id];
            const isStay = meta?.family === 'stay' || bookingIsStayNight(booking);
            const liveOptionLabel =
              booking.booking_option_id && meta?.bookingOptions?.length
                ? meta.bookingOptions.find((o) => o.id === booking.booking_option_id)?.name?.trim() || ''
                : '';
            const listingTitle = displayListingTitleFromPurchase(
              booking.purchase_snapshot,
              meta?.title,
              isStay ? 'Stay' : 'Tour'
            );
            const optionLabel = displayOptionLabelFromPurchase(
              booking.purchase_snapshot,
              liveOptionLabel
            );
            const liveMeeting =
              booking.booking_option_id && meta?.bookingOptions?.length
                ? meta.bookingOptions.find((o) => o.id === booking.booking_option_id)?.pickupPlace?.trim() ||
                  meta?.meetingPoint ||
                  ''
                : meta?.meetingPoint || '';
            const meetingPoint = displayMeetingPointFromPurchase(
              booking.purchase_snapshot,
              liveMeeting
            );
            const pickupInstructions = displayPickupInstructionsFromPurchase(
              booking.purchase_snapshot,
              meta?.pickupInstructions
            );
            const fulfillment = displayFulfillmentFromPurchase(booking.purchase_snapshot);
            const purchasedDuration = displayDurationFromPurchase(
              booking.purchase_snapshot,
              meta?.duration ?? null
            );
            const placePrefix = fulfillment === 'pickup' ? 'Pickup' : 'Meet';
            const stayRange = isStay ? stayRangeFromBooking(booking) : null;
            const stayOut = stayRange?.checkOut ?? null;
            const stayNightCount = stayRange
              ? nightsOccupiedByStay(stayRange.checkIn, stayRange.checkOut).length
              : 0;
            const whenLabel = stayOut
              ? `${formatStayNightHuman(booking.booking_date ?? '')} → ${formatStayNightHuman(stayOut)}`
              : formatActivityDateLong(booking.booking_date, startHm);
            const paidLabel = formatBookingMoney(booking.amount_paid, booking.currency);
            const needsAck = partnerBookingNeedsLook(booking);
            const pickupGap =
              !isStay &&
              partnerBookingHasPickupAttention(
                booking,
                meetingPoint,
                pickupInstructions,
                isPurchaseSnapshot(booking.purchase_snapshot) ? null : meta?.bookingOptions
              );
            const busy = updatingId === booking.id;
            const refLabel =
              typeof booking.booking_number === 'number' && booking.booking_number > 0
                ? `#${booking.booking_number}`
                : booking.id.slice(0, 8);
            return (
              <>
                <SupplierModalHeader
                  icon={Users}
                  title={booking.guest_name || 'Guest'}
                  subtitle={`${listingTitle} · ${refLabel}`}
                  onClose={() => setSelectedBookingId(null)}
                />
                <div className="space-y-4 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    {meta?.imageUrl ? (
                      <img
                        src={meta.imageUrl}
                        alt=""
                        className="h-14 w-14 sm:h-16 sm:w-16 rounded-lg object-cover shrink-0 ring-1 ring-black/[0.06]"
                      />
                    ) : (
                      <div
                        className="h-14 w-14 sm:h-16 sm:w-16 rounded-lg bg-black/[0.04] shrink-0 ring-1 ring-black/[0.06]"
                        aria-hidden
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${bookingStatusClass(booking.status, booking.payment_status)}`}>
                        {partnerPaymentLabel(booking)}
                      </span>
                      <p className="mt-1.5 break-words text-sm font-semibold text-ink [overflow-wrap:anywhere] line-clamp-2">
                        {listingTitle}
                      </p>
                      {optionLabel ? (
                        <p className="mt-0.5 break-words text-xs text-ink-muted [overflow-wrap:anywhere] line-clamp-2">
                          {optionLabel}
                        </p>
                      ) : null}
                      {meetingPoint && !isStay ? (
                        <p className="mt-0.5 break-words text-xs text-ink-muted [overflow-wrap:anywhere] line-clamp-2">
                          {placePrefix} · {meetingPoint}
                        </p>
                      ) : null}
                      {meta ? (
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-ink-muted">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                            {meta.location}
                          </span>
                          {!isStay && purchasedDuration ? (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3 shrink-0" aria-hidden />
                              {purchasedDuration}
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
                    {isStay && stayOut ? (
                      <>
                        <div>
                          <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                            Check-in
                          </dt>
                          <dd className="mt-0.5 text-ink">{formatStayNightHuman(booking.booking_date ?? '')}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                            Check-out
                          </dt>
                          <dd className="mt-0.5 text-ink">{formatStayNightHuman(stayOut)}</dd>
                        </div>
                      </>
                    ) : (
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">When</dt>
                        <dd className="mt-0.5 text-ink">{whenLabel}</dd>
                        {dep.purchasedNote ? (
                          <dd className="mt-0.5 text-xs text-ink-muted">{dep.purchasedNote}</dd>
                        ) : null}
                      </div>
                    )}
                    <div>
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                        {isStay ? 'Guests' : 'Participants'}
                      </dt>
                      <dd className="mt-0.5 text-ink">{formatBookingParticipantsLabel(booking)}</dd>
                    </div>
                    {isStay && stayNightCount > 0 ? (
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Nights</dt>
                        <dd className="mt-0.5 text-ink tabular-nums">
                          {stayNightCount} night{stayNightCount === 1 ? '' : 's'}
                        </dd>
                      </div>
                    ) : null}
                    {isStay &&
                    (() => {
                      const inT = displayStayCheckInTimeFromPurchase(
                        booking.purchase_snapshot,
                        meta?.stayCheckInTime
                      );
                      const outT = displayStayCheckOutTimeFromPurchase(
                        booking.purchase_snapshot,
                        meta?.stayCheckOutTime
                      );
                      if (!inT && !outT) return null;
                      return (
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                          House times
                        </dt>
                        <dd className="mt-0.5 text-ink">
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
                    {isStay &&
                    displayCheckInAddressFromPurchase(
                      booking.purchase_snapshot,
                      booking.payment_status
                    ) ? (
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                          Check-in address (when booked)
                        </dt>
                        <dd className="mt-0.5 break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-ink">
                          {displayCheckInAddressFromPurchase(
                            booking.purchase_snapshot,
                            booking.payment_status
                          )}
                        </dd>
                      </div>
                    ) : null}
                    {isStay && displayStayHouseRulesFromPurchase(booking.purchase_snapshot) ? (
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                          House rules (when booked)
                        </dt>
                        <dd className="mt-0.5 break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-ink">
                          {displayStayHouseRulesFromPurchase(booking.purchase_snapshot)}
                        </dd>
                      </div>
                    ) : null}
                    {!isStay && pickupHm ? (
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Pickup</dt>
                        <dd className="mt-0.5 text-ink">{pickupHm}</dd>
                      </div>
                    ) : null}
                    {paidLabel ? (
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                          {partnerCollectedAmountCaption(booking)}
                        </dt>
                        <dd className="mt-0.5 text-ink">{paidLabel}</dd>
                      </div>
                    ) : null}
                    {booking.guest_email ? (
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Contact</dt>
                        <dd className="mt-0.5">
                          <a
                            href={`mailto:${booking.guest_email}`}
                            className="inline-flex max-w-full items-center gap-1.5 break-all text-finland hover:underline [overflow-wrap:anywhere]"
                          >
                            <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {booking.guest_email}
                          </a>
                        </dd>
                      </div>
                    ) : null}
                    {guestFacingBookingNotes(booking.special_requests) ? (
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Notes</dt>
                        <dd className="mt-0.5 break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-ink">{guestFacingBookingNotes(booking.special_requests)}</dd>
                      </div>
                    ) : null}
                  </dl>

                  {isStay ? (
                    <button
                      type="button"
                      className="tv-btn-ghost -ml-2"
                      onClick={() =>
                        navigateSupplierUrl(
                          `${PARTNER_APP_BASE}/calendar?listing=${encodeURIComponent(booking.listing_id)}`
                        )
                      }
                    >
                      Open stay calendar
                    </button>
                  ) : null}

                  {pickupGap ? (
                    <NoticeCallout title="Pickup details missing" tone="warn">
                      <p>
                        Add a pickup time or complete listing meeting/pickup notes so guests know where to be.
                      </p>
                      <button
                        type="button"
                        className="mt-2 text-sm font-semibold text-finland hover:underline"
                        onClick={() => openSupplierPickup(booking.id)}
                      >
                        Open Pickup planner
                      </button>
                    </NoticeCallout>
                  ) : null}

                  {canEditBookings && partnerBookingIsOperatingTrip(booking) ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {booking.status === 'pending' ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleStatusChange(booking, 'confirmed')}
                          className="inline-flex items-center gap-1.5 rounded-full bg-finland px-4 py-2 text-sm font-semibold text-white hover:bg-finland-dark disabled:opacity-50"
                        >
                          <CheckCircle className="h-4 w-4" aria-hidden />
                          {busy ? 'Saving…' : 'Confirm'}
                        </button>
                      ) : null}
                      {needsAck ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleAcknowledge(booking)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-paper px-4 py-2 text-sm font-semibold text-ink ring-1 ring-black/[0.08] hover:bg-paper-raised disabled:opacity-50"
                        >
                          {busy ? 'Saving…' : 'Acknowledge'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy || Boolean(openCancels[booking.id])}
                        onClick={() => {
                          setCancelError(null);
                          setCancelReasonText('');
                          setCancelEvidence('');
                          setCancelModal(booking);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        {openCancels[booking.id] ? 'Awaiting traveler' : 'Request cancellation'}
                      </button>
                    </div>
                  ) : null}
                  {canEditBookings && partnerBookingIsUnpaidCheckout(booking) ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <NoticeCallout
                        title={
                          partnerUnpaidCheckoutHoldsInventory(booking)
                            ? 'Checkout hold still open'
                            : 'Hold expired'
                        }
                        tone={partnerUnpaidCheckoutHoldsInventory(booking) ? 'warn' : 'info'}
                      >
                        {partnerUnpaidCheckoutHoldsInventory(booking)
                          ? `${formatPartnerCheckoutHoldLabel(booking)}. The traveler may still complete payment. Cancelling releases this hold.`
                          : 'Inventory is already released. Clear this row if you no longer need it — this does not free additional spots.'}
                      </NoticeCallout>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setCancelError(null);
                          setCancelReasonText('');
                          setCancelEvidence('');
                          setCancelModal(booking);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        {partnerUnpaidCheckoutHoldsInventory(booking) ? 'Cancel unpaid' : 'Clear expired hold'}
                      </button>
                    </div>
                  ) : null}
                  {openCancels[booking.id] ? (
                    <NoticeCallout
                      title={
                        openCancels[booking.id]!.expires_at &&
                        new Date(openCancels[booking.id]!.expires_at!).getTime() < Date.now()
                          ? 'Review window passed — still waiting'
                          : 'Waiting for the traveler'
                      }
                      tone="warn"
                    >
                      Requested{' '}
                      {new Date(openCancels[booking.id]!.created_at).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                      {openCancels[booking.id]!.expires_at
                        ? ` · noted until ${new Date(openCancels[booking.id]!.expires_at!).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}`
                        : ''}
                      . The booking stays active until the traveler accepts. Traverion does not auto-cancel if they do
                      not respond. {PARTNER_CANCELLATION_REQUEST_DELIVERY_NOTE}
                    </NoticeCallout>
                  ) : null}
                  {partnerPaymentLabel(booking) === 'Refund due' ? (
                    <div className="rounded-lg border border-black/[0.06] border-l-[3px] border-l-amber-500 bg-paper px-3.5 py-3">
                      <p className="text-sm font-semibold text-ink">Refund due</p>
                      <p className="mt-1 text-xs text-ink-muted leading-snug">{REFUND_DUE_MANUAL_COPY}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBookingId(null);
                          navigateSupplierUrl(`${PARTNER_APP_BASE}/money`);
                        }}
                        className="mt-2 text-xs font-semibold text-finland hover:underline"
                      >
                        Open Money
                      </button>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint mb-2">History</p>
                    <ol className="space-y-1.5 text-sm text-ink-muted">
                      <li>
                        Booked{' '}
                        {booking.created_at
                          ? new Date(booking.created_at).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })
                          : ''}
                      </li>
                      {bookingPaymentWasCollected(booking.payment_status) ? (
                        <li>Paid</li>
                      ) : null}
                      {booking.acknowledged_at ? (
                        <li>
                          Acknowledged{' '}
                          {new Date(booking.acknowledged_at).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </li>
                      ) : null}
                      {pickupHm && !isStay ? <li>Pickup set · {pickupHm}</li> : null}
                      {openCancels[booking.id] ? (
                        <li>
                          Cancellation requested{' '}
                          {new Date(openCancels[booking.id]!.created_at).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </li>
                      ) : null}
                      {booking.status === 'cancelled' ? <li>Cancelled</li> : null}
                      {partnerPaymentLabel(booking) === 'Refund due' ? <li>Refund due</li> : null}
                      {partnerPaymentLabel(booking) === 'No refund' ? <li>No refund</li> : null}
                      {booking.payment_status === 'refunded' ? <li>Refunded</li> : null}
                    </ol>
                  </div>
                  <BookingMessageThread
                    bookingId={booking.id}
                    canCompose={bookingAllowsMessaging({
                      status: booking.status,
                      payment_status: booking.payment_status,
                      openCancellation: Boolean(openCancels[booking.id]),
                    })}
                    composeBlock={
                      messagingComposeBlock({
                        status: booking.status,
                        payment_status: booking.payment_status,
                        openCancellation: Boolean(openCancels[booking.id]),
                      }) === 'closed'
                        ? 'closed'
                        : 'unpaid'
                    }
                    viewerRole="supplier"
                    listingTitle={listingTitle}
                    listingId={booking.listing_id}
                    supplierId={user?.id}
                    customerEmail={booking.guest_email}
                    customerName={booking.guest_name}
                    bookingNumber={typeof booking.booking_number === 'number' ? booking.booking_number : undefined}
                    bookingDate={booking.booking_date}
                  />
                  <button
                    type="button"
                    className="mt-2 text-sm font-semibold text-finland hover:underline"
                    onClick={() => openSupplierInbox(booking.id)}
                  >
                    Open in Inbox
                  </button>
                </div>
              </>
            );
          })()}
        </SupplierModalShell>
      )}

      {cancelModal && partnerBookingShowsCancelAction(cancelModal) && (
        <SupplierModalShell onClose={() => setCancelModal(null)} maxWidth="md">
          <SupplierModalHeader
            icon={Trash2}
            title={isPaidPaymentStatus(cancelModal.payment_status) ? 'Request cancellation' : 'Cancel unpaid booking'}
            subtitle={
              isPaidPaymentStatus(cancelModal.payment_status)
                ? 'The traveler must accept before this booking is cancelled.'
                : 'This booking is not paid. Cancelling releases the hold immediately.'
            }
            onClose={() => setCancelModal(null)}
          />
          <div className="space-y-3.5 p-4 sm:p-5">
            {isPaidPaymentStatus(cancelModal.payment_status) ? (
              <>
                <div className="rounded-lg border border-black/[0.06] border-l-[3px] border-l-rose-500 bg-paper px-3.5 py-3">
                  <p className="text-sm font-semibold text-ink">{PARTNER_CANCEL_REQUEST_CONSEQUENCES_TITLE}</p>
                  <p className="mt-1 text-xs text-ink-muted leading-snug">{PARTNER_CANCEL_REQUEST_REFUND_POLICY}</p>
                  <p className="mt-1.5 text-xs text-ink">
                    Fee:{' '}
                    <span className="font-semibold tabular-nums">
                      {supplierCancellationFeeEur(cancelReason) === 0
                        ? '€0 (force majeure / restriction)'
                        : `€${supplierCancellationFeeEur(cancelReason).toFixed(0)} (supplier-responsibility)`}
                    </span>
                    {' · '}
                    {supplierCancellationReasonLabel(cancelReason)}. {PARTNER_CANCEL_REQUEST_FEE_TIMING_NOTE}
                  </p>
                  {isForceMajeureReason(cancelReason) ? (
                    <p className="mt-1 text-xs text-amber-900">
                      Force majeure is audited. Explain clearly — this is not an automatic fee waiver.
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-ink-faint" htmlFor="cancel-reason-code">
                    Reason
                  </label>
                  <select
                    id="cancel-reason-code"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className="tv-input"
                  >
                    {CANCELLATION_REASONS.map((reason) => (
                      <option key={reason.id} value={reason.id}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink" htmlFor="cancel-reason-text">
                    Explanation
                  </label>
                  <textarea
                    id="cancel-reason-text"
                    value={cancelReasonText}
                    onChange={(e) => setCancelReasonText(e.target.value)}
                    rows={4}
                    className="tv-input min-h-[6rem]"
                    placeholder="What happened, and why the traveler cannot take this booking."
                  />
                </div>
                {isForceMajeureReason(cancelReason) ? (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-ink" htmlFor="cancel-evidence">
                      Evidence note (optional)
                    </label>
                    <textarea
                      id="cancel-evidence"
                      value={cancelEvidence}
                      onChange={(e) => setCancelEvidence(e.target.value)}
                      rows={2}
                      className="tv-input"
                      placeholder="Weather warning, official restriction, or other note for the record."
                    />
                  </div>
                ) : null}
                {cancelError ? <p className="text-sm text-red-700">{cancelError}</p> : null}
                <p className="text-xs text-ink-faint">
                  Policy {snapshotSupplierCancellationPolicy(cancelReason).policy_id}. Traverion does not auto-accept if
                  the traveler does not respond. {PARTNER_CANCELLATION_REQUEST_DELIVERY_NOTE}
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setCancelModal(null)} className="tv-btn-ghost">
                    Keep booking
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRequestSupplierCancel()}
                    disabled={
                      updatingId === cancelModal.id ||
                      !canEditBookings ||
                      cancelReasonText.trim().length < (isForceMajeureReason(cancelReason) ? 24 : 12)
                    }
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {updatingId === cancelModal.id ? 'Submitting…' : 'Submit request to traveler'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-900">
                  Cancel unpaid booking{' '}
                  <span className="font-semibold">
                    {typeof cancelModal.booking_number === 'number' ? `#${cancelModal.booking_number}` : 'this hold'}
                  </span>
                  . No traveler refund is due because payment is not complete.
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setCancelModal(null)} className="tv-btn-ghost">
                    Keep booking
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleStatusChange(cancelModal, 'cancelled', {
                        cancellation_reason: 'unpaid_release',
                        refund_choice: 'no_refund',
                      })
                    }
                    disabled={updatingId === cancelModal.id || !canEditBookings}
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Release hold
                  </button>
                </div>
              </>
            )}
          </div>
        </SupplierModalShell>
      )}
    </div>
  );
}
