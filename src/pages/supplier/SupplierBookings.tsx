import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Mail,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Users,
  CalendarDays,
} from 'lucide-react';
import type { TourPackage } from '../../types/tour';
import { listingHeroImageSrc, orderedPhotoUrls, photoSlotsFromTourPackage } from '../../lib/listingPhotoGrid';
import { formatMoney, normalizeCurrency } from '../../lib/money';
import { fetchBookingCommercialSnapshot, type BookingCommercialSnapshotRow } from '../../data/supabase-earnings';
import { isPaidPaymentStatus, partnerPaymentLabel, partnerCollectedAmountCaption, bookingPaymentWasCollected, REFUND_DUE_MANUAL_COPY } from '../../lib/payment-states';
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
import { openHostCancelRequestVisible } from '../../lib/host-cancel-request-visibility';
import {
  fetchCancellationRequestsForBookings,
  notifyTravelerCancellationRequest,
  requestSupplierCancellation,
  type CancellationRequestRow,
} from '../../data/supabase-booking-ops';
import PartnerSelect from '../../components/supplier/PartnerSelect';
import NoticeCallout from '../../components/NoticeCallout';
import { PARTNER_CANCELLATION_REQUEST_DELIVERY_NOTE, PARTNER_CANCEL_REQUEST_REFUND_POLICY, PARTNER_CANCEL_REQUEST_SUBMIT_ERROR, PARTNER_CANCEL_REQUEST_CONSEQUENCES_TITLE, PARTNER_CANCEL_REQUEST_FEE_TIMING_NOTE } from '../../lib/booking-confirmation-copy';
import { SkeletonListItem } from '../../components/ui/Skeleton';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import {
  SUPPLIER_PAGE_CLASS,
  SupplierDetailDrawer,
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
import StayRequestActions from '../../components/StayRequestActions';
import StayOpsReservationCard from '../../components/supplier/StayOpsReservationCard';
import { isStayRequestAwaitingHost } from '../../lib/stay-request-approval';
import { insertSupplierExportRun } from '../../data/supabase-supplier-campaigns-exports';
import { decrementAvailabilityBooked } from '../../data/supabase-availability';
import { fetchMyListings, pgTimeToHm } from '../../data/supabase-listings';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings, canManageFinance } from '../../lib/supplierTeamRoles';
import { navigateSupplierUrl, openSupplierInbox, openSupplierPickup } from '../../lib/supplierPortalNavigation';
import { partnerBookingDeskPathPreservingSearch } from '../../lib/partner-booking-desk-path';
import { PARTNER_APP_BASE, PARTNER_CREATE_PATH, PARTNER_RESERVATIONS_PATH } from '../../lib/partnerPortalPaths';
import { inventoryFamilyFromListing } from '../../lib/inventory';
import { nightsOccupiedByStay, stayRangeFromBooking } from '../../lib/stayOccupancy';
import {
  stayPaidAdjacentNightCount,
} from '../../lib/booking-confirmation-copy';
import { partnerBookingIsLiveTrip, partnerBookingIsOperatingTrip, partnerBookingNeedsLook, partnerBookingIsUnpaidCheckout, partnerBookingShowsCancelAction, scheduleTodayIsoForBooking } from '../../lib/trip-views';
import { addCalendarDaysYmd } from '../../lib/booking-lifecycle-calendar';
import { formatPartnerCheckoutHoldLabel, partnerUnpaidCheckoutHoldsInventory } from '../../lib/booking-hold';
import { formatStayNightHuman } from '../../lib/stay-calendar';
import { formatBookingDateDisplay } from '../../lib/booking-flow';
import { bookingIsStayNight, partnerBookingHasPickupAttention, resolvePartnerPickupCopy } from '../../lib/pickup-completeness';
import { travelerPickupAddressFromRecord } from '../../lib/pickup-area';
import { parseListingExtras, materializedBookingOptions } from '../../types/listingExtras';
import {
  applyPartnerBookingsDesk,
  partnerBookingLifecycleLabel,
  PARTNER_BOOKINGS_SORTS,
  PARTNER_BOOKINGS_TRAVEL,
  type PartnerBookingsOps,
  type PartnerBookingsPaymentFilter,
  type PartnerBookingsSort,
  type PartnerBookingsTravelWindow,
} from '../../lib/partner-bookings-desk';
import { travelerPublicBookingReference } from '../../lib/public-booking-reference';
import { fetchSupplierBookingEvents, type SupplierBookingEventRow } from '../../data/supabase-booking-events';
import { displayListingTitleFromPurchase, displayOptionLabelFromPurchase, displayFulfillmentFromPurchase, displayDurationFromPurchase, displayStayCheckInTimeFromPurchase, displayStayCheckOutTimeFromPurchase, displayCheckInAddressFromPurchase, displayStayHouseRulesFromPurchase, partnerOpsDepartureDisplay, isPurchaseSnapshot, partnerListingFilterLabelFromBookings, type PurchaseSnapshot } from '../../lib/purchase-snapshot';
import { optionLogisticsLines, readOptionLogistics } from '../../lib/option-logistics';
import SavedStayPrice from '../../components/booking/SavedStayPrice';
import { readStayBookingPrice } from '../../lib/stay-price';

const BOOKINGS_PAGE_SIZE = 20;

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

/** Minor units from booking_commercial_snapshots. Includes zero. Does not invent a rate. */
function formatSnapshotMinor(minor: number, currency: string): string {
  const major = Math.round(Number(minor)) / 100;
  const code = normalizeCurrency(currency);
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(major) ? major : 0);
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
type BookingView = PartnerBookingsTravelWindow;
type OpsFilter = PartnerBookingsOps;

const PARTNER_BOOKINGS_LIST_ID = 'partner-bookings-list';

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

function readTravelWindow(raw: string | null): PartnerBookingsTravelWindow {
  if (raw === 'today' || raw === 'tomorrow' || raw === 'upcoming' || raw === 'past' || raw === 'range' || raw === 'all') {
    return raw;
  }
  return 'all';
}

function readSort(raw: string | null): PartnerBookingsSort {
  if (
    raw === 'oldest' ||
    raw === 'travel_asc' ||
    raw === 'travel_desc' ||
    raw === 'value_asc' ||
    raw === 'value_desc' ||
    raw === 'newest'
  ) {
    return raw;
  }
  return 'newest';
}

function bookingReferenceLabel(booking: BookingRow): string {
  return (
    travelerPublicBookingReference(booking.public_reference) ||
    (typeof booking.booking_number === 'number' && booking.booking_number > 0
      ? `#${booking.booking_number}`
      : booking.id.slice(0, 8))
  );
}

function formatActivityDateLong(bookingDate: string | null, startHm: string | null): string {
  if (!bookingDate) return 'No activity date';
  const datePart = formatBookingDateDisplay(bookingDate);
  if (!datePart) return 'No activity date';
  return startHm ? `${datePart} · ${startHm}` : datePart;
}

/** Booking creation time — not the activity or stay date. */
function formatPurchaseDate(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Customer booking total from the checkout snapshot, otherwise the collected amount. */
function customerBookingTotal(booking: BookingRow): string | null {
  const snap = isPurchaseSnapshot(booking.purchase_snapshot) ? booking.purchase_snapshot : null;
  const quoted =
    snap && typeof snap.totalAmount === 'number' && Number.isFinite(snap.totalAmount) && snap.totalAmount > 0
      ? snap.totalAmount
      : null;
  return formatBookingMoney(quoted ?? booking.amount_paid, (quoted != null ? snap?.currency : null) || booking.currency);
}

/** Phone is stored as a structured note line, not a booking column. */
function guestPhoneFromNotes(raw: string | null | undefined): string | null {
  if (!raw) return null;
  for (const line of raw.split(/\n+/)) {
    const match = line.trim().match(/^Guest phone\s*:\s*(.+)$/i);
    const phone = match?.[1]?.trim();
    if (phone) return phone;
  }
  return null;
}

/** Guest writing only. Phone and participant lines already have their own fields. */
function customerRequestNotes(raw: string | null | undefined): string {
  return guestFacingBookingNotes(raw)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^(Guest phone|Participants)\s*:/i.test(line))
    .join('\n')
    .trim();
}

function DrawerFact({
  label,
  children,
  compact,
}: {
  label: string;
  children: ReactNode;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="tv-stay-drawer__fact">
        <dt>{label}</dt>
        <dd>{children}</dd>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[8.25rem_minmax(0,1fr)] items-baseline gap-x-2 text-[13px] leading-5">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

function DrawerSection({
  title,
  children,
  compact,
}: {
  title: string;
  children: ReactNode;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <section className="tv-stay-drawer__section">
        <h3 className="tv-stay-drawer__section-title">{title}</h3>
        <div className="space-y-1">{children}</div>
      </section>
    );
  }
  return (
    <section className="border-t border-black/[0.06] pt-3 first:border-t-0 first:pt-0">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

async function downloadBookingsCsv(
  rows: BookingRow[],
  listingMeta: Record<string, ListingBookingMeta>,
  opts?: {
    supplierId?: string;
    actorId?: string | null;
    filtersSnapshot?: Record<string, unknown>;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<boolean> {
  // Phase 1592: nights come from partnerBookingCsvValues (1573/1591) — do not invent opts.nights.
  const lines = rows.map((b) => {
    const meta = listingMeta[b.listing_id];
    const isStay = meta?.family === 'stay' || bookingIsStayNight(b);
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
      { inventory: isStay ? 'stay' : 'tour' }
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
  // Phase 1763/1783: audit export for guest-PII CSV with real filter snapshot.
  // Phase 1791: await audit — silent void hid RLS/network failures after download.
  if (opts?.supplierId) {
    return insertSupplierExportRun({
      supplierId: opts.supplierId,
      actorId: opts.actorId ?? null,
      kind: 'bookings',
      format: 'csv',
      scope: 'filtered',
      dateFrom: opts.dateFrom,
      dateTo: opts.dateTo,
      rowCount: rows.length,
      filtersSnapshot: opts.filtersSnapshot ?? { surface: 'bookings' },
    });
  }
  return true;
}

export default function SupplierBookings({
  inventoryFamily,
}: {
  inventoryFamily?: 'tour' | 'stay';
} = {}) {
  const { user, isSupabase } = useSupplierAuth();
  const { role } = useSupplierRole();
  const canEditBookings = canManageBookings(role);
  // Phase 1768: finance already exports guest names on Money — Bookings CSV must match.
  const canExportBookingsCsv = canEditBookings || canManageFinance(role);

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [listingMeta, setListingMeta] = useState<Record<string, ListingBookingMeta>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelRequestsError, setCancelRequestsError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [view, setView] = useState<BookingView>(() => {
    if (typeof window === 'undefined') return 'all';
    return readTravelWindow(new URLSearchParams(window.location.search).get('view'));
  });
  const [opsFilter, setOpsFilter] = useState<OpsFilter>('all');
  const [sortBy, setSortBy] = useState<PartnerBookingsSort>(() => {
    if (typeof window === 'undefined') return 'newest';
    return readSort(new URLSearchParams(window.location.search).get('sort'));
  });
  const [statusFilter, setStatusFilter] = useState(() => {
    if (typeof window === 'undefined') return '';
    const s = (new URLSearchParams(window.location.search).get('status') ?? '').trim().toLowerCase();
    return s === 'confirmed' || s === 'pending' || s === 'cancelled' ? s : '';
  });
  const [paymentFilter, setPaymentFilter] = useState<PartnerBookingsPaymentFilter>(() => {
    if (typeof window === 'undefined') return '';
    const p = (new URLSearchParams(window.location.search).get('pay') ?? '').trim();
    return p === 'paid' || p === 'unpaid' || p === 'refund_due' || p === 'refunded' ? p : '';
  });
  const [purchaseFrom, setPurchaseFrom] = useState(() => {
    if (typeof window === 'undefined') return '';
    const d = (new URLSearchParams(window.location.search).get('purchasedFrom') ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
  });
  const [purchaseTo, setPurchaseTo] = useState(() => {
    if (typeof window === 'undefined') return '';
    const d = (new URLSearchParams(window.location.search).get('purchasedTo') ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
  });
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const [drawerExtra, setDrawerExtra] = useState<null | 'notes' | 'activity' | 'rules' | 'instructions' | 'arrival'>(null);
  const [drawerMoreOpen, setDrawerMoreOpen] = useState(false);
  const [expandedStayId, setExpandedStayId] = useState<string | null>(null);
  const [expandedEarningsLabel, setExpandedEarningsLabel] = useState<string | null>(null);
  const [commercialSnapshot, setCommercialSnapshot] = useState<BookingCommercialSnapshotRow | null>(null);
  const [commercialState, setCommercialState] = useState<'loading' | 'ready' | 'missing' | 'error'>('missing');
  const [copiedBookingId, setCopiedBookingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [activityEvents, setActivityEvents] = useState<SupplierBookingEventRow[]>([]);
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
  const [filterQuery, setFilterQuery] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('q') ?? '';
  });
  const [searchDraft, setSearchDraft] = useState(filterQuery);

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

  // Wrong-desk deep links (stay on Bookings / tour on Reservations) → correct section.
  useEffect(() => {
    if (!inventoryFamily || !highlightBookingId || loading) return;
    const booking = bookings.find((b) => b.id === highlightBookingId);
    if (!booking) return;
    const isStay =
      listingMeta[booking.listing_id]?.family === 'stay' || bookingIsStayNight(booking);
    if (inventoryFamily === 'tour' && isStay) {
      navigateSupplierUrl(
        partnerBookingDeskPathPreservingSearch({
          isStay: true,
          bookingId: highlightBookingId,
          currentSearch: window.location.search,
        })
      );
      return;
    }
    if (inventoryFamily === 'stay' && !isStay) {
      navigateSupplierUrl(
        partnerBookingDeskPathPreservingSearch({
          isStay: false,
          bookingId: highlightBookingId,
          currentSearch: window.location.search,
        })
      );
    }
  }, [inventoryFamily, highlightBookingId, bookings, listingMeta, loading]);

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
      if (v === 'today' || v === 'tomorrow' || v === 'upcoming' || v === 'past' || v === 'range' || v === 'all') {
        if (!(ops === 'refund_due' || ops === 'unpaid' || ops === 'cancel')) setView(v);
      }
      setSortBy(readSort(params.get('sort')));
      const status = (params.get('status') ?? '').trim().toLowerCase();
      setStatusFilter(status === 'confirmed' || status === 'pending' || status === 'cancelled' ? status : '');
      const pay = (params.get('pay') ?? '').trim();
      setPaymentFilter(pay === 'paid' || pay === 'unpaid' || pay === 'refund_due' || pay === 'refunded' ? pay : '');
      const purchasedFrom = (params.get('purchasedFrom') ?? '').trim();
      const purchasedTo = (params.get('purchasedTo') ?? '').trim();
      setPurchaseFrom(/^\d{4}-\d{2}-\d{2}$/.test(purchasedFrom) ? purchasedFrom : '');
      setPurchaseTo(/^\d{4}-\d{2}-\d{2}$/.test(purchasedTo) ? purchasedTo : '');
      const q = params.get('q') ?? '';
      setFilterQuery(q);
      setSearchDraft(q);
      const listing = (params.get('listing') ?? '').trim();
      setFilterListingId(listing);
      const from = (params.get('from') ?? '').trim();
      const to = (params.get('to') ?? '').trim();
      setFilterDateFrom(/^\d{4}-\d{2}-\d{2}$/.test(from) ? from : '');
      setFilterDateTo(/^\d{4}-\d{2}-\d{2}$/.test(to) ? to : '');
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
      sort?: PartnerBookingsSort;
      status?: string;
      pay?: PartnerBookingsPaymentFilter;
      purchasedFrom?: string;
      purchasedTo?: string;
      q?: string;
    }) => {
      const listingId = patch.listingId !== undefined ? patch.listingId : filterListingId;
      const from = patch.from !== undefined ? patch.from : filterDateFrom;
      const to = patch.to !== undefined ? patch.to : filterDateTo;
      const nextView = patch.view !== undefined ? patch.view : view;
      const nextSort = patch.sort !== undefined ? patch.sort : sortBy;
      const nextStatus = patch.status !== undefined ? patch.status : statusFilter;
      const nextPay = patch.pay !== undefined ? patch.pay : paymentFilter;
      const nextPurchasedFrom = patch.purchasedFrom !== undefined ? patch.purchasedFrom : purchaseFrom;
      const nextPurchasedTo = patch.purchasedTo !== undefined ? patch.purchasedTo : purchaseTo;
      const nextQuery = patch.q !== undefined ? patch.q : filterQuery;
      if (patch.listingId !== undefined) setFilterListingId(patch.listingId);
      if (patch.from !== undefined) setFilterDateFrom(patch.from);
      if (patch.to !== undefined) setFilterDateTo(patch.to);
      if (patch.view !== undefined) setView(patch.view);
      if (patch.sort !== undefined) setSortBy(patch.sort);
      if (patch.status !== undefined) setStatusFilter(patch.status);
      if (patch.pay !== undefined) setPaymentFilter(patch.pay);
      if (patch.purchasedFrom !== undefined) setPurchaseFrom(patch.purchasedFrom);
      if (patch.purchasedTo !== undefined) setPurchaseTo(patch.purchasedTo);
      if (patch.q !== undefined) {
        setFilterQuery(patch.q);
        setSearchDraft(patch.q);
      }
      const url = new URL(window.location.href);
      if (!listingId) url.searchParams.delete('listing');
      else url.searchParams.set('listing', listingId);
      if (!from) url.searchParams.delete('from');
      else url.searchParams.set('from', from);
      if (!to) url.searchParams.delete('to');
      else url.searchParams.set('to', to);
      if (nextView === 'all') url.searchParams.delete('view');
      else url.searchParams.set('view', nextView);
      if (nextSort === 'newest') url.searchParams.delete('sort');
      else url.searchParams.set('sort', nextSort);
      if (!nextStatus) url.searchParams.delete('status');
      else url.searchParams.set('status', nextStatus);
      if (!nextPay) url.searchParams.delete('pay');
      else url.searchParams.set('pay', nextPay);
      if (!nextPurchasedFrom) url.searchParams.delete('purchasedFrom');
      else url.searchParams.set('purchasedFrom', nextPurchasedFrom);
      if (!nextPurchasedTo) url.searchParams.delete('purchasedTo');
      else url.searchParams.set('purchasedTo', nextPurchasedTo);
      if (!nextQuery.trim()) url.searchParams.delete('q');
      else url.searchParams.set('q', nextQuery.trim());
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
      setBookingsListPage(1);
    },
    [filterListingId, filterDateFrom, filterDateTo, view, sortBy, statusFilter, paymentFilter, purchaseFrom, purchaseTo, filterQuery]
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (searchDraft === filterQuery) return;
      writeBookingsSearchToUrl({ q: searchDraft });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [searchDraft, filterQuery, writeBookingsSearchToUrl]);

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
    const nowMs = Date.now();
    return applyPartnerBookingsDesk(bookings.filter(partnerBookingIsLiveTrip), {
      search: filterQuery,
      travel: view === 'range' || filterDateFrom || filterDateTo ? (view === 'all' && (filterDateFrom || filterDateTo) ? 'range' : view) : view,
      travelFrom: filterDateFrom,
      travelTo: filterDateTo,
      purchaseFrom,
      purchaseTo,
      status: statusFilter,
      payment: paymentFilter,
      listingId: filterListingId,
      ops: opsFilter,
      sort: sortBy,
      inventoryFamily,
      highlightBookingId,
    }, {
      nowMs,
      isStay: (b) => listingMeta[b.listing_id]?.family === 'stay' || bookingIsStayNight(b),
      pickupAttention: (b) => {
        if (opsFilter === 'pickup') {
          const meta = listingMeta[b.listing_id];
          // Phase 1751: pickup queue must honor note overrides (1742 Meet display parity).
          const copy = resolvePartnerPickupCopy({
            purchaseSnapshot: b.purchase_snapshot,
            bookingOptionId: b.booking_option_id,
            specialRequests: b.special_requests,
            listingMeetingPoint: meta?.meetingPoint,
            listingPickupInstructions: meta?.pickupInstructions,
            bookingOptions: isPurchaseSnapshot(b.purchase_snapshot) ? null : meta?.bookingOptions,
          });
          return partnerBookingHasPickupAttention(
            b,
            copy.meetingPoint,
            copy.pickupInstructions,
            isPurchaseSnapshot(b.purchase_snapshot) ? null : meta?.bookingOptions
          );
        }
        return false;
      },
      openCancel: (b) =>
        openHostCancelRequestVisible({
          bookingStatus: b.status,
          requestStatus: openCancels[b.id]?.status,
        }),
      title: (b) =>
        displayListingTitleFromPurchase(b.purchase_snapshot, listingMeta[b.listing_id]?.title, ''),
      startHm: (b) => (b.start_time ? pgTimeToHm(b.start_time) ?? '' : ''),
    });
  }, [bookings, filterDateFrom, filterDateTo, filterListingId, filterQuery, listingMeta, view, opsFilter, openCancels, inventoryFamily, highlightBookingId, purchaseFrom, purchaseTo, statusFilter, paymentFilter, sortBy]);

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
    // Phase 1796: always notify — edge resolves auth email when guest_email blank (1788).
    // Phase 1859: request already committed; surface soft warn if traveler email fails.
    const notify = await notifyTravelerCancellationRequest({
      customerEmail: (cancelModal.guest_email ?? '').trim() || 'resolve@guest.local',
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
      // Phase 1712: unique key per cancellation_requests row (re-request after decline).
      requestId: res.id,
    });
    setCancelModal(null);
    setCancelReasonText('');
    setCancelEvidence('');
    if (!notify.sent && !notify.skipped) {
      setError(
        `Cancellation request submitted, but traveler email failed${
          notify.error ? `: ${notify.error}` : ''
        }. They may not have been notified — the request is still open in Trips.`
      );
    }
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

  useEffect(() => {
    setExpandedEarningsLabel(null);
    if (!expandedStayId) return;
    let cancelled = false;
    void fetchBookingCommercialSnapshot(expandedStayId).then((snap) => {
      if (cancelled || !snap) return;
      setExpandedEarningsLabel(
        formatSnapshotMinor(snap.remaining_supplier_minor, snap.currency)
      );
    });
    return () => {
      cancelled = true;
    };
  }, [expandedStayId]);

  useEffect(() => {
    setDrawerExtra(null);
    setDrawerMoreOpen(false);
    setCommercialSnapshot(null);
    if (!user?.id || !highlightBookingId) {
      setActivityEvents([]);
      setCommercialState('missing');
      return;
    }
    let cancelled = false;
    setCommercialState('loading');
    void fetchSupplierBookingEvents(user.id, [highlightBookingId]).then((rows) => {
      if (!cancelled) setActivityEvents(rows);
    });
    void fetchBookingCommercialSnapshot(highlightBookingId)
      .then((row) => {
        if (cancelled) return;
        setCommercialSnapshot(row);
        setCommercialState(row ? 'ready' : 'missing');
      })
      .catch(() => {
        if (cancelled) return;
        setCommercialSnapshot(null);
        setCommercialState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, highlightBookingId]);

  const activeBookingFilterCount = [
    statusFilter,
    filterListingId,
    view !== 'all' ? view : '',
    filterDateFrom || filterDateTo ? 'travel' : '',
    paymentFilter,
    opsFilter !== 'all' ? opsFilter : '',
    purchaseFrom || purchaseTo ? 'purchased' : '',
  ].filter(Boolean).length;

  const resetBookingFilters = () => {
    writeBookingsSearchToUrl({
      view: 'all',
      listingId: '',
      from: '',
      to: '',
      sort: 'newest',
      status: '',
      pay: '',
      purchasedFrom: '',
      purchasedTo: '',
      q: '',
    });
    setOpsFilterAndUrl('all');
    setSelectedIds(new Set());
    setFiltersSheetOpen(false);
  };

  const isStayDesk = inventoryFamily === 'stay';

  const stayDetailMode = Boolean(isStayDesk && selectedBooking);

  return (
    <div className={`${SUPPLIER_PAGE_CLASS}${isStayDesk ? ' partner-stay-ops' : ''}`}>
      {!stayDetailMode ? (
      <SupplierPageHero
        badge={isStayDesk ? null : 'Operate'}
        title={isStayDesk ? 'Reservations' : 'Bookings'}
        description={
          isStayDesk
            ? 'Guests, nights and decisions.'
            : 'Guests, products, dates, payment, and decisions.'
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
            {selectedIds.size > 0 ? (
              <button
                type="button"
                onClick={() => {
                  if (!canExportBookingsCsv || !user?.id) return;
                  const chosen = filteredBookings.filter((b) => selectedIds.has(b.id));
                  if (chosen.length === 0) return;
                  void (async () => {
                    const audited = await downloadBookingsCsv(chosen, listingMeta, {
                      supplierId: user.id,
                      actorId: user.id,
                      dateFrom: filterDateFrom || undefined,
                      dateTo: filterDateTo || undefined,
                      filtersSnapshot: {
                        surface: 'bookings',
                        scope: 'selected',
                        view,
                        opsFilter,
                        rowCount: chosen.length,
                      },
                    });
                    if (!audited) {
                      setError('Export downloaded, but the audit log failed. Try again or contact support.');
                    }
                  })();
                }}
                disabled={!canExportBookingsCsv}
                className="tv-btn-ghost disabled:opacity-50"
              >
                <Download className="h-4 w-4" aria-hidden />
                Export selected
              </button>
            ) : null}
            <button
              type="button"
              // Phase 1763/1768: guest-PII export for editors + finance (+ audit insert).
              onClick={() => {
                if (!canExportBookingsCsv || !user?.id) return;
                void (async () => {
                  const audited = await downloadBookingsCsv(filteredBookings, listingMeta, {
                    supplierId: user.id,
                    actorId: user.id,
                    // Phase 1783: record the exact filter slice that produced guest-PII rows.
                    dateFrom: filterDateFrom || undefined,
                    dateTo: filterDateTo || undefined,
                    filtersSnapshot: {
                      surface: 'bookings',
                      view,
                      opsFilter,
                      sort: sortBy,
                      status: statusFilter || null,
                      payment: paymentFilter || null,
                      listingId: filterListingId || null,
                      query: filterQuery.trim() || null,
                      inventoryFamily: inventoryFamily ?? null,
                      rowCount: filteredBookings.length,
                    },
                  });
                  // Phase 1791: download still succeeded — surface audit miss.
                  if (!audited) {
                    setError('Export downloaded, but the audit log failed. Try again or contact support.');
                  }
                })();
              }}
              disabled={!canExportBookingsCsv || filteredBookings.length === 0}
              className="tv-btn-ghost disabled:opacity-50"
              title={
                !canExportBookingsCsv
                  ? 'Your role can view bookings but cannot export guest details'
                  : undefined
              }
            >
              <Download className="h-4 w-4" aria-hidden />
              Export
            </button>
          </div>
          ) : undefined
        }
      >
      </SupplierPageHero>
      ) : null}

      {!stayDetailMode && bookings.length > 0 && (
      <div className={isStayDesk ? 'partner-stay-ops__toolbar' : 'mb-4 space-y-3'}>
        <div className={`flex flex-col gap-2 lg:flex-row lg:items-center${isStayDesk ? '' : ''}`}>
          <label className="min-w-0 flex-1">
            <span className="sr-only">{isStayDesk ? 'Search reservations' : 'Search bookings'}</span>
            <input
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder={
                isStayDesk
                  ? 'Search guest, property or reference…'
                  : 'Search name, email or booking ID...'
              }
              className="tv-input w-full"
              aria-label="Search name, email or booking ID"
            />
          </label>
          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              className="tv-btn-ghost"
              aria-expanded={filtersSheetOpen}
              aria-controls="bookings-filter-sheet"
              onClick={() => setFiltersSheetOpen(true)}
            >
              Filters{activeBookingFilterCount > 0 ? ` (${activeBookingFilterCount})` : ''}
            </button>
            <div className="min-w-0 flex-1">
              <PartnerSelect
                id="bookings-filter-sort-mobile"
                aria-label="Sort bookings"
                searchable={false}
                value={sortBy}
                onChange={(next) => writeBookingsSearchToUrl({ sort: next as PartnerBookingsSort })}
                options={PARTNER_BOOKINGS_SORTS.map((item) => ({ value: item.value, label: item.label }))}
              />
            </div>
          </div>
          <div className="hidden flex-wrap items-center gap-2 lg:flex">
            <PartnerSelect
              id="bookings-filter-status"
              aria-label="Booking status"
              searchable={false}
              value={statusFilter}
              onChange={(status) => writeBookingsSearchToUrl({ status })}
              options={[
                { value: '', label: 'All statuses' },
                { value: 'confirmed', label: 'Confirmed' },
                { value: 'pending', label: 'Pending' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
            />
            <PartnerSelect
              id="bookings-filter-listing"
              aria-labelledby="bookings-filter-listing-label"
              value={filterListingId}
              onChange={(listingId) => writeBookingsSearchToUrl({ listingId })}
              options={[
                { value: '', label: isStayDesk ? 'All properties' : 'All experiences' },
                ...listingOptions.map((option) => ({ value: option.id, label: option.title })),
              ]}
            />
            <span id="bookings-filter-listing-label" className="sr-only">
              {isStayDesk ? 'Property' : 'Experience'}
            </span>
            <PartnerSelect
              id="bookings-filter-travel"
              aria-label="Travel date"
              searchable={false}
              value={view}
              onChange={(next) => writeBookingsSearchToUrl({ view: next as BookingView })}
              options={PARTNER_BOOKINGS_TRAVEL.map((item) => ({ value: item.value, label: item.label }))}
            />
            <PartnerSelect
              id="bookings-filter-sort"
              aria-label="Sort bookings"
              searchable={false}
              value={sortBy}
              onChange={(next) => writeBookingsSearchToUrl({ sort: next as PartnerBookingsSort })}
              options={PARTNER_BOOKINGS_SORTS.map((item) => ({ value: item.value, label: item.label }))}
            />
            <button
              type="button"
              aria-expanded={moreFiltersOpen}
              onClick={() => setMoreFiltersOpen((open) => !open)}
              className="tv-btn-ghost"
            >
              More filters
            </button>
          </div>
        </div>
        {view === 'range' || filterDateFrom || filterDateTo ? (
          <div className="hidden flex-wrap items-center gap-1.5 lg:flex">
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => writeBookingsSearchToUrl({ view: 'range', from: e.target.value })}
              className="tv-input w-[9.25rem]"
              aria-label="Travel date from"
            />
            <span className="shrink-0 text-sm text-ink-faint">–</span>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => writeBookingsSearchToUrl({ view: 'range', to: e.target.value })}
              className="tv-input w-[9.25rem]"
              aria-label="Travel date to"
            />
          </div>
        ) : null}
        {moreFiltersOpen ? (
          <div className="hidden gap-3 rounded-lg border border-black/[0.08] bg-white p-3 lg:grid lg:grid-cols-4">
            <PartnerSelect
              id="bookings-filter-payment"
              aria-label="Payment status"
              searchable={false}
              value={paymentFilter}
              onChange={(pay) => writeBookingsSearchToUrl({ pay: pay as PartnerBookingsPaymentFilter })}
              options={[
                { value: '', label: 'Any payment' },
                { value: 'paid', label: 'Paid' },
                { value: 'unpaid', label: 'Unpaid' },
                { value: 'refund_due', label: 'Refund due' },
                { value: 'refunded', label: 'Refunded' },
              ]}
            />
            <PartnerSelect
              id="bookings-filter-ops"
              aria-label="Operational attention"
              searchable={false}
              value={opsFilter}
              onChange={(next) => setOpsFilterAndUrl(next as OpsFilter)}
              options={[
                { value: 'all', label: 'Any attention' },
                { value: 'unpaid', label: 'Unpaid checkout' },
                ...(inventoryFamily === 'stay' ? [] : [{ value: 'pickup', label: 'Pickup details' }]),
                { value: 'cancel', label: 'Cancellation waiting' },
                { value: 'refund_due', label: 'Refund due' },
              ]}
            />
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Purchased from</label>
              <input
                type="date"
                value={purchaseFrom}
                onChange={(e) => writeBookingsSearchToUrl({ purchasedFrom: e.target.value })}
                className="tv-input"
                aria-label="Purchase date from"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Purchased to</label>
              <input
                type="date"
                value={purchaseTo}
                onChange={(e) => writeBookingsSearchToUrl({ purchasedTo: e.target.value })}
                className="tv-input"
                aria-label="Purchase date to"
              />
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {/* Phase 1663: ops filters count as active filters. */}
          {filterQuery || filterListingId || filterDateFrom || filterDateTo || opsFilter !== 'all' || statusFilter || paymentFilter || sortBy !== 'newest' || purchaseFrom || purchaseTo || view !== 'all' ? (
            <button
              type="button"
              onClick={resetBookingFilters}
              className="tv-btn-ghost hidden lg:inline-flex"
            >
              Reset filters
            </button>
          ) : null}
        </div>
      </div>
      )}

      {filtersSheetOpen ? (
        <SupplierDetailDrawer variant="sheet" label="Filters" onClose={() => setFiltersSheetOpen(false)}>
          <div id="bookings-filter-sheet" className="flex min-h-0 w-full flex-1 flex-col bg-white">
            <SupplierModalHeader
              title="Filters"
              onClose={() => setFiltersSheetOpen(false)}
            />
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              <PartnerSelect
                id="bookings-filter-status-mobile"
                aria-label="Booking status"
                searchable={false}
                value={statusFilter}
                onChange={(status) => writeBookingsSearchToUrl({ status })}
                options={[
                  { value: '', label: 'All statuses' },
                  { value: 'confirmed', label: 'Confirmed' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
              />
              <PartnerSelect
                id="bookings-filter-listing-mobile"
                aria-label="Experience"
                value={filterListingId}
                onChange={(listingId) => writeBookingsSearchToUrl({ listingId })}
                options={[
                  { value: '', label: 'All experiences' },
                  ...listingOptions.map((option) => ({ value: option.id, label: option.title })),
                ]}
              />
              <PartnerSelect
                id="bookings-filter-travel-mobile"
                aria-label="Travel date"
                searchable={false}
                value={view}
                onChange={(next) => writeBookingsSearchToUrl({ view: next as BookingView })}
                options={PARTNER_BOOKINGS_TRAVEL.map((item) => ({ value: item.value, label: item.label }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => writeBookingsSearchToUrl({ view: 'range', from: e.target.value })}
                  className="tv-input w-full min-w-0"
                  aria-label="Travel date from"
                />
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => writeBookingsSearchToUrl({ view: 'range', to: e.target.value })}
                  className="tv-input w-full min-w-0"
                  aria-label="Travel date to"
                />
              </div>
              <PartnerSelect
                id="bookings-filter-payment-mobile"
                aria-label="Payment status"
                searchable={false}
                value={paymentFilter}
                onChange={(pay) => writeBookingsSearchToUrl({ pay: pay as PartnerBookingsPaymentFilter })}
                options={[
                  { value: '', label: 'Any payment' },
                  { value: 'paid', label: 'Paid' },
                  { value: 'unpaid', label: 'Unpaid' },
                  { value: 'refund_due', label: 'Refund due' },
                  { value: 'refunded', label: 'Refunded' },
                ]}
              />
              <PartnerSelect
                id="bookings-filter-ops-mobile"
                aria-label="Operational attention"
                searchable={false}
                value={opsFilter}
                onChange={(next) => setOpsFilterAndUrl(next as OpsFilter)}
                options={[
                  { value: 'all', label: 'Any attention' },
                  { value: 'unpaid', label: 'Unpaid checkout' },
                  ...(inventoryFamily === 'stay' ? [] : [{ value: 'pickup', label: 'Pickup details' }]),
                  { value: 'cancel', label: 'Cancellation waiting' },
                  { value: 'refund_due', label: 'Refund due' },
                ]}
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Purchased from</label>
                  <input
                    type="date"
                    value={purchaseFrom}
                    onChange={(e) => writeBookingsSearchToUrl({ purchasedFrom: e.target.value })}
                    className="tv-input w-full min-w-0"
                    aria-label="Purchase date from"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Purchased to</label>
                  <input
                    type="date"
                    value={purchaseTo}
                    onChange={(e) => writeBookingsSearchToUrl({ purchasedTo: e.target.value })}
                    className="tv-input w-full min-w-0"
                    aria-label="Purchase date to"
                  />
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-black/[0.06] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={resetBookingFilters} className="tv-btn-ghost">
                Reset
              </button>
              <button type="button" onClick={() => setFiltersSheetOpen(false)} className="tv-btn-primary">
                Apply
              </button>
            </div>
          </div>
        </SupplierDetailDrawer>
      ) : null}

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

      {stayDetailMode ? null : loading && bookings.length === 0 ? (
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
            <div className="flex flex-wrap gap-2">
              {/* Phase 1698: Calendar/Offers dual-CTA parity when bookings are empty. */}
              <button
                type="button"
                onClick={() => navigateSupplierUrl(PARTNER_CREATE_PATH)}
                className="tv-btn-primary"
              >
                New listing
              </button>
              <button
                type="button"
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`)}
                className="tv-btn-ghost"
              >
                Your listings
              </button>
              {inventoryFamily === 'stay' ? (
                <button
                  type="button"
                  onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings`)}
                  className="tv-btn-ghost"
                >
                  Tour bookings
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigateSupplierUrl(PARTNER_RESERVATIONS_PATH)}
                  className="tv-btn-ghost"
                >
                  Stay reservations
                </button>
              )}
            </div>
          }
        />
      ) : (
        <div
          id={PARTNER_BOOKINGS_LIST_ID}
          role="region"
          aria-label="Bookings"
        >
        {filteredBookings.length === 0 ? (
        <SupplierEmptyState
          icon={CalendarDays}
          title="Nothing in this view"
          body={
            opsFilter === 'unpaid'
              ? 'No unpaid checkouts match these filters. Live holds stay here until you clear them.'
              : 'You have bookings, but none match this search or these filters. That is a filter — not a missing page.'
          }
          action={
              // Phase 1609: filtered empty — same reset as toolbar Reset filters.
              <button
                type="button"
                onClick={() => {
                  writeBookingsSearchToUrl({
                    view: 'all',
                    listingId: '',
                    from: '',
                    to: '',
                    sort: 'newest',
                    status: '',
                    pay: '',
                    purchasedFrom: '',
                    purchasedTo: '',
                    q: '',
                  });
                  setOpsFilterAndUrl('all');
                  setBookingsListPage(1);
                }}
                className="tv-btn-secondary"
              >
                Clear filters
              </button>
          }
        />
      ) : (
        <div className="space-y-3" aria-busy={loading || undefined}>
          <div className="space-y-2">
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
              // Phase 1742: honor Pickup planner note overrides (Trips 1716 / reminder 1741 parity).
              const rowPickup = resolvePartnerPickupCopy({
                purchaseSnapshot: booking.purchase_snapshot,
                bookingOptionId: booking.booking_option_id,
                specialRequests: booking.special_requests,
                listingMeetingPoint: meta?.meetingPoint,
                listingPickupInstructions: meta?.pickupInstructions,
                bookingOptions: isPurchaseSnapshot(booking.purchase_snapshot)
                  ? null
                  : meta?.bookingOptions,
              });
              const rowMeeting = rowPickup.meetingPoint;
              const rowPickupInstructions = rowPickup.pickupInstructions;
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
              const purchaseDateLabel = formatPurchaseDate(booking.created_at);
              const pickupGap = partnerBookingHasPickupAttention(
                booking,
                rowMeeting,
                rowPickupInstructions,
                isPurchaseSnapshot(booking.purchase_snapshot) ? null : meta?.bookingOptions
              );
              const openCancelRaw = openCancels[booking.id];
              const openCancel =
                openCancelRaw &&
                openHostCancelRequestVisible({
                  bookingStatus: booking.status,
                  requestStatus: openCancelRaw.status,
                })
                  ? openCancelRaw
                  : undefined;
              const paymentIssue =
                partnerPaymentLabel(booking) === 'Refund due'
                  ? 'Refund due'
                  : partnerBookingIsUnpaidCheckout(booking)
                    ? partnerUnpaidCheckoutHoldsInventory(booking)
                      ? 'Payment not completed'
                      : 'Payment hold expired'
                    : null;
              const cardWarning = openCancel
                ? 'Cancellation requested'
                : pickupGap
                  ? 'Pickup details missing'
                  : paymentIssue;
              const needsAttention = Boolean(cardWarning);
              const referenceLabel = bookingReferenceLabel(booking);
              const participantLabel = formatBookingParticipantsLabel(booking);
              const stayNightLabel =
                meta?.family === 'stay' || bookingIsStayNight(booking)
                  ? (() => {
                      // Phase 1584/1588: meta nights beside paidLabel via stayPaidAdjacentNightCount.
                      const range = stayRangeFromBooking(booking);
                      if (!range) return '';
                      const stayNights = nightsOccupiedByStay(range.checkIn, range.checkOut).length;
                      const n = stayPaidAdjacentNightCount({
                        amountPaid: booking.amount_paid,
                        nightlyAmount: booking.nightly_amount,
                        cleaningFee: booking.cleaning_fee,
                        paymentCollected: bookingPaymentWasCollected(booking.payment_status),
                        columnNights: booking.nights,
                        snapshotNights: (booking.purchase_snapshot as PurchaseSnapshot | null | undefined)?.nights,
                        occupancyNights: stayNights,
                      });
                      return n != null && n > 0 ? `${n} night${n === 1 ? '' : 's'}` : '';
                    })()
                  : '';
              const checkbox = (
                <input
                  type="checkbox"
                  checked={selectedIds.has(booking.id)}
                  aria-label={`Select booking ${referenceLabel}`}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(booking.id)) next.delete(booking.id);
                      else next.add(booking.id);
                      return next;
                    });
                  }}
                  className="h-4 w-4 rounded border-black/30 text-finland focus:ring-finland"
                />
              );
              const copyReference = () => {
                void navigator.clipboard.writeText(referenceLabel).then(() => {
                  setCopiedBookingId(booking.id);
                  window.setTimeout(() => {
                    setCopiedBookingId((current) => (current === booking.id ? null : current));
                  }, 1500);
                }).catch(() => {
                  setCopiedBookingId(null);
                });
              };

              if (isStayDesk) {
                const stayInTime =
                  displayStayCheckInTimeFromPurchase(booking.purchase_snapshot, meta?.stayCheckInTime) || '';
                const stayOutTime =
                  displayStayCheckOutTimeFromPurchase(booking.purchase_snapshot, meta?.stayCheckOutTime) || '';
                return (
                  <StayOpsReservationCard
                    key={booking.id}
                    model={{
                      id: booking.id,
                      listingTitle,
                      imageUrl: meta?.imageUrl ?? null,
                      guestName: booking.guest_name?.trim() || 'Guest',
                      dateLine: stayDayChip ? `${stayDayChip} · ${dateLine}` : dateLine,
                      participantLabel,
                      nightLabel: stayNightLabel,
                      statusLabel: partnerBookingLifecycleLabel(booking.status),
                      statusClass: bookingStatusClass(booking.status, booking.payment_status),
                      referenceLabel,
                      guestTotalLabel: customerBookingTotal(booking),
                      earningsLabel:
                        expandedStayId === booking.id ? expandedEarningsLabel : null,
                      paymentLabel: partnerPaymentLabel(booking),
                      checkInTime: stayInTime,
                      checkOutTime: stayOutTime,
                      guestEmail: booking.guest_email?.trim() || null,
                      guestPhone: guestPhoneFromNotes(booking.special_requests),
                      warning: cardWarning,
                      needsReview: partnerBookingNeedsLook(booking),
                    }}
                    expanded={expandedStayId === booking.id}
                    selected={highlightBookingId === booking.id}
                    busy={updatingId === booking.id}
                    checkbox={checkbox}
                    copied={copiedBookingId === booking.id}
                    onToggleExpand={() =>
                      setExpandedStayId((cur) => (cur === booking.id ? null : booking.id))
                    }
                    onOpenDetails={() => {
                      setExpandedStayId(null);
                      setSelectedBookingId(booking.id);
                    }}
                    onMessageGuest={() => openSupplierInbox(booking.id)}
                    onMarkReviewed={
                      canEditBookings
                        ? () => void handleAcknowledge(booking)
                        : undefined
                    }
                    onCopyReference={copyReference}
                  />
                );
              }

              return (
                <article
                  key={booking.id}
                  id={`supplier-booking-row-${booking.id}`}
                  data-highlight={highlightBookingId === booking.id ? 'true' : 'false'}
                  data-attention={needsAttention ? 'true' : 'false'}
                  className="tv-ops-booking-row"
                >
                  <label className="flex shrink-0 items-center self-center pl-2.5" onClick={(event) => event.stopPropagation()}>
                    {checkbox}
                  </label>
                  <button
                    type="button"
                    onClick={() => setSelectedBookingId(booking.id)}
                    className="lux-flat tv-ops-booking-row__btn"
                    aria-label={`View details for ${listingTitle}`}
                  >
                    {meta?.imageUrl ? (
                      <img
                        src={meta.imageUrl}
                        alt=""
                        className="h-[3.25rem] w-[3.25rem] shrink-0 rounded-md object-cover ring-1 ring-black/[0.06]"
                      />
                    ) : (
                      <div
                        className="h-[3.25rem] w-[3.25rem] shrink-0 rounded-md bg-finland/10 ring-1 ring-finland/15"
                        aria-hidden
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p
                            className="line-clamp-2 text-[14px] font-semibold leading-5 tracking-tight text-ink"
                            title={listingTitle}
                          >
                            {listingTitle}
                          </p>
                          {optionLabel ? (
                            <p className="truncate text-[12.5px] leading-4 text-ink-muted" title={optionLabel}>
                              {optionLabel}
                            </p>
                          ) : null}
                        </div>
                        <span className="mt-0.5 inline-flex shrink-0 items-center gap-0.5">
                          <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${bookingStatusClass(booking.status, booking.payment_status)}`}>
                            {partnerBookingLifecycleLabel(booking.status)}
                          </span>
                          <ChevronRight className="h-4 w-4 text-ink-faint" aria-hidden />
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] leading-4 text-ink-muted">
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                          <span className="truncate" title={dep.purchasedNote ? `${dateLine}. ${dep.purchasedNote}` : dateLine}>
                            {dateLine}
                            {dep.purchasedNote ? ` · ${dep.purchasedNote}` : ''}
                          </span>
                        </span>
                        <span className="inline-flex min-w-0 items-center gap-1" title={participantLabel}>
                          <Users className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                          <span className="truncate">{participantLabel}</span>
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] leading-4 text-ink-muted">
                        <span className="font-mono text-[12px] font-semibold tracking-wide text-finland">{referenceLabel}</span>
                        {purchaseDateLabel ? (
                          <span className="whitespace-nowrap" title="Purchase date, when the booking was created">Purchased {purchaseDateLabel}</span>
                        ) : null}
                      </div>
                      {cardWarning ? (
                        <p className="mt-0.5 text-[12px] font-medium leading-4 text-amber-800">{cardWarning}</p>
                      ) : null}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="tv-ops-booking-row__copy"
                    aria-label={`Copy booking reference ${referenceLabel}`}
                    onClick={copyReference}
                  >
                    {copiedBookingId === booking.id ? (
                      <CheckCircle className="h-3.5 w-3.5 text-finland" aria-hidden />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                    )}
                  </button>
                </article>
              );
            })}

          </div>

          <nav
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            aria-label="Bookings pages"
          >
            <p className="text-[13px] text-ink-muted">
              <span className="font-medium tabular-nums text-ink">
                {(safePage - 1) * BOOKINGS_PAGE_SIZE + 1}–{(safePage - 1) * BOOKINGS_PAGE_SIZE + paginatedBookings.length}
              </span>{' '}
              of {filteredBookings.length}
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
        <SupplierDetailDrawer
          onClose={() => setSelectedBookingId(null)}
          label={selectedBooking.guest_name || 'Booking'}
          variant={isStayDesk ? 'page' : 'drawer'}
        >
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
            // Phase 1742: detail Meet line uses same override precedence as Trips / Pickup planner.
            const partnerPickup = resolvePartnerPickupCopy({
              purchaseSnapshot: booking.purchase_snapshot,
              bookingOptionId: booking.booking_option_id,
              specialRequests: booking.special_requests,
              listingMeetingPoint: meta?.meetingPoint,
              listingPickupInstructions: meta?.pickupInstructions,
              bookingOptions: isPurchaseSnapshot(booking.purchase_snapshot)
                ? null
                : meta?.bookingOptions,
            });
            const meetingPoint = partnerPickup.meetingPoint;
            const pickupInstructions = partnerPickup.pickupInstructions;
            const fulfillment = displayFulfillmentFromPurchase(booking.purchase_snapshot);
            const bookingLogistics = optionLogisticsLines({
              ...readOptionLogistics(booking.purchase_snapshot),
              fulfillment,
            }).join(' ');
            const purchasedDuration = displayDurationFromPurchase(
              booking.purchase_snapshot,
              meta?.duration ?? null
            );
            const chosenPickup =
              fulfillment === 'pickup'
                ? travelerPickupAddressFromRecord({
                    snapshot: booking.purchase_snapshot,
                    specialRequests: booking.special_requests,
                  })
                : '';
            const placeShown = chosenPickup || meetingPoint;
            const placePrefix = chosenPickup ? 'Pickup' : fulfillment === 'pickup' ? 'Pickup area' : 'Meet';
            const stayRange = isStay ? stayRangeFromBooking(booking) : null;
            const stayOut = stayRange?.checkOut ?? null;
            // Phase 1590: detail Nights field matches list meta 1584/1588 when paid+nightly (date range keeps occupancy).
            const stayOccupancyNights = stayRange
              ? nightsOccupiedByStay(stayRange.checkIn, stayRange.checkOut).length
              : 0;
            const stayNightCount = stayRange
              ? stayPaidAdjacentNightCount({
                  amountPaid: booking.amount_paid,
                  nightlyAmount: booking.nightly_amount,
                  cleaningFee: booking.cleaning_fee,
                  paymentCollected: bookingPaymentWasCollected(booking.payment_status),
                  columnNights: booking.nights,
                  snapshotNights: (booking.purchase_snapshot as PurchaseSnapshot | null | undefined)?.nights,
                  occupancyNights: stayOccupancyNights,
                }) ?? 0
              : 0;
            const whenLabel = stayOut
              ? `${formatStayNightHuman(booking.booking_date ?? '')} → ${formatStayNightHuman(stayOut)}`
              : formatActivityDateLong(booking.booking_date, startHm);
            const bookingTotalLabel = customerBookingTotal(booking);
            const collectedLabel = formatBookingMoney(booking.amount_paid, booking.currency);
            const collectedCaption = partnerCollectedAmountCaption(booking);
            const needsAck = partnerBookingNeedsLook(booking);
            const pickupGap =
              !isStay &&
              partnerBookingHasPickupAttention(
                booking,
                meetingPoint,
                pickupInstructions,
                isPurchaseSnapshot(booking.purchase_snapshot) ? null : meta?.bookingOptions
              );
            // Phase 1582: detail panel must resolve openCancel (list row already did — missing here broke tsc/cancel UI).
            const openCancelRaw = openCancels[booking.id];
            const openCancel =
              openCancelRaw &&
              openHostCancelRequestVisible({
                bookingStatus: booking.status,
                requestStatus: openCancelRaw.status,
              })
                ? openCancelRaw
                : undefined;
            const busy = updatingId === booking.id;
            const referenceLabel = bookingReferenceLabel(booking);
            const guestPhone = guestPhoneFromNotes(booking.special_requests);
            const requestNotes = customerRequestNotes(booking.special_requests);
            const checkInAddress = isStay
              ? displayCheckInAddressFromPurchase(booking.purchase_snapshot, booking.payment_status) || ''
              : '';
            const houseRules = isStay ? displayStayHouseRulesFromPurchase(booking.purchase_snapshot) || '' : '';
            const stayInTime = isStay
              ? displayStayCheckInTimeFromPurchase(booking.purchase_snapshot, meta?.stayCheckInTime)
              : '';
            const stayOutTime = isStay
              ? displayStayCheckOutTimeFromPurchase(booking.purchase_snapshot, meta?.stayCheckOutTime)
              : '';
            const houseTimes = [stayInTime ? `Check-in from ${stayInTime}` : null, stayOutTime ? `Check-out by ${stayOutTime}` : null]
              .filter(Boolean)
              .join(' · ');
            const phoneHref = guestPhone ? `tel:${guestPhone.replace(/[^\d+]/g, '')}` : '';
            const showPickup = !isStay && fulfillment === 'pickup';
            const showMeeting = !isStay && !showPickup && Boolean(meetingPoint);
            const hasOperations = Boolean(
              houseTimes ||
                checkInAddress ||
                (!isStay && placeShown) ||
                (showPickup && pickupHm) ||
                (pickupInstructions && (showPickup || showMeeting)) ||
                bookingLogistics ||
                needsAck ||
                booking.acknowledged_at ||
                pickupGap ||
                houseRules ||
                partnerBookingIsUnpaidCheckout(booking) ||
                openCancel ||
                isStay
            );
            const commissionAdjusted =
              commercialSnapshot != null &&
              Number(commercialSnapshot.remaining_gross_minor) !== Number(commercialSnapshot.gross_minor);
            const c = isStay;
            return (
              <div className={isStay ? 'tv-stay-drawer' : 'contents'}>
                <SupplierModalHeader
                  title={booking.guest_name || 'Guest'}
                  badge={
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${bookingStatusClass(booking.status, booking.payment_status)}`}>
                      {partnerBookingLifecycleLabel(booking.status)}
                    </span>
                  }
                  subtitle={<span className="font-medium text-finland">{referenceLabel}</span>}
                  onClose={() => setSelectedBookingId(null)}
                />
                <div className={isStay ? 'tv-stay-drawer__body' : 'min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-5'}>
                  <DrawerSection title={isStay ? 'Stay' : 'Experience'} compact={c}>
                    <div className="flex gap-2.5">
                      {meta?.imageUrl ? (
                        <img
                          src={meta.imageUrl}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-md object-cover ring-1 ring-black/[0.06]"
                        />
                      ) : (
                        <div className="h-11 w-11 shrink-0 rounded-md bg-black/[0.04] ring-1 ring-black/[0.06]" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-bold leading-5 tracking-tight text-ink" title={listingTitle}>
                          {listingTitle}
                        </p>
                        {optionLabel && !isStay ? (
                          <p className="truncate text-[12px] text-ink-muted" title={optionLabel}>
                            {optionLabel}
                          </p>
                        ) : null}
                        {!isStay ? (
                          <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
                            <p className="text-[13px] font-medium text-ink">{whenLabel}</p>
                            {purchasedDuration ? (
                              <p className="inline-flex items-center gap-1 text-[13px] text-ink-muted">
                                <Clock className="h-3 w-3 shrink-0" aria-hidden />
                                {purchasedDuration}
                              </p>
                            ) : null}
                            <p className="text-[13px] text-ink sm:col-span-2">
                              {formatBookingParticipantsLabel(booking)}
                            </p>
                          </div>
                        ) : (
                          <p className="mt-1 text-[13px] text-ink">
                            {formatBookingParticipantsLabel(booking)}
                            {stayNightCount > 0
                              ? ` · ${stayNightCount} night${stayNightCount === 1 ? '' : 's'}`
                              : ''}
                          </p>
                        )}
                        {dep.purchasedNote ? (
                          <p className="mt-0.5 text-[12px] text-ink-muted">{dep.purchasedNote}</p>
                        ) : null}
                      </div>
                    </div>
                    {isStay && stayRange ? (
                      <div className="tv-stay-drawer__inout mt-2.5">
                        <div className="tv-stay-drawer__inout-block">
                          <p className="tv-stay-drawer__inout-label">Check-in</p>
                          <p className="tv-stay-drawer__inout-value">
                            {formatStayNightHuman(stayRange.checkIn)}
                          </p>
                          {stayInTime ? (
                            <p className="tv-stay-drawer__inout-time">From {stayInTime}</p>
                          ) : null}
                        </div>
                        <div className="tv-stay-drawer__inout-block">
                          <p className="tv-stay-drawer__inout-label">Check-out</p>
                          <p className="tv-stay-drawer__inout-value">
                            {formatStayNightHuman(stayRange.checkOut)}
                          </p>
                          {stayOutTime ? (
                            <p className="tv-stay-drawer__inout-time">By {stayOutTime}</p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </DrawerSection>

                  {booking.guest_email || guestPhone || requestNotes ? (
                  <DrawerSection title={isStay ? 'Guest contact' : 'Customer'} compact={c}>
                    <dl className="space-y-1">
                      {booking.guest_email ? (
                        <DrawerFact label="Email" compact={c}>
                          <a
                            href={`mailto:${booking.guest_email}`}
                            className="break-all text-finland hover:underline [overflow-wrap:anywhere]"
                          >
                            {booking.guest_email}
                          </a>
                        </DrawerFact>
                      ) : null}
                      {guestPhone ? (
                        <DrawerFact label="Phone" compact={c}>
                          <a href={phoneHref} className="text-finland hover:underline">
                            {guestPhone}
                          </a>
                        </DrawerFact>
                      ) : null}
                    </dl>
                    {requestNotes ? (
                      <div className="pt-1">
                        <p className="text-[12px] text-ink-faint">Notes</p>
                        <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-ink [overflow-wrap:anywhere]">
                          {drawerExtra === 'notes' || requestNotes.length <= (isStay ? 120 : 160)
                            ? requestNotes
                            : `${requestNotes.slice(0, isStay ? 120 : 160).trimEnd()}…`}
                        </p>
                        {requestNotes.length > (isStay ? 120 : 160) ? (
                          <button
                            type="button"
                            className="text-[13px] font-semibold text-finland"
                            aria-expanded={drawerExtra === 'notes'}
                            onClick={() => setDrawerExtra(drawerExtra === 'notes' ? null : 'notes')}
                          >
                            {drawerExtra === 'notes' ? 'Show less' : 'Show full note'}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </DrawerSection>
                  ) : null}

                  {hasOperations ? (
                  <DrawerSection title={isStay ? 'Property details' : 'Operations'} compact={c}>
                    {!isStay && placeShown ? <DrawerFact label={placePrefix}>{placeShown}</DrawerFact> : null}
                    {!isStay && houseTimes ? <DrawerFact label="Times">{houseTimes}</DrawerFact> : null}
                    {!isStay && checkInAddress ? (
                      <DrawerFact label="Address" compact={c}>{checkInAddress}</DrawerFact>
                    ) : null}
                    {showPickup && pickupHm ? <DrawerFact label="Pickup time">{pickupHm}</DrawerFact> : null}
                    {!isStay && pickupInstructions && (showPickup || showMeeting) ? (
                      <div>
                        <p className="text-[12px] text-ink-faint">Instructions</p>
                        <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-ink">
                          {drawerExtra === 'instructions' || pickupInstructions.length <= 140
                            ? pickupInstructions
                            : `${pickupInstructions.slice(0, 140).trimEnd()}…`}
                        </p>
                        {pickupInstructions.length > 140 ? (
                          <button
                            type="button"
                            className="text-[13px] font-semibold text-finland"
                            aria-expanded={drawerExtra === 'instructions'}
                            onClick={() => setDrawerExtra(drawerExtra === 'instructions' ? null : 'instructions')}
                          >
                            {drawerExtra === 'instructions' ? 'Show less' : 'Show instructions'}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {bookingLogistics ? <DrawerFact label="Transfer">{bookingLogistics}</DrawerFact> : null}
                    {!isStay && needsAck ? (
                      <p className="text-[13px] font-medium text-finland">
                        This booking is waiting for acknowledgement.
                      </p>
                    ) : null}
                    {booking.acknowledged_at ? (
                      <DrawerFact label={isStay ? 'Reviewed' : 'Acknowledged'} compact={c}>
                        {new Date(booking.acknowledged_at).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </DrawerFact>
                    ) : null}
                    {pickupGap ? (
                      <p className="text-[13px] leading-5 text-amber-900">
                        {fulfillment === 'pickup'
                          ? 'Pickup address or time is missing, so the guest does not know where to be collected.'
                          : 'Meeting details are missing, so the guest does not know where to meet.'}{' '}
                        <button
                          type="button"
                          className="font-semibold text-finland hover:underline"
                          onClick={() => openSupplierPickup(booking.id)}
                        >
                          {fulfillment === 'pickup' ? 'Open Pickup planner' : 'Update meeting details'}
                        </button>
                      </p>
                    ) : null}
                    {isStay && (checkInAddress || pickupInstructions) ? (
                      <div className="mt-1">
                        <button
                          type="button"
                          className="text-[12.5px] font-semibold text-finland"
                          aria-expanded={drawerExtra === 'arrival'}
                          onClick={() => setDrawerExtra(drawerExtra === 'arrival' ? null : 'arrival')}
                        >
                          {drawerExtra === 'arrival' ? 'Hide arrival details' : 'Arrival & address'}
                        </button>
                        {drawerExtra === 'arrival' ? (
                          <div className="mt-1.5 space-y-1.5">
                            {checkInAddress ? (
                              <DrawerFact label="Address" compact>
                                {checkInAddress}
                              </DrawerFact>
                            ) : null}
                            {pickupInstructions ? (
                              <p className="whitespace-pre-wrap break-words text-[12.5px] leading-snug text-ink">
                                {pickupInstructions}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {houseRules ? (
                      isStay ? (
                        <div className="mt-1">
                          <button
                            type="button"
                            className="text-[12.5px] font-semibold text-finland"
                            aria-expanded={drawerExtra === 'rules'}
                            onClick={() => setDrawerExtra(drawerExtra === 'rules' ? null : 'rules')}
                          >
                            {drawerExtra === 'rules' ? 'Hide house rules' : 'House rules'}
                          </button>
                          {drawerExtra === 'rules' ? (
                            <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] leading-snug text-ink">
                              {houseRules}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                      <div>
                        <p className="text-[12px] font-medium text-ink-faint">House rules</p>
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-[12.5px] leading-snug text-ink">
                          {drawerExtra === 'rules' || houseRules.length <= 140
                            ? houseRules
                            : `${houseRules.slice(0, 140).trimEnd()}…`}
                        </p>
                        {houseRules.length > 140 ? (
                          <button
                            type="button"
                            className="mt-0.5 text-[12.5px] font-semibold text-finland"
                            aria-expanded={drawerExtra === 'rules'}
                            onClick={() => setDrawerExtra(drawerExtra === 'rules' ? null : 'rules')}
                          >
                            {drawerExtra === 'rules' ? 'Show less' : 'Show house rules'}
                          </button>
                        ) : null}
                      </div>
                      )
                    ) : null}
                    {partnerBookingIsUnpaidCheckout(booking) ? (
                      <NoticeCallout
                        title={partnerUnpaidCheckoutHoldsInventory(booking) ? 'Checkout hold still open' : 'Hold expired'}
                        tone={partnerUnpaidCheckoutHoldsInventory(booking) ? 'warn' : 'info'}
                      >
                        {partnerUnpaidCheckoutHoldsInventory(booking)
                          ? `${formatPartnerCheckoutHoldLabel(booking)}. The traveler may still complete payment. Cancelling releases this hold.`
                          : 'Inventory is already released. Clear this row if you no longer need it — this does not free additional spots.'}
                      </NoticeCallout>
                    ) : null}
                    {openCancel ? (
                      <NoticeCallout
                        title={
                          openCancel.expires_at && new Date(openCancel.expires_at).getTime() < Date.now()
                            ? 'Review window passed — still waiting'
                            : 'Waiting for the traveler'
                        }
                        tone="warn"
                      >
                        Requested{' '}
                        {new Date(openCancel.created_at).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                        {openCancel.expires_at
                          ? ` · noted until ${new Date(openCancel.expires_at).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}`
                          : ''}
                        . The booking stays active until the traveler accepts. Traverion does not auto-cancel if they do
                        not respond. {PARTNER_CANCELLATION_REQUEST_DELIVERY_NOTE}
                      </NoticeCallout>
                    ) : null}
                    {isStay ? (
                      <button
                        type="button"
                        className="mt-1 text-[12.5px] font-semibold text-finland hover:underline"
                        onClick={() =>
                          navigateSupplierUrl(
                            `${PARTNER_APP_BASE}/stay-calendar?listing=${encodeURIComponent(booking.listing_id)}`
                          )
                        }
                      >
                        Open Stay Calendar
                      </button>
                    ) : null}
                  </DrawerSection>
                  ) : null}

                  <DrawerSection title="Payment" compact={c}>
                    {commercialState === 'loading' ? (
                      <p className="text-[13px] text-ink-muted">Loading earnings…</p>
                    ) : commercialSnapshot && commercialState === 'ready' ? (
                      <>
                        <DrawerFact label="Your earnings" compact={c}>
                          <span className="tabular-nums">
                            {formatSnapshotMinor(
                              commercialSnapshot.remaining_supplier_minor,
                              commercialSnapshot.currency
                            )}
                          </span>
                        </DrawerFact>
                        {!isStay ? (
                          <p className="text-[12px] leading-4 text-ink-faint">
                            {commissionAdjusted
                              ? 'Earnings follow the refund recorded on this booking. This is not a payout.'
                              : 'Your earnings are not a payout.'}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          className="text-[13px] font-semibold text-finland"
                          onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/money?tab=documents`)}
                        >
                          View financial statement
                        </button>
                      </>
                    ) : (
                      <p className="text-[13px] text-ink-muted">
                        Your earnings are not recorded for this booking.
                      </p>
                    )}
                    <DrawerFact label="Status" compact={c}>{partnerPaymentLabel(booking)}</DrawerFact>
                    {isStayRequestAwaitingHost(booking) ? (
                      <StayRequestActions
                        role="supplier"
                        booking={{
                          ...booking,
                          listingTitle: displayListingTitleFromPurchase(
                            booking.purchase_snapshot,
                            listingMeta[booking.listing_id]?.title,
                            'Stay'
                          ),
                        }}
                        onDone={() => void load()}
                      />
                    ) : null}
                    {isStay && readStayBookingPrice(booking.purchase_snapshot) ? (
                      <SavedStayPrice
                        snapshot={booking.purchase_snapshot}
                        currency={booking.currency}
                        amountPaid={bookingPaymentWasCollected(booking.payment_status) ? Number(booking.amount_paid) : null}
                        totalLabel="Guest total"
                      />
                    ) : null}
                    {collectedLabel && (collectedLabel !== bookingTotalLabel || collectedCaption !== 'Paid') ? (
                      <DrawerFact label={collectedCaption} compact={c}>{collectedLabel}</DrawerFact>
                    ) : null}
                    {partnerPaymentLabel(booking) === 'Refund due' ? (
                      <div className="rounded-md border border-black/[0.06] border-l-[3px] border-l-amber-500 bg-paper px-3 py-2">
                        <p className="text-[13px] font-semibold text-ink">Refund due</p>
                        <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{REFUND_DUE_MANUAL_COPY}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBookingId(null);
                            navigateSupplierUrl(`${PARTNER_APP_BASE}/money`);
                          }}
                          className="mt-1 text-[12px] font-semibold text-finland hover:underline"
                        >
                          Open Income
                        </button>
                      </div>
                    ) : null}
                  </DrawerSection>

                  <div className={isStay ? 'tv-stay-drawer__section' : 'border-t border-black/[0.06] pt-2'}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between py-1 text-[13px] font-semibold text-ink"
                      aria-expanded={drawerExtra === 'activity'}
                      onClick={() => setDrawerExtra(drawerExtra === 'activity' ? null : 'activity')}
                    >
                      {isStay ? 'Activity' : 'Booking activity'}
                      <ChevronDown
                        className={`h-4 w-4 text-ink-faint transition-transform duration-150 motion-reduce:transition-none ${drawerExtra === 'activity' ? 'rotate-180' : ''}`}
                        aria-hidden
                      />
                    </button>
                    {drawerExtra === 'activity' ? (
                      <div>
                        <p className="sr-only">History</p>
                        <ol className="space-y-1 text-[13px] text-ink-muted">
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
                            // Phase 1549: History must match amount caption — never hardcode Paid on Refund due.
                            <li>{partnerCollectedAmountCaption(booking)}</li>
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
                          {pickupHm && showPickup ? <li>Pickup set · {pickupHm}</li> : null}
                          {openCancel ? (
                            <li>
                              Cancellation requested{' '}
                              {new Date(openCancel.created_at).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </li>
                          ) : null}
                          {booking.status === 'cancelled' ? <li>Cancelled</li> : null}
                          {activityEvents.map((event) => (
                            <li key={event.id}>
                              {event.event_type.replace(/_/g, ' ')}
                              {event.details ? ` · ${event.details}` : ''} ·{' '}
                              {new Date(event.created_at).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                  </div>
                </div>
                <footer
                  className={
                    isStay
                      ? 'tv-stay-drawer__footer'
                      : 'flex shrink-0 flex-wrap items-center gap-2 border-t border-black/[0.06] bg-white px-4 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))]'
                  }
                >
                  {canEditBookings &&
                  partnerBookingIsOperatingTrip(booking) &&
                  booking.status === 'pending' &&
                  String(booking.payment_status ?? '').toLowerCase() !== 'authorized' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleStatusChange(booking, 'confirmed')}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-finland px-3 text-[13px] font-semibold text-white hover:bg-finland-dark disabled:opacity-50"
                    >
                      <CheckCircle className="h-3.5 w-3.5" aria-hidden />
                      {busy ? 'Saving…' : 'Confirm'}
                    </button>
                  ) : null}
                  {/* Phase 1752: Message guest opens Inbox; compose stays role-gated there. */}
                  <button
                    type="button"
                    onClick={() => openSupplierInbox(booking.id)}
                    className={
                      isStay
                        ? 'tv-stay-drawer__primary inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold disabled:opacity-50'
                        : 'inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-semibold text-ink ring-1 ring-black/[0.1] hover:bg-black/[0.03]'
                    }
                  >
                    <Mail className="h-3.5 w-3.5" aria-hidden />
                    {isStay ? 'Message guest' : 'Message customer'}
                  </button>
                  {canEditBookings && needsAck ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleAcknowledge(booking)}
                      className={
                        isStay
                          ? 'inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-semibold text-ink ring-1 ring-black/[0.1] hover:bg-black/[0.03] disabled:opacity-50'
                          : 'inline-flex h-9 items-center gap-1.5 rounded-full bg-finland px-3 text-[13px] font-semibold text-white hover:bg-finland-dark disabled:opacity-50'
                      }
                      title={
                        isStay
                          ? 'Informational only — does not change payment or confirmation'
                          : undefined
                      }
                    >
                      {busy ? 'Saving…' : isStay ? 'Mark as reviewed' : 'Acknowledge'}
                    </button>
                  ) : null}
                  {isStay ? (
                    canEditBookings &&
                    (partnerBookingIsOperatingTrip(booking) ||
                      partnerBookingIsUnpaidCheckout(booking)) ? (
                      <div className="tv-stay-drawer__more ml-auto">
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted ring-1 ring-black/[0.08] hover:bg-black/[0.03]"
                          aria-expanded={drawerMoreOpen}
                          aria-haspopup="menu"
                          aria-label="More actions"
                          onClick={() => setDrawerMoreOpen((open) => !open)}
                        >
                          <MoreHorizontal className="h-4 w-4" aria-hidden />
                        </button>
                        {drawerMoreOpen ? (
                          <div className="tv-stay-drawer__more-menu" role="menu">
                            {partnerBookingIsOperatingTrip(booking) ? (
                              <button
                                type="button"
                                role="menuitem"
                                disabled={busy || Boolean(openCancel)}
                                className="tv-stay-drawer__more-item"
                                onClick={() => {
                                  setDrawerMoreOpen(false);
                                  setCancelError(null);
                                  setCancelReasonText('');
                                  setCancelEvidence('');
                                  setCancelModal(booking);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                {openCancel ? 'Awaiting traveler' : 'Request cancellation'}
                              </button>
                            ) : null}
                            {partnerBookingIsUnpaidCheckout(booking) ? (
                              <button
                                type="button"
                                role="menuitem"
                                disabled={busy}
                                className="tv-stay-drawer__more-item"
                                onClick={() => {
                                  setDrawerMoreOpen(false);
                                  setCancelError(null);
                                  setCancelReasonText('');
                                  setCancelEvidence('');
                                  setCancelModal(booking);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                {partnerUnpaidCheckoutHoldsInventory(booking)
                                  ? 'Cancel unpaid'
                                  : 'Clear expired hold'}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null
                  ) : (
                    <>
                      {canEditBookings && partnerBookingIsOperatingTrip(booking) ? (
                        <button
                          type="button"
                          disabled={busy || Boolean(openCancel)}
                          onClick={() => {
                            setCancelError(null);
                            setCancelReasonText('');
                            setCancelEvidence('');
                            setCancelModal(booking);
                          }}
                          className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          {openCancel ? 'Awaiting traveler' : 'Request cancellation'}
                        </button>
                      ) : null}
                      {canEditBookings && partnerBookingIsUnpaidCheckout(booking) ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setCancelError(null);
                            setCancelReasonText('');
                            setCancelEvidence('');
                            setCancelModal(booking);
                          }}
                          className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          {partnerUnpaidCheckoutHoldsInventory(booking)
                            ? 'Cancel unpaid'
                            : 'Clear expired hold'}
                        </button>
                      ) : null}
                    </>
                  )}
                </footer>
              </div>
            );
          })()}
        </SupplierDetailDrawer>
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
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-faint" id="cancel-reason-code-label">
                    Reason
                  </span>
                  <PartnerSelect
                    id="cancel-reason-code"
                    aria-labelledby="cancel-reason-code-label"
                    value={cancelReason}
                    onChange={setCancelReason}
                    options={CANCELLATION_REASONS.map((reason) => ({
                      value: reason.id,
                      label: reason.label,
                    }))}
                  />
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
