import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  CalendarDays,
  Search,
  X,
} from 'lucide-react';
import type { TourPackage } from '../../types/tour';
import { listingHeroImageSrc, orderedPhotoUrls, photoSlotsFromTourPackage } from '../../lib/listingPhotoGrid';
import { formatMoney, normalizeCurrency } from '../../lib/money';
import { fetchBookingCommercialSnapshot, type BookingCommercialSnapshotRow } from '../../data/supabase-earnings';
import { isPaidPaymentStatus, partnerPaymentLabel, partnerCollectedAmountCaption, bookingPaymentWasCollected, refundDueManualCopy } from '../../lib/payment-states';
import { PARTNER_BOOKINGS_CSV_HEADER, partnerBookingCsvValues } from '../../lib/partner-bookings-csv';
import { csvSafeCell } from '../../lib/csv-export';
import { localYmd } from '../../lib/local-ymd';
import { guestFacingBookingNotes } from '../../lib/booking-notes';
import { formatBookingParticipantsLabel } from '../../lib/participant-mix';
import { supplierCancellationReasonLabel } from '../../lib/cancellation-policy';
import { buildCancellationCandidate, type CancellationBatchRow, type CancellationCandidate, type CancellationFamily } from '../../lib/supplier-cancellation-workflow';
import SupplierCancellationWorkflow, { type CancellationWorkflowResultRow } from '../../components/supplier/SupplierCancellationWorkflow';
import { openHostCancelRequestVisible } from '../../lib/host-cancel-request-visibility';
import {
  attestTourServiceFulfillment,
  fetchCancellationRequestsForBookings,
  fetchOpenCancellationBookingIds,
  notifyTravelerCancellationRequest,
  requestSupplierCancellationBatch,
  type CancellationRequestRow,
} from '../../data/supabase-booking-ops';
import PartnerSelect from '../../components/supplier/PartnerSelect';
import { TraverionDateRangeField } from '../../components/calendar/TraverionDateRangeField';
import SupplierSupportCaseRespond from '../../components/supplier/SupplierSupportCaseRespond';
import NoticeCallout from '../../components/NoticeCallout';
import { PARTNER_CANCEL_REQUEST_SUBMIT_ERROR } from '../../lib/booking-confirmation-copy';
import { SkeletonListItem } from '../../components/ui/Skeleton';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import {
  SUPPLIER_PAGE_CLASS,
  SupplierEmptyState,
  SupplierPageHero,
} from '../../components/supplier/supplierUi';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import {
  executeBookingRefund,
  fetchAllSupplierBookingDeskRows,
  fetchBookingsForSupplier,
  fetchSupplierBookingDeskPage,
  type SupplierBookingDeskQuery,
  type BookingRow,
  updateBookingStatus,
} from '../../data/supabase-bookings';
import StayRequestActions from '../../components/StayRequestActions';
import BookingOpsNotesEditor from '../../components/supplier/BookingOpsNotesEditor';
import StayOpsReservationCard from '../../components/supplier/StayOpsReservationCard';
import StayOpsBookingDetail from '../../components/supplier/StayOpsBookingDetail';
import RentalOpsBookingCard from '../../components/supplier/RentalOpsBookingCard';
import RentalOpsBookingDetail from '../../components/supplier/RentalOpsBookingDetail';
import TourOpsBookingCard from '../../components/supplier/TourOpsBookingCard';
import TourOpsBookingDetail from '../../components/supplier/TourOpsBookingDetail';
import { isStayRequestAwaitingHost } from '../../lib/stay-request-approval';
import { insertSupplierExportRun } from '../../data/supabase-supplier-campaigns-exports';
import { decrementAvailabilityBooked } from '../../data/supabase-availability';
import { fetchMyListings, pgTimeToHm } from '../../data/supabase-listings';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings, canManageFinance } from '../../lib/supplierTeamRoles';
import { navigateSupplierUrl, openSupplierInbox, openSupplierPickup } from '../../lib/supplierPortalNavigation';
import {
  partnerBookingDeskPath,
  partnerBookingDeskPathPreservingSearch,
  readPartnerBookingIdFromLocation,
} from '../../lib/partner-booking-desk-path';
import { partnerInboxReturnMatches } from '../../lib/partner-page-transition';
import {
  takePrefetchedPartnerBookingCommercial,
} from '../../lib/partner-bookings-desk-prefetch';
import {
  formatCommissionPercentLabel,
  resolvePartnerArrivalDisplay,
} from '../../lib/partner-booking-logistics';
import { PARTNER_APP_BASE, PARTNER_CREATE_PATH } from '../../lib/partnerPortalPaths';
import { inventoryFamilyFromListing } from '../../lib/inventory';
import { nightsOccupiedByStay, stayRangeFromBooking } from '../../lib/stayOccupancy';
import {
  stayPaidAdjacentNightCount,
} from '../../lib/booking-confirmation-copy';
import { partnerBookingIsLiveTrip, partnerBookingIsOperatingTrip, partnerBookingIsUnpaidCheckout, scheduleTodayIsoForBooking } from '../../lib/trip-views';
import { addCalendarDaysYmd } from '../../lib/booking-lifecycle-calendar';
import { formatPartnerCheckoutHoldLabel, partnerUnpaidCheckoutHoldsInventory } from '../../lib/booking-hold';
import { formatStayNightHuman } from '../../lib/stay-calendar';
import { formatBookingDateDisplay } from '../../lib/booking-flow';
import {
  bookingIsRental,
  bookingIsStayNight,
  partnerBookingDeskFamily,
  partnerBookingHasPickupAttention,
  resolvePartnerPickupCopy,
} from '../../lib/pickup-completeness';
import type { PartnerBookingDeskFamily } from '../../lib/partner-booking-desk-path';
import { parseRentalPurchaseSnapshot } from '../../lib/rental-booking-domain';
import {
  formatRentalOpsInstant,
  formatRentalQuantityLabel,
  rentalReturnPoint,
} from '../../lib/rental-presentation';
import { rentalBookingSimpleStatusLabel } from '../../lib/rental-booking-status';
import { parseListingExtras, materializedBookingOptions } from '../../types/listingExtras';
import {
  partnerBookingLifecycleLabel,
  partnerBookingListBadgeLabel,
  type PartnerBookingsOps,
  type PartnerBookingsTravelWindow,
} from '../../lib/partner-bookings-desk';
import { normalizeRentalDetails } from '../../lib/rental-details';
import { travelerPublicBookingReference } from '../../lib/public-booking-reference';
import { fetchSupplierBookingEvents, type SupplierBookingEventRow } from '../../data/supabase-booking-events';
import { displayListingTitleFromPurchase, displayOptionLabelFromPurchase, displayDurationFromPurchase, displayStayCheckInTimeFromPurchase, displayStayCheckOutTimeFromPurchase, displayCheckInAddressFromPurchase, displayStayHouseRulesFromPurchase, partnerOpsDepartureDisplay, isPurchaseSnapshot, partnerListingFilterLabelFromBookings, type PurchaseSnapshot } from '../../lib/purchase-snapshot';
import { optionLogisticsLines, readOptionLogistics } from '../../lib/option-logistics';

const BOOKINGS_PAGE_SIZE = 20;

function resolveBookingFamily(
  booking: BookingRow,
  listingMeta: Record<string, ListingBookingMeta>
): PartnerBookingDeskFamily {
  const listed = listingMeta[booking.listing_id]?.family;
  if (listed === 'rental' || bookingIsRental(booking)) return 'rental';
  if (listed === 'stay' || bookingIsStayNight(booking)) return 'stay';
  if (listed === 'tour') return 'tour';
  return partnerBookingDeskFamily(booking);
}

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
  /** Tour options or rental variants available for the Option filter. */
  selectableOptions: Array<{ id: string; name: string }>;
  stayCheckInTime: string | null;
  stayCheckOutTime: string | null;
  rentalCategory: string | null;
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
  const rental = normalizeRentalDetails(extras.rental);
  const rentalVariants = (rental?.variants ?? [])
    .map((v) => ({ id: v.id, name: (v.name ?? '').trim() }))
    .filter((v) => v.id && v.name);
  const selectableOptions =
    opts.filter((o) => o.id && o.name).map((o) => ({ id: o.id, name: o.name })).length > 0
      ? opts.filter((o) => o.id && o.name).map((o) => ({ id: o.id, name: o.name }))
      : rentalVariants;
  return {
    title: listing.title,
    imageUrl,
    location,
    duration: listing.duration || '—',
    family: inventoryFamilyFromListing(listing),
    meetingPoint: listing.meetingPoint?.trim() || null,
    pickupInstructions: listing.pickupInstructions?.trim() || null,
    bookingOptions: opts,
    selectableOptions,
    stayCheckInTime: extras.stay?.checkInTime?.trim() || null,
    stayCheckOutTime: extras.stay?.checkOutTime?.trim() || null,
    rentalCategory: extras.rental?.category?.trim() || null,
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

function listStatusBadge(
  status: string | null | undefined,
  paymentStatus?: string | null
): { label: string | null; className: string } {
  const pay = (paymentStatus ?? '').trim().toLowerCase();
  if (pay === 'refunded') {
    return { label: 'Cancelled', className: bookingStatusClass('cancelled', pay) };
  }
  const label = partnerBookingListBadgeLabel(status);
  return { label, className: bookingStatusClass(status ?? '', paymentStatus) };
}

function rentalListStatusBadge(booking: BookingRow): { label: string | null; className: string } {
  const pay = (booking.payment_status ?? '').trim().toLowerCase();
  if (pay === 'refunded' || rentalBookingSimpleStatusLabel(booking) === 'Cancelled') {
    return { label: 'Cancelled', className: bookingStatusClass('cancelled', booking.payment_status) };
  }
  return { label: null, className: '' };
}

function readTravelWindow(raw: string | null): PartnerBookingsTravelWindow {
  if (
    raw === 'yesterday' ||
    raw === 'today' ||
    raw === 'tomorrow' ||
    raw === 'upcoming' ||
    raw === 'past' ||
    raw === 'range' ||
    raw === 'all'
  ) {
    return raw;
  }
  return 'all';
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
  inventoryFamily?: 'tour' | 'stay' | 'rental';
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
  const [expandedStayId, setExpandedStayId] = useState<string | null>(null);
  const [expandedTourId, setExpandedTourId] = useState<string | null>(null);
  const [expandedRentalId, setExpandedRentalId] = useState<string | null>(null);
  const [expandedEarningsLabel, setExpandedEarningsLabel] = useState<string | null>(null);
  const [expandedCommissionLabel, setExpandedCommissionLabel] = useState<string | null>(null);
  const [expandedCommissionRateLabel, setExpandedCommissionRateLabel] = useState<string | null>(null);
  const [expandedGuestPaidLabel, setExpandedGuestPaidLabel] = useState<string | null>(null);
  const [expandedEarningsState, setExpandedEarningsState] = useState<'idle' | 'loading' | 'ready' | 'missing'>(
    'idle'
  );
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
  const [filterOptionId, setFilterOptionId] = useState(() => {
    if (typeof window === 'undefined') return '';
    return (new URLSearchParams(window.location.search).get('option') ?? '').trim();
  });
  const [filterQuery, setFilterQuery] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('q') ?? '';
  });
  const [categoryFilter, setCategoryFilter] = useState<'' | PartnerBookingDeskFamily>(() => {
    if (typeof window === 'undefined' || inventoryFamily) return '';
    const c = (new URLSearchParams(window.location.search).get('category') ?? '').trim().toLowerCase();
    return c === 'tour' || c === 'stay' || c === 'rental' ? c : '';
  });
  const [searchDraft, setSearchDraft] = useState(filterQuery);

  const isUnifiedDesk = !inventoryFamily;

  const [bookingsListPage, setBookingsListPage] = useState(1);
  const [deskTotal, setDeskTotal] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [highlightBookingId, setHighlightBookingId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return readPartnerBookingIdFromLocation(window.location.pathname, window.location.search);
  });

  const [cancelFlow, setCancelFlow] = useState<{
    pool: CancellationCandidate[];
    initialIds: string[];
  } | null>(null);
  const [openCancels, setOpenCancels] = useState<Record<string, CancellationRequestRow>>({});

  const loadGenRef = useRef(0);
  const bookingsHubUserIdRef = useRef<string | null>(null);
  const bookingsLenRef = useRef(0);

  const deskQuery = useCallback(
    (listings: TourPackage[], cancelIds: string[]): SupplierBookingDeskQuery => {
      const rentalListingIds: string[] = [];
      const stayListingIds: string[] = [];
      const thinPickupListingIds: string[] = [];
      const searchListingIds: string[] = [];
      const q = filterQuery.trim().toLowerCase();
      for (const listing of listings) {
        const family = inventoryFamilyFromListing(listing);
        if (family === 'rental') rentalListingIds.push(listing.id);
        if (family === 'stay') stayListingIds.push(listing.id);
        const copy = `${listing.meetingPoint ?? ''} ${listing.pickupInstructions ?? ''}`.trim();
        if (copy.length < 20) thinPickupListingIds.push(listing.id);
        if (q && listing.title.toLowerCase().includes(q)) searchListingIds.push(listing.id);
      }
      const family = inventoryFamily ?? (categoryFilter || undefined);
      return {
        family,
        rentalListingIds,
        stayListingIds,
        thinPickupListingIds,
        searchListingIds,
        optionId: filterOptionId || undefined,
        ops: opsFilter,
        cancelBookingIds: cancelIds,
        search: filterQuery,
        fromDate: filterDateFrom || undefined,
        toDate: filterDateTo || undefined,
        travel: view,
        today: localYmd(new Date()),
        listingId: filterListingId || undefined,
      };
    },
    [categoryFilter, filterDateFrom, filterDateTo, filterListingId, filterOptionId, filterQuery, inventoryFamily, opsFilter, view]
  );

  const load = useCallback(async () => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setLoading(false);
      return;
    }
    const gen = ++loadGenRef.current;
    if (bookingsLenRef.current === 0) setLoading(true);
    setError(null);
    setCancelRequestsError(null);
    try {
      const myListings = await fetchMyListings(uid);
      const cancelIds = opsFilter === 'cancel' ? await fetchOpenCancellationBookingIds() : [];
      const query = deskQuery(myListings, cancelIds);
      const page = await fetchSupplierBookingDeskPage(uid, {
        ...query,
        offset: (bookingsListPage - 1) * BOOKINGS_PAGE_SIZE,
        limit: BOOKINGS_PAGE_SIZE,
      });
      if (gen !== loadGenRef.current) return;
      const meta: Record<string, ListingBookingMeta> = {};
      myListings.forEach((listing) => {
        meta[listing.id] = buildListingMeta(listing);
      });
      let rows = page.rows.filter(partnerBookingIsLiveTrip);
      if (
        highlightBookingId &&
        !rows.some((b) => b.id === highlightBookingId) &&
        !filterDateFrom &&
        !filterDateTo &&
        !filterListingId &&
        !filterQuery.trim() &&
        !filterOptionId &&
        opsFilter === 'all' &&
        view === 'all' &&
        !categoryFilter
      ) {
        const target = await fetchBookingsForSupplier(uid, { bookingId: highlightBookingId, limit: 1 });
        const hit = target[0];
        if (hit?.created_at) {
          const newer = await fetchSupplierBookingDeskPage(uid, {
            ...query,
            newerThan: { createdAt: hit.created_at, id: hit.id },
            limit: 1,
          });
          const targetPage = Math.floor(newer.total / BOOKINGS_PAGE_SIZE) + 1;
          if (targetPage !== bookingsListPage) {
            setBookingsListPage(targetPage);
            return;
          }
          rows = [hit, ...rows.filter((b) => b.id !== hit.id)];
        }
      }
      bookingsLenRef.current = rows.length;
      setDeskTotal(page.total);
      setBookings(rows);
      setListingMeta(meta);
      try {
        const reqs = await fetchCancellationRequestsForBookings(rows.map((b) => b.id));
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
  }, [
    isSupabase,
    user?.id,
    filterDateFrom,
    filterDateTo,
    filterListingId,
    filterQuery,
    highlightBookingId,
    bookingsListPage,
    deskQuery,
    opsFilter,
    view,
    categoryFilter,
  ]);

  // Phase 1384 + layout: clear prior partner bookings before paint on account switch (useEffect ran one frame too late).
  useLayoutEffect(() => {
    const clearBookingsPartnerWorkspace = () => {
      bookingsLenRef.current = 0;
      setBookings([]);
      setListingMeta({});
      setOpenCancels({});
      setError(null);
      setCancelRequestsError(null);
      setCancelFlow(null);
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

  // Wrong-desk / unified deep links → correct family detail section.
  useEffect(() => {
    if (!highlightBookingId || loading) return;
    const booking = bookings.find((b) => b.id === highlightBookingId);
    if (!booking) return;
    const actualFamily = resolveBookingFamily(booking, listingMeta);
    if (isUnifiedDesk) {
      if (actualFamily === 'tour') return;
      navigateSupplierUrl(
        partnerBookingDeskPathPreservingSearch({
          family: actualFamily,
          bookingId: highlightBookingId,
          currentSearch: window.location.search,
        })
      );
      return;
    }
    if (actualFamily === inventoryFamily) return;
    navigateSupplierUrl(
      partnerBookingDeskPathPreservingSearch({
        family: actualFamily,
        bookingId: highlightBookingId,
        currentSearch: window.location.search,
      })
    );
  }, [inventoryFamily, isUnifiedDesk, highlightBookingId, bookings, listingMeta, loading]);

  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const id = readPartnerBookingIdFromLocation(window.location.pathname, window.location.search);
      // Legacy ?booking= → canonical /partner/bookings/:id (preserve other filters).
      const legacyId = (params.get('booking') ?? '').trim();
      if (legacyId && !window.location.pathname.includes(`/${legacyId}`)) {
        const pathNow = window.location.pathname;
        const legacyFamily: 'tour' | 'stay' | 'rental' = pathNow.includes('/rental-bookings')
          ? 'rental'
          : pathNow.includes('/reservations')
            ? 'stay'
            : 'tour';
        const next = partnerBookingDeskPath({
          family: legacyFamily,
          bookingId: legacyId,
          extraSearch: params,
        });
        window.history.replaceState({}, '', next);
      }
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
      if (
        v === 'yesterday' ||
        v === 'today' ||
        v === 'tomorrow' ||
        v === 'upcoming' ||
        v === 'past' ||
        v === 'range' ||
        v === 'all'
      ) {
        if (!(ops === 'refund_due' || ops === 'unpaid' || ops === 'cancel')) setView(v);
      }
      const q = params.get('q') ?? '';
      setFilterQuery(q);
      setSearchDraft(q);
      const listing = (params.get('listing') ?? '').trim();
      setFilterListingId(listing);
      const option = (params.get('option') ?? '').trim();
      setFilterOptionId(option);
      const from = (params.get('from') ?? '').trim();
      const to = (params.get('to') ?? '').trim();
      setFilterDateFrom(/^\d{4}-\d{2}-\d{2}$/.test(from) ? from : '');
      setFilterDateTo(/^\d{4}-\d{2}-\d{2}$/.test(to) ? to : '');
      if (!inventoryFamily) {
        const category = (params.get('category') ?? '').trim().toLowerCase();
        setCategoryFilter(
          category === 'tour' || category === 'stay' || category === 'rental' ? category : ''
        );
      }
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [inventoryFamily]);

  const writeBookingsSearchToUrl = useCallback(
    (patch: {
      listingId?: string;
      optionId?: string;
      from?: string;
      to?: string;
      view?: BookingView;
      q?: string;
      category?: '' | PartnerBookingDeskFamily;
    }) => {
      let listingId = patch.listingId !== undefined ? patch.listingId : filterListingId;
      let optionId = patch.optionId !== undefined ? patch.optionId : filterOptionId;
      const from = patch.from !== undefined ? patch.from : filterDateFrom;
      const to = patch.to !== undefined ? patch.to : filterDateTo;
      const nextView = patch.view !== undefined ? patch.view : view;
      const nextQuery = patch.q !== undefined ? patch.q : filterQuery;
      const nextCategory = patch.category !== undefined ? patch.category : categoryFilter;

      if (patch.category !== undefined && listingId) {
        const listedFamily = listingMeta[listingId]?.family;
        if (patch.category && listedFamily && listedFamily !== patch.category) {
          listingId = '';
          optionId = '';
        }
      }
      if (patch.listingId !== undefined) {
        optionId = patch.optionId !== undefined ? patch.optionId : '';
      } else if (listingId && optionId) {
        const valid = listingMeta[listingId]?.selectableOptions.some((o) => o.id === optionId);
        if (!valid) optionId = '';
      }

      if (patch.listingId !== undefined || listingId !== filterListingId) setFilterListingId(listingId);
      if (patch.optionId !== undefined || optionId !== filterOptionId) setFilterOptionId(optionId);
      if (patch.from !== undefined) setFilterDateFrom(patch.from);
      if (patch.to !== undefined) setFilterDateTo(patch.to);
      if (patch.view !== undefined) setView(patch.view);
      if (patch.category !== undefined) setCategoryFilter(patch.category);
      if (patch.q !== undefined) {
        setFilterQuery(patch.q);
        setSearchDraft(patch.q);
      }
      const url = new URL(window.location.href);
      if (!listingId) url.searchParams.delete('listing');
      else url.searchParams.set('listing', listingId);
      if (!optionId) url.searchParams.delete('option');
      else url.searchParams.set('option', optionId);
      if (!from) url.searchParams.delete('from');
      else url.searchParams.set('from', from);
      if (!to) url.searchParams.delete('to');
      else url.searchParams.set('to', to);
      if (nextView === 'all') url.searchParams.delete('view');
      else url.searchParams.set('view', nextView);
      // Retired toolbar filters — drop stale URL params.
      url.searchParams.delete('sort');
      url.searchParams.delete('status');
      url.searchParams.delete('pay');
      url.searchParams.delete('purchasedFrom');
      url.searchParams.delete('purchasedTo');
      if (!nextQuery.trim()) url.searchParams.delete('q');
      else url.searchParams.set('q', nextQuery.trim());
      if (!isUnifiedDesk || !nextCategory) url.searchParams.delete('category');
      else url.searchParams.set('category', nextCategory);
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
      setBookingsListPage(1);
    },
    [
      filterListingId,
      filterOptionId,
      filterDateFrom,
      filterDateTo,
      view,
      filterQuery,
      categoryFilter,
      isUnifiedDesk,
      listingMeta,
    ]
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (searchDraft === filterQuery) return;
      writeBookingsSearchToUrl({ q: searchDraft });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [searchDraft, filterQuery, writeBookingsSearchToUrl]);

  const setSelectedBookingId = useCallback(
    (id: string | null) => {
      const path = window.location.pathname;
      let family: PartnerBookingDeskFamily =
        inventoryFamily ??
        (path.includes('/rental-bookings')
          ? 'rental'
          : path.includes('/reservations')
            ? 'stay'
            : 'tour');
      if (id) {
        const booking = bookings.find((b) => b.id === id);
        if (booking) family = resolveBookingFamily(booking, listingMeta);
      } else if (isUnifiedDesk) {
        family = 'tour';
      }
      const url = new URL(window.location.href);
      url.searchParams.delete('booking');
      const next = partnerBookingDeskPath({
        family,
        bookingId: id,
        extraSearch: url.searchParams,
      });
      window.history.pushState({}, '', next);
      setHighlightBookingId(id);
      // Family desk routes remount via layout when path section changes.
      if (family !== 'tour' || path.includes('/reservations') || path.includes('/rental-bookings')) {
        navigateSupplierUrl(next);
      }
    },
    [inventoryFamily, isUnifiedDesk, bookings, listingMeta]
  );

  const leaveBookingDetail = useCallback(
    (bookingId: string | null) => {
      if (bookingId && partnerInboxReturnMatches(bookingId)) {
        openSupplierInbox(bookingId, { fromBookingDetail: true });
        return;
      }
      if (inventoryFamily === 'stay' || inventoryFamily === 'rental') {
        const url = new URL(window.location.href);
        url.searchParams.delete('booking');
        const qs = url.searchParams.toString();
        navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings${qs ? `?${qs}` : ''}`);
        return;
      }
      setSelectedBookingId(null);
    },
    [inventoryFamily, setSelectedBookingId]
  );

  const openBookingInbox = useCallback((bookingId: string) => {
    openSupplierInbox(bookingId, { fromBookingDetail: true });
  }, []);

  const setOpsFilterAndUrl = useCallback((next: OpsFilter) => {
    setOpsFilter(next);
    if (next === 'refund_due' || next === 'unpaid' || next === 'cancel') setView('all');
    const url = new URL(window.location.href);
    if (next === 'all') url.searchParams.delete('ops');
    else url.searchParams.set('ops', next);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, []);

  const filteredBookings = bookings;
  const totalPages = Math.max(1, Math.ceil(deskTotal / BOOKINGS_PAGE_SIZE));
  const safePage = Math.min(Math.max(bookingsListPage, 1), totalPages);
  const paginatedBookings = filteredBookings;
  const paginationItems = useMemo(() => bookingPaginationRange(totalPages, safePage), [safePage, totalPages]);

  useEffect(() => {
    setBookingsListPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  useEffect(() => {
    setBookingsListPage(1);
  }, [view, filterListingId, filterOptionId, filterDateFrom, filterDateTo, filterQuery, opsFilter, categoryFilter]);

  useEffect(() => {
    if (!highlightBookingId || loading) return;
    if (filteredBookings.some((booking) => booking.id === highlightBookingId)) {
      requestAnimationFrame(() => {
        document.getElementById(`supplier-booking-row-${highlightBookingId}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      });
      return;
    }
    const filtersActive = Boolean(
      view !== 'all' ||
      opsFilter !== 'all' ||
      filterListingId ||
      filterOptionId ||
      filterDateFrom ||
      filterDateTo ||
      filterQuery ||
      categoryFilter
    );
    if (!filtersActive) return;
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
  }, [
    filteredBookings,
    highlightBookingId,
    loading,
    view,
    opsFilter,
    filterListingId,
    filterOptionId,
    filterDateFrom,
    filterDateTo,
    filterQuery,
    categoryFilter,
  ]);

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
        setError(userFacingError(res.error, 'Could not update this booking.'));
      }
      setUpdatingId(null);
    },
    [canEditBookings]
  );

  const cancellationCandidateFor = useCallback((booking: BookingRow): CancellationCandidate => {
    const meta = listingMeta[booking.listing_id];
    const family = resolveBookingFamily(booking, listingMeta);
    const startHm = partnerOpsDepartureDisplay(
      booking.purchase_snapshot,
      booking.start_time ? pgTimeToHm(booking.start_time) ?? null : null
    ).displayHm || '';
    const liveOption =
      booking.booking_option_id && meta?.bookingOptions?.length
        ? meta.bookingOptions.find((option) => option.id === booking.booking_option_id)?.name?.trim() || ''
        : '';
    return buildCancellationCandidate({
      id: booking.id,
      reference: bookingReferenceLabel(booking),
      guestName: booking.guest_name,
      guestEmail: booking.guest_email,
      guests: booking.guests,
      status: booking.status,
      paymentStatus: booking.payment_status,
      amountPaid: booking.amount_paid,
      currency: booking.currency,
      listingId: booking.listing_id,
      listingTitle: displayListingTitleFromPurchase(
        booking.purchase_snapshot,
        meta?.title,
        family === 'stay' ? 'Stay' : family === 'rental' ? 'Rental' : 'Tour'
      ),
      optionId: booking.booking_option_id,
      optionLabel: displayOptionLabelFromPurchase(booking.purchase_snapshot, liveOption),
      family: (family === 'stay' || family === 'rental' ? family : 'tour') as CancellationFamily,
      date: booking.booking_date,
      startHm,
      bookingNumber: booking.booking_number,
    });
  }, [listingMeta]);

  const openCancellationWorkflow = useCallback((rows: BookingRow[], initialIds: string[]) => {
    if (!canEditBookings) return;
    setCancelFlow({
      pool: rows.map(cancellationCandidateFor),
      initialIds,
    });
  }, [canEditBookings, cancellationCandidateFor]);

  const confirmPaidCancellation = useCallback(async (input: {
    bookings: CancellationCandidate[];
    reasonCode: string;
    reasonText: string;
    evidenceNote: string;
    idempotencyKey: string;
  }): Promise<{ ok: boolean; error?: string; rows: CancellationWorkflowResultRow[] }> => {
    const batch = await requestSupplierCancellationBatch({
      bookingIds: input.bookings.map((row) => row.id),
      reasonCode: input.reasonCode,
      reasonText: input.reasonText,
      evidenceNote: input.evidenceNote || undefined,
      idempotencyKey: input.idempotencyKey,
    });
    const byId = new Map(input.bookings.map((row) => [row.id, row]));
    const sourceRows: CancellationBatchRow[] = batch.results.length
      ? batch.results
      : input.bookings.map((row) => ({
          bookingId: row.id,
          ok: false,
          replayed: false,
          error: batch.error,
          autoRefundQueued: false,
          needsCustomerChoice: false,
        }));
    const rows: CancellationWorkflowResultRow[] = [];
    for (const result of sourceRows) {
      const booking = byId.get(result.bookingId);
      let notification: CancellationWorkflowResultRow['notification'] = 'not_sent';
      let refundNote = result.ok
        ? result.needsCustomerChoice
          ? 'Full refund is due if the traveler chooses a refund. It is not submitted yet.'
          : result.autoRefundQueued
            ? 'Refund submitted to Stripe when this cancellation succeeded.'
            : 'A full refund is due. Stripe has not confirmed it yet.'
        : 'Not submitted.';
      if (result.ok && !result.replayed && booking?.status.toLowerCase() === 'confirmed' && booking.date) {
        await decrementAvailabilityBooked(booking.listingId, booking.date, booking.guests || 1);
      }
      if (result.ok && result.autoRefundQueued) {
        const refund = await executeBookingRefund(result.bookingId);
        if (!refund.success) {
          refundNote = refund.error
            ? `Cancellation stands. Refund was not submitted: ${refund.error}`
            : 'Cancellation stands. Refund was not submitted.';
        } else if (refund.alreadyRefunded) {
          refundNote = 'Stripe already has this refund.';
        } else if (refund.pending) {
          refundNote = 'Refund is pending with Stripe.';
        } else {
          refundNote = 'Refund was submitted to Stripe. My bookings shows Refunded when Stripe confirms it.';
        }
      }
      if (result.ok && !result.replayed && booking) {
        const notify = await notifyTravelerCancellationRequest({
          customerEmail: booking.guestEmail || 'resolve@guest.local',
          customerName: booking.guestName,
          listingTitle: booking.listingTitle,
          bookingId: booking.id,
          bookingNumber: booking.bookingNumber ?? undefined,
          bookingDate: booking.date || undefined,
          reasonLabel: supplierCancellationReasonLabel(input.reasonCode),
          requestId: result.requestId,
          needsCustomerChoice: result.needsCustomerChoice,
          startTimeLabel: booking.startHm || null,
        });
        notification = notify.sent ? 'accepted' : 'unconfirmed';
      } else if (result.ok && result.replayed) {
        notification = 'unconfirmed';
      }
      rows.push({
        bookingId: result.bookingId,
        ok: result.ok,
        error: result.error,
        notification,
        refundNote,
      });
    }
    if (rows.some((row) => row.ok)) await load();
    return {
      ok: batch.ok,
      error: batch.ok ? undefined : batch.error || PARTNER_CANCEL_REQUEST_SUBMIT_ERROR,
      rows,
    };
  }, [load]);

  const releaseUnpaidCancellation = useCallback(async (candidate: CancellationCandidate) => {
    const booking = bookings.find((row) => row.id === candidate.id);
    if (!booking) return { ok: false, error: 'This booking is not available.' };
    const previous = booking.status;
    const res = await updateBookingStatus(booking.id, 'cancelled', {
      cancellation_reason: 'unpaid_release',
      refund_choice: 'no_refund',
    });
    if (!res.ok) return { ok: false, error: userFacingError(res.error, 'Could not release this hold.') };
    if (previous === 'confirmed' && booking.booking_date) {
      await decrementAvailabilityBooked(booking.listing_id, booking.booking_date, booking.guests ?? 1);
    }
    await load();
    return { ok: true };
  }, [bookings, load]);

  const listingOptions = useMemo(
    () =>
      Object.entries(listingMeta)
        .filter(([, m]) => {
          if (inventoryFamily) return m.family === inventoryFamily;
          if (categoryFilter) return m.family === categoryFilter;
          return true;
        })
        .map(([id, m]) => ({
          id,
          title: partnerListingFilterLabelFromBookings(id, m.title, bookings),
        })),
    [listingMeta, inventoryFamily, categoryFilter, bookings]
  );

  const optionFilterChoices = useMemo(() => {
    if (!filterListingId) return [] as Array<{ id: string; name: string }>;
    return listingMeta[filterListingId]?.selectableOptions ?? [];
  }, [filterListingId, listingMeta]);

  useEffect(() => {
    if (!filterOptionId) return;
    if (!filterListingId || !optionFilterChoices.some((o) => o.id === filterOptionId)) {
      setFilterOptionId('');
      const url = new URL(window.location.href);
      url.searchParams.delete('option');
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    }
  }, [filterListingId, filterOptionId, optionFilterChoices]);

  const selectedBooking = useMemo(
    () => (highlightBookingId ? bookings.find((b) => b.id === highlightBookingId) ?? null : null),
    [bookings, highlightBookingId]
  );

  useEffect(() => {
    setExpandedEarningsLabel(null);
    setExpandedCommissionLabel(null);
    setExpandedCommissionRateLabel(null);
    setExpandedGuestPaidLabel(null);
    const expandId = expandedStayId || expandedTourId || expandedRentalId;
    if (!expandId) {
      setExpandedEarningsState('idle');
      return;
    }
    let cancelled = false;
    setExpandedEarningsState('loading');
    void fetchBookingCommercialSnapshot(expandId).then((snap) => {
      if (cancelled) return;
      if (!snap) {
        setExpandedEarningsLabel(null);
        setExpandedCommissionLabel(null);
        setExpandedCommissionRateLabel(null);
        setExpandedGuestPaidLabel(null);
        setExpandedEarningsState('missing');
        return;
      }
      setExpandedGuestPaidLabel(formatSnapshotMinor(snap.remaining_gross_minor, snap.currency));
      setExpandedCommissionLabel(formatSnapshotMinor(snap.remaining_commission_minor, snap.currency));
      setExpandedCommissionRateLabel(formatCommissionPercentLabel(snap.commission_bps) || null);
      setExpandedEarningsLabel(formatSnapshotMinor(snap.remaining_supplier_minor, snap.currency));
      setExpandedEarningsState('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [expandedStayId, expandedTourId, expandedRentalId]);

  useEffect(() => {
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
    const commercialPromise =
      takePrefetchedPartnerBookingCommercial(highlightBookingId) ??
      fetchBookingCommercialSnapshot(highlightBookingId);
    void commercialPromise
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
    filterListingId,
    filterOptionId,
    view !== 'all' ? view : '',
    filterDateFrom || filterDateTo ? 'travel' : '',
    opsFilter !== 'all' ? opsFilter : '',
    filterQuery.trim(),
    isUnifiedDesk && categoryFilter ? categoryFilter : '',
  ].filter(Boolean).length;

  const resetBookingFilters = () => {
    writeBookingsSearchToUrl({
      view: 'all',
      listingId: '',
      optionId: '',
      from: '',
      to: '',
      q: '',
      category: '',
    });
    setOpsFilterAndUrl('all');
    setSelectedIds(new Set());
  };

  const isStayDesk = inventoryFamily === 'stay';
  const isRentalDesk = inventoryFamily === 'rental';

  const stayDetailMode = Boolean(isStayDesk && highlightBookingId);
  const rentalDetailMode = Boolean(isRentalDesk && highlightBookingId);
  const tourDetailMode = Boolean(!isStayDesk && !isRentalDesk && highlightBookingId);
  const listHidden = stayDetailMode || tourDetailMode || rentalDetailMode;

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      {!listHidden ? (
      <>
      <SupplierSupportCaseRespond supplierId={user?.id ?? null} />
      <SupplierPageHero
        badge={null}
        sansTitle
        title={isStayDesk ? 'Reservations' : isRentalDesk ? 'Rental bookings' : 'Bookings'}
        actions={
          bookings.length > 0 ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isRentalDesk ? (
              <button
                type="button"
                className="tv-btn-ghost"
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/money`)}
              >
                Earnings
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              className="tv-btn-ghost"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Refresh
            </button>
            {canEditBookings ? (
              <button
                type="button"
                className="rounded-lg bg-[#073B83] px-3 py-2 text-sm font-medium text-white"
                onClick={() => {
                  if (!user?.id) return;
                  const uid = user.id;
                  void (async () => {
                    try {
                      const listings = await fetchMyListings(uid);
                      const cancelIds = opsFilter === 'cancel' ? await fetchOpenCancellationBookingIds() : [];
                      const rows = await fetchAllSupplierBookingDeskRows(uid, deskQuery(listings, cancelIds));
                      openCancellationWorkflow(
                        rows,
                        rows.filter((booking) => selectedIds.has(booking.id)).map((booking) => booking.id)
                      );
                    } catch (cancelError) {
                      setError(userFacingError(cancelError, USER_ERROR.bookings));
                    }
                  })();
                }}
              >
                Cancel bookings
              </button>
            ) : null}
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
                if (!canExportBookingsCsv || !user?.id || exporting) return;
                const uid = user.id;
                void (async () => {
                  setExporting(true);
                  try {
                    const listings = await fetchMyListings(uid);
                    const cancelIds = opsFilter === 'cancel' ? await fetchOpenCancellationBookingIds() : [];
                    const rows = await fetchAllSupplierBookingDeskRows(uid, deskQuery(listings, cancelIds));
                    const filteredExport = Boolean(
                      filterDateFrom || filterDateTo || filterListingId || filterQuery.trim() || filterOptionId ||
                      opsFilter !== 'all' || categoryFilter || view !== 'all' || inventoryFamily
                    );
                    const audited = await downloadBookingsCsv(rows, listingMeta, {
                      supplierId: uid,
                      actorId: uid,
                      dateFrom: filterDateFrom || undefined,
                      dateTo: filterDateTo || undefined,
                      filtersSnapshot: {
                        surface: 'bookings',
                        scope: filteredExport ? 'filtered' : 'all',
                        view,
                        opsFilter,
                        listingId: filterListingId || null,
                        optionId: filterOptionId || null,
                        query: filterQuery.trim() || null,
                        category: categoryFilter || null,
                        inventoryFamily: inventoryFamily ?? null,
                        rowCount: rows.length,
                      },
                    });
                    if (!audited) {
                      setError('Export downloaded, but the audit log failed. Try again or contact support.');
                    }
                  } catch (exportError) {
                    setError(userFacingError(exportError, USER_ERROR.bookings));
                  } finally {
                    setExporting(false);
                  }
                })();
              }}
              disabled={!canExportBookingsCsv || exporting || deskTotal === 0}
              className="tv-btn-ghost disabled:opacity-50"
              title={
                !canExportBookingsCsv
                  ? 'Your role can view bookings but cannot export guest details'
                  : undefined
              }
            >
              <Download className="h-4 w-4" aria-hidden />
              {filterDateFrom || filterDateTo || filterListingId || filterQuery.trim() || filterOptionId || opsFilter !== 'all' || categoryFilter || view !== 'all'
                ? 'Export filtered bookings'
                : 'Export all bookings'}
            </button>
          </div>
          ) : undefined
        }
      >
      </SupplierPageHero>
      </>
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

      {listHidden ? null : loading && bookings.length === 0 ? (
        <div className="space-y-3 animate-fade-in-up" aria-busy="true" aria-label="Loading bookings">
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </div>
      ) : error ? null : bookings.length === 0 ? (
        <SupplierEmptyState
          icon={CalendarDays}
          title={
            inventoryFamily === 'stay'
              ? 'No reservations yet'
              : inventoryFamily === 'rental'
                ? 'No rental bookings yet'
                : 'No bookings yet'
          }
          body={
            inventoryFamily === 'stay'
              ? 'No traveler has reserved a stay night yet. That is normal until a stay is live and someone checks out. When they do, reservations appear here.'
              : inventoryFamily === 'rental'
                ? 'Rental checkout is not open to travelers yet. When certified bookings complete, they will appear here with pickup and return details.'
                : isUnifiedDesk
                  ? 'No traveler has booked your listings yet. When they do, tours, stays, and rentals appear here together.'
                  : 'No traveler has booked your tours yet. That is normal until a listing is live and someone checks out. When they do, bookings appear here.'
          }
          action={
            <div className="flex flex-wrap gap-2">
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
            </div>
          }
        />
      ) : (
      <div className="partner-bookings-workspace">
      <div className="partner-bookings-workspace__toolbar">
        <div className="partner-bookings-workspace__quick">
          <div className="partner-bookings-workspace__quick-group">
            <div className="partner-bookings-workspace__seg" role="group" aria-label="Travel day">
              {(
                [
                  ['yesterday', 'Yesterday'],
                  ['today', 'Today'],
                  ['tomorrow', 'Tomorrow'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={view === value ? 'is-active' : undefined}
                  aria-pressed={view === value}
                  onClick={() =>
                    writeBookingsSearchToUrl({
                      view: view === value ? 'all' : value,
                      from: '',
                      to: '',
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {isUnifiedDesk ? (
            <div className="partner-bookings-workspace__quick-group">
              <div className="partner-bookings-workspace__seg" role="group" aria-label="Category">
                {(
                  [
                    ['', 'All'],
                    ['tour', 'Tours'],
                    ['stay', 'Stays'],
                    ['rental', 'Rentals'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    className={categoryFilter === value ? 'is-active' : undefined}
                    aria-pressed={categoryFilter === value}
                    onClick={() => writeBookingsSearchToUrl({ category: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="partner-bookings-workspace__controls">
          <label className="partner-bookings-workspace__search">
            <span className="sr-only">{isStayDesk ? 'Search reservations' : 'Search bookings'}</span>
            <span className="partner-bookings-workspace__search-icon" aria-hidden>
              <Search strokeWidth={2} />
            </span>
            <input
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search guest, phone, email, listing, option or reference…"
              className="tv-input partner-bookings-workspace__search-input"
              aria-label="Search by guest, phone, email, listing, option or booking reference"
            />
            {searchDraft ? (
              <button
                type="button"
                className="partner-bookings-workspace__search-clear lux-flat"
                aria-label="Clear search"
                onClick={() => {
                  setSearchDraft('');
                  writeBookingsSearchToUrl({ q: '' });
                }}
              >
                <X strokeWidth={2} aria-hidden />
              </button>
            ) : null}
          </label>

          <TraverionDateRangeField
            id="bookings-filter-dates"
            from={view === 'range' ? filterDateFrom : ''}
            to={view === 'range' ? filterDateTo : ''}
            presetLabel={
              view === 'yesterday'
                ? 'Yesterday'
                : view === 'today'
                  ? 'Today'
                  : view === 'tomorrow'
                    ? 'Tomorrow'
                    : null
            }
            placeholder="Travel dates"
            aria-label="Travel date period"
            onChange={({ from, to }) => {
              if (!from && !to) {
                writeBookingsSearchToUrl({ view: 'all', from: '', to: '' });
                return;
              }
              writeBookingsSearchToUrl({ view: 'range', from, to });
            }}
          />

          <PartnerSelect
            id="bookings-filter-listing"
            aria-label={isStayDesk ? 'Property' : 'Listing'}
            searchable
            value={filterListingId}
            onChange={(listingId) => writeBookingsSearchToUrl({ listingId })}
            options={[
              {
                value: '',
                label: isStayDesk ? 'All properties' : 'All listings',
              },
              ...listingOptions.map((option) => ({ value: option.id, label: option.title })),
            ]}
          />

          {filterListingId && optionFilterChoices.length > 0 ? (
            <PartnerSelect
              id="bookings-filter-option"
              aria-label="Option"
              searchable
              value={filterOptionId}
              onChange={(optionId) => writeBookingsSearchToUrl({ optionId })}
              options={[
                { value: '', label: 'All options' },
                ...optionFilterChoices.map((option) => ({ value: option.id, label: option.name })),
              ]}
            />
          ) : null}
        </div>

        {(filterQuery ||
          filterListingId ||
          filterOptionId ||
          filterDateFrom ||
          filterDateTo ||
          opsFilter !== 'all' ||
          categoryFilter ||
          view !== 'all') && (
          <div className="partner-bookings-workspace__meta">
            <button
              type="button"
              onClick={resetBookingFilters}
              className="tv-btn-ghost partner-bookings-workspace__reset"
            >
              Reset filters
            </button>
            <p className="partner-bookings-workspace__count" aria-live="polite">
              <span className="font-semibold tabular-nums text-ink">{filteredBookings.length}</span>
              {filteredBookings.length === 1
                ? isStayDesk
                  ? ' reservation'
                  : ' booking'
                : isStayDesk
                  ? ' reservations'
                  : ' bookings'}
              {selectedIds.size > 0 ? (
                <span className="text-ink-muted"> · {selectedIds.size} selected</span>
              ) : null}
              {activeBookingFilterCount > 0 ? (
                <span className="text-ink-faint"> · {activeBookingFilterCount} filters</span>
              ) : null}
            </p>
          </div>
        )}
      </div>
        <div
          id={PARTNER_BOOKINGS_LIST_ID}
          role="region"
          aria-label={isStayDesk ? 'Reservations' : 'Bookings'}
          className="partner-bookings-workspace__body"
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
                  resetBookingFilters();
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
          {selectedIds.size > 0 ? (
            <div
              className="partner-bookings-workspace__bulk"
              role="status"
            >
              <span>
                {selectedIds.size} selected
              </span>
              <button
                type="button"
                className="tv-btn-ghost h-7 !px-2 text-[12px]"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </button>
              {canExportBookingsCsv ? (
                <button
                  type="button"
                  className="tv-btn-secondary h-7 !px-2.5 text-[12px]"
                  onClick={() => {
                    if (!user?.id) return;
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
                        setError(
                          'Export downloaded, but the audit log failed. Try again or contact support.'
                        );
                      }
                    })();
                  }}
                >
                  Export selected
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="partner-bookings-workspace__list">
            {paginatedBookings.map((booking) => {
              const opsStartHm = booking.start_time ? pgTimeToHm(booking.start_time) ?? null : null;
              const dep = partnerOpsDepartureDisplay(booking.purchase_snapshot, opsStartHm);
              const startHm = dep.displayHm || null;
              const meta = listingMeta[booking.listing_id];
              const rowFamily = inventoryFamily ?? resolveBookingFamily(booking, listingMeta);
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
                rowFamily === 'stay' ? 'Stay' : rowFamily === 'rental' ? 'Rental' : 'Tour'
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
                    : view === 'yesterday'
                      ? addCalendarDaysYmd(experienceToday, -1)
                      : view === 'range' &&
                          filterDateFrom &&
                          (!filterDateTo || filterDateTo === filterDateFrom)
                        ? filterDateFrom
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

              if (rowFamily === 'stay') {
                const stayInTime =
                  displayStayCheckInTimeFromPurchase(booking.purchase_snapshot, meta?.stayCheckInTime) || '';
                const stayOutTime =
                  displayStayCheckOutTimeFromPurchase(booking.purchase_snapshot, meta?.stayCheckOutTime) || '';
                const stayRange = stayRangeFromBooking(booking);
                const checkInLabel = stayRange
                  ? `${formatStayNightHuman(stayRange.checkIn)}${stayInTime ? ` · ${stayInTime}` : ''}`
                  : stayInTime || '—';
                const checkOutLabel = stayRange
                  ? `${formatStayNightHuman(stayRange.checkOut)}${stayOutTime ? ` · ${stayOutTime}` : ''}`
                  : stayOutTime || '—';
                const accessRaw =
                  resolvePartnerPickupCopy({
                    purchaseSnapshot: booking.purchase_snapshot,
                    bookingOptionId: booking.booking_option_id,
                    specialRequests: booking.special_requests,
                    listingMeetingPoint: meta?.meetingPoint,
                    listingPickupInstructions: meta?.pickupInstructions,
                    bookingOptions: isPurchaseSnapshot(booking.purchase_snapshot)
                      ? null
                      : meta?.bookingOptions,
                  }).pickupInstructions ||
                  displayCheckInAddressFromPurchase(booking.purchase_snapshot, booking.payment_status) ||
                  '';
                const accessSummary =
                  accessRaw.length > 140 ? `${accessRaw.slice(0, 140).trimEnd()}…` : accessRaw || null;
                const guestNotes = customerRequestNotes(booking.special_requests) || null;
                const stayExpanded = expandedStayId === booking.id;
                const financeReady = stayExpanded && expandedEarningsState === 'ready';
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
                      statusLabel: listStatusBadge(booking.status, booking.payment_status).label,
                      statusClass: listStatusBadge(booking.status, booking.payment_status).className,
                      referenceLabel,
                      purchaseDateLabel,
                      guestEmail: booking.guest_email?.trim() || null,
                      guestPhone: guestPhoneFromNotes(booking.special_requests),
                      guestNotes,
                      warning: cardWarning,
                      checkInLabel,
                      checkOutLabel,
                      accessSummary,
                      guestPaidLabel: financeReady
                        ? expandedGuestPaidLabel
                        : stayExpanded
                          ? null
                          : customerBookingTotal(booking),
                      commissionLabel: financeReady ? expandedCommissionLabel : null,
                      commissionRateLabel: financeReady ? expandedCommissionRateLabel : null,
                      earningsLabel: financeReady ? expandedEarningsLabel : null,
                      financeLoading: stayExpanded && expandedEarningsState === 'loading',
                      paymentLabel: partnerPaymentLabel(booking),
                    }}
                    expanded={stayExpanded}
                    selected={highlightBookingId === booking.id}
                    busy={updatingId === booking.id}
                    checkbox={checkbox}
                    copied={copiedBookingId === booking.id}
                    onToggleExpand={() => {
                      setExpandedTourId(null);
                      setExpandedRentalId(null);
                      setExpandedStayId((cur) => (cur === booking.id ? null : booking.id));
                    }}
                    onOpenDetails={() => {
                      setExpandedStayId(null);
                      setSelectedBookingId(booking.id);
                    }}
                    onMessageGuest={() => openBookingInbox(booking.id)}
                    onCopyReference={copyReference}
                  />
                );
              }

              if (rowFamily === 'rental') {
                const rentalSnap = parseRentalPurchaseSnapshot(booking.purchase_snapshot);
                const rentalReturn = rentalSnap ? rentalReturnPoint(rentalSnap) : null;
                const collectionLabel = formatRentalOpsInstant(rentalSnap?.pickupAt) || dateLine;
                const returnLabel = formatRentalOpsInstant(rentalSnap?.returnAt) || '—';
                const periodLine =
                  collectionLabel && returnLabel !== '—'
                    ? `${collectionLabel} → ${returnLabel}`
                    : collectionLabel;
                const quantityLabel = formatRentalQuantityLabel(
                  rentalSnap?.quantity ?? booking.guests ?? 1,
                  meta?.rentalCategory
                );
                const rentalExpanded = expandedRentalId === booking.id;
                const financeReady = rentalExpanded && expandedEarningsState === 'ready';
                const customerNotes = customerRequestNotes(booking.special_requests) || null;
                const termsSummary =
                  [rentalSnap?.cancellationLabel?.trim(), rentalSnap?.depositDisclosure?.trim()]
                    .filter(Boolean)
                    .join(' · ') || null;
                return (
                  <RentalOpsBookingCard
                    key={booking.id}
                    model={{
                      id: booking.id,
                      listingTitle: displayListingTitleFromPurchase(
                        booking.purchase_snapshot,
                        meta?.title,
                        'Rental'
                      ),
                      variantLabel: rentalSnap?.variantName?.trim() || optionLabel || null,
                      imageUrl: meta?.imageUrl ?? null,
                      customerName: booking.guest_name?.trim() || 'Customer',
                      customerEmail: booking.guest_email?.trim() || null,
                      customerPhone: guestPhoneFromNotes(booking.special_requests),
                      customerNotes,
                      periodLine,
                      collectionLabel,
                      returnLabel,
                      quantityLabel,
                      statusLabel: rentalListStatusBadge(booking).label,
                      statusClass: rentalListStatusBadge(booking).className,
                      referenceLabel,
                      purchaseDateLabel,
                      collectionPlace: rentalSnap?.pickupAddress?.trim() || null,
                      returnPlace: rentalReturn?.address?.trim() || null,
                      warning: cardWarning,
                      guestPaidLabel: financeReady
                        ? expandedGuestPaidLabel
                        : rentalExpanded
                          ? null
                          : customerBookingTotal(booking),
                      commissionLabel: financeReady ? expandedCommissionLabel : null,
                      commissionRateLabel: financeReady ? expandedCommissionRateLabel : null,
                      earningsLabel: financeReady ? expandedEarningsLabel : null,
                      financeLoading: rentalExpanded && expandedEarningsState === 'loading',
                      paymentLabel: partnerPaymentLabel(booking),
                      termsSummary,
                    }}
                    expanded={rentalExpanded}
                    selected={highlightBookingId === booking.id}
                    busy={updatingId === booking.id}
                    checkbox={checkbox}
                    copied={copiedBookingId === booking.id}
                    onToggleExpand={() => {
                      setExpandedStayId(null);
                      setExpandedTourId(null);
                      setExpandedRentalId((cur) => (cur === booking.id ? null : booking.id));
                    }}
                    onOpenDetails={() => {
                      setExpandedRentalId(null);
                      setSelectedBookingId(booking.id);
                    }}
                    onMessageCustomer={() => openBookingInbox(booking.id)}
                    onCopyReference={copyReference}
                  />
                );
              }

              const durationLabel =
                displayDurationFromPurchase(booking.purchase_snapshot, meta?.duration ?? null) || null;
              const arrival = resolvePartnerArrivalDisplay({
                purchaseSnapshot: booking.purchase_snapshot,
                bookingOptionId: booking.booking_option_id,
                specialRequests: booking.special_requests,
                listingMeetingPoint: meta?.meetingPoint,
                listingPickupInstructions: meta?.pickupInstructions,
                bookingOptions: meta?.bookingOptions,
              });
              const pickupSummary =
                [arrival.place, arrival.instructions].filter(Boolean).join(' · ') || null;
              const guestNotes = customerRequestNotes(booking.special_requests) || null;
              const tourExpanded = expandedTourId === booking.id;
              const financeReady = tourExpanded && expandedEarningsState === 'ready';

              return (
                <TourOpsBookingCard
                  key={booking.id}
                  model={{
                    id: booking.id,
                    listingTitle,
                    optionLabel,
                    imageUrl: meta?.imageUrl ?? null,
                    guestName: booking.guest_name?.trim() || 'Guest',
                    guestEmail: booking.guest_email?.trim() || null,
                    guestPhone: guestPhoneFromNotes(booking.special_requests),
                    dateLine,
                    departureNote: dep.purchasedNote || null,
                    participantLabel,
                    statusLabel: listStatusBadge(booking.status, booking.payment_status).label,
                    statusClass: listStatusBadge(booking.status, booking.payment_status).className,
                    referenceLabel,
                    purchaseDateLabel,
                    arrivalRailLabel: arrival.railLabel,
                    arrivalRailWarn: arrival.needsLocation || arrival.rail === 'location_needed',
                    pickupSummary,
                    arrivalPlace: arrival.place,
                    arrivalInstructions: arrival.instructions,
                    arrivalSectionLabel: arrival.sectionLabel,
                    durationLabel: durationLabel && durationLabel !== '—' ? durationLabel : null,
                    guestNotes,
                    warning: cardWarning,
                    guestPaidLabel: financeReady
                      ? expandedGuestPaidLabel
                      : tourExpanded
                        ? null
                        : customerBookingTotal(booking),
                    commissionLabel: financeReady ? expandedCommissionLabel : null,
                    commissionRateLabel: financeReady ? expandedCommissionRateLabel : null,
                    earningsLabel: financeReady ? expandedEarningsLabel : null,
                    financeLoading: tourExpanded && expandedEarningsState === 'loading',
                    paymentLabel: partnerPaymentLabel(booking),
                  }}
                  expanded={tourExpanded}
                  selected={highlightBookingId === booking.id}
                  busy={updatingId === booking.id}
                  checkbox={checkbox}
                  copied={copiedBookingId === booking.id}
                  onToggleExpand={() => {
                    setExpandedStayId(null);
                    setExpandedRentalId(null);
                    setExpandedTourId((cur) => (cur === booking.id ? null : booking.id));
                  }}
                  onOpenDetails={() => {
                    setExpandedTourId(null);
                    setSelectedBookingId(booking.id);
                  }}
                  onMessageGuest={() => openBookingInbox(booking.id)}
                  onCopyReference={copyReference}
                />
              );
            })}

          </div>

          <nav
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            aria-label="Bookings pages"
          >
            <p className="text-[13px] text-ink-muted">
              {deskTotal === 0 ? (
                '0 bookings'
              ) : (
                <>
                  <span className="font-medium tabular-nums text-ink">
                    {(safePage - 1) * BOOKINGS_PAGE_SIZE + 1}–{(safePage - 1) * BOOKINGS_PAGE_SIZE + paginatedBookings.length}
                  </span>{' '}
                  of {deskTotal}
                </>
              )}
            </p>
            {safePage < totalPages ? (
              <button
                type="button"
                className="tv-btn-ghost min-h-[40px]"
                onClick={() => setBookingsListPage((p) => p + 1)}
              >
                Load more
              </button>
            ) : null}
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
      </div>
      )}

      {tourDetailMode && loading && !selectedBooking ? (
        <div className="tour-ops-detail tour-ops-detail--skeleton" aria-busy="true" aria-label="Loading booking">
          <div className="h-4 w-36 rounded bg-black/[0.06] animate-pulse" />
          <div className="mt-5 h-7 w-48 rounded bg-black/[0.07] animate-pulse" />
          <div className="mt-3 h-4 w-24 rounded bg-black/[0.05] animate-pulse" />
          <div className="tour-ops-detail__grid mt-8">
            <div className="space-y-3">
              <div className="h-28 rounded-xl bg-black/[0.04] animate-pulse" />
              <div className="h-40 rounded-xl bg-black/[0.04] animate-pulse" />
            </div>
            <div className="space-y-3">
              <div className="h-36 rounded-xl bg-black/[0.04] animate-pulse" />
              <div className="h-24 rounded-xl bg-black/[0.04] animate-pulse" />
            </div>
          </div>
        </div>
      ) : null}

      {tourDetailMode && !selectedBooking && !loading ? (
        <div className="tour-ops-detail">
          <button
            type="button"
            className="tour-ops-detail__back lux-flat"
            onClick={() => leaveBookingDetail(highlightBookingId)}
          >
            ← {partnerInboxReturnMatches(highlightBookingId) ? 'Back to Inbox' : 'Back to bookings'}
          </button>
          <h1 className="tour-ops-detail__ref">Booking unavailable</h1>
          <p className="tour-ops-detail__muted mt-2">
            This booking was not found, or you do not have access to it.
          </p>
        </div>
      ) : null}

      {tourDetailMode && selectedBooking
        ? (() => {
            const booking = selectedBooking;
            const opsStartHm = booking.start_time ? pgTimeToHm(booking.start_time) ?? null : null;
            const dep = partnerOpsDepartureDisplay(booking.purchase_snapshot, opsStartHm);
            const startHm = dep.displayHm || null;
            const pickupHm = booking.pickup_time ? pgTimeToHm(booking.pickup_time) ?? null : null;
            const meta = listingMeta[booking.listing_id];
            const liveOptionLabel =
              booking.booking_option_id && meta?.bookingOptions?.length
                ? meta.bookingOptions.find((o) => o.id === booking.booking_option_id)?.name?.trim() || ''
                : '';
            const listingTitle = displayListingTitleFromPurchase(
              booking.purchase_snapshot,
              meta?.title,
              'Tour'
            );
            const optionLabel = displayOptionLabelFromPurchase(
              booking.purchase_snapshot,
              liveOptionLabel
            );
            const arrival = resolvePartnerArrivalDisplay({
              purchaseSnapshot: booking.purchase_snapshot,
              bookingOptionId: booking.booking_option_id,
              specialRequests: booking.special_requests,
              listingMeetingPoint: meta?.meetingPoint,
              listingPickupInstructions: meta?.pickupInstructions,
              bookingOptions: meta?.bookingOptions,
              pickupTimeHm: pickupHm,
            });
            const purchasedDuration = displayDurationFromPurchase(
              booking.purchase_snapshot,
              meta?.duration ?? null
            );
            const whenLabel = formatActivityDateLong(booking.booking_date, startHm);
            const referenceLabel = bookingReferenceLabel(booking);
            const guestPhone = guestPhoneFromNotes(booking.special_requests);
            const requestNotes = customerRequestNotes(booking.special_requests);
            const busy = updatingId === booking.id;
            const fulfillment = arrival.fulfillment;
            const openCancelRaw = openCancels[booking.id];
            const openCancel =
              openCancelRaw &&
              openHostCancelRequestVisible({
                bookingStatus: booking.status,
                requestStatus: openCancelRaw.status,
              })
                ? openCancelRaw
                : undefined;
            // Transport line only for pickup bookings — meeting-point options must not show transfer marketing.
            const bookingLogistics =
              fulfillment === 'pickup'
                ? optionLogisticsLines({
                    ...readOptionLogistics(booking.purchase_snapshot),
                    fulfillment,
                  }).join(' ')
                : '';
            const commissionAdjusted =
              commercialSnapshot != null &&
              Number(commercialSnapshot.remaining_gross_minor) !== Number(commercialSnapshot.gross_minor);
            const financeReady = commercialSnapshot && commercialState === 'ready';

            return (
              <TourOpsBookingDetail
                model={{
                  referenceLabel,
                  statusLabel: partnerBookingLifecycleLabel(booking.status),
                  statusClass: bookingStatusClass(booking.status, booking.payment_status),
                  listingTitle,
                  optionLabel,
                  imageUrl: meta?.imageUrl ?? null,
                  whenLabel,
                  durationLabel: purchasedDuration && purchasedDuration !== '—' ? purchasedDuration : null,
                  participantLabel: formatBookingParticipantsLabel(booking),
                  departureNote: dep.purchasedNote || null,
                  guestName: booking.guest_name?.trim() || 'Guest',
                  guestEmail: booking.guest_email?.trim() || null,
                  guestPhone,
                  requestNotes: requestNotes || null,
                  arrivalSectionLabel: arrival.sectionLabel,
                  arrivalPlace: arrival.place,
                  arrivalInstructions: arrival.instructions,
                  pickupTimeHm: fulfillment === 'pickup' ? pickupHm : null,
                  transferLine: bookingLogistics || null,
                  unpaidHoldMessage: partnerBookingIsUnpaidCheckout(booking)
                    ? partnerUnpaidCheckoutHoldsInventory(booking)
                      ? `${formatPartnerCheckoutHoldLabel(booking)}. The traveler may still complete payment.`
                      : 'Hold expired. Inventory is already released.'
                    : null,
                  cancelWaitingMessage: openCancel
                    ? `Cancellation requested ${new Date(openCancel.created_at).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}. Waiting for the traveler.`
                    : null,
                  finance: {
                    state: commercialState,
                    customerPaid: financeReady
                      ? formatSnapshotMinor(
                          commercialSnapshot.remaining_gross_minor,
                          commercialSnapshot.currency
                        )
                      : customerBookingTotal(booking),
                    commission: financeReady
                      ? formatSnapshotMinor(
                          commercialSnapshot.remaining_commission_minor,
                          commercialSnapshot.currency
                        )
                      : null,
                    commissionRate: financeReady
                      ? formatCommissionPercentLabel(commercialSnapshot.commission_bps) || null
                      : null,
                    supplierEarnings: financeReady
                      ? formatSnapshotMinor(
                          commercialSnapshot.remaining_supplier_minor,
                          commercialSnapshot.currency
                        )
                      : null,
                    paymentStatus: partnerPaymentLabel(booking),
                    commissionAdjusted,
                  },
                  fulfillmentStatus: booking.service_fulfillment_status ?? 'scheduled',
                  fulfillmentHint:
                    String(booking.service_fulfillment_status ?? '').toLowerCase() === 'completed'
                      ? 'Service attested. Earnings still require reconcile + clearance hold before payout prep.'
                      : 'Payouts stay held until you mark this tour completed (and ledger reconcile is ok).',
                }}
                busy={busy}
                canEdit={canEditBookings}
                copied={copiedBookingId === booking.id}
                showConfirm={
                  partnerBookingIsOperatingTrip(booking) &&
                  booking.status === 'pending' &&
                  String(booking.payment_status ?? '').toLowerCase() !== 'authorized'
                }
                showCancelRequest={
                  partnerBookingIsOperatingTrip(booking) || partnerBookingIsUnpaidCheckout(booking)
                }
                cancelBlocked={Boolean(openCancel)}
                backLabel={
                  partnerInboxReturnMatches(booking.id) ? 'Back to Inbox' : 'Back to bookings'
                }
                onBack={() => leaveBookingDetail(booking.id)}
                onCopyReference={() => {
                  void navigator.clipboard.writeText(referenceLabel).then(() => {
                    setCopiedBookingId(booking.id);
                    window.setTimeout(() => {
                      setCopiedBookingId((current) => (current === booking.id ? null : current));
                    }, 1500);
                  });
                }}
                onMessageGuest={() => openBookingInbox(booking.id)}
                onConfirm={() => void handleStatusChange(booking, 'confirmed')}
                onRequestCancel={() => openCancellationWorkflow([booking], [booking.id])}
                onOpenFinancialStatement={() =>
                  navigateSupplierUrl(`${PARTNER_APP_BASE}/money?tab=documents`)
                }
                onOpenPickupPlanner={() => openSupplierPickup(booking.id)}
                onFulfillmentChange={
                  isPaidPaymentStatus(booking.payment_status) &&
                  booking.status !== 'cancelled' &&
                  canEditBookings
                    ? (status) => {
                        void (async () => {
                          setUpdatingId(booking.id);
                          try {
                            const res = await attestTourServiceFulfillment({
                              bookingId: booking.id,
                              status,
                            });
                            if (!res.ok) {
                              setError(res.error ?? 'Could not update fulfillment');
                              return;
                            }
                            setBookings((prev) =>
                              prev.map((b) =>
                                b.id === booking.id
                                  ? {
                                      ...b,
                                      service_fulfillment_status: res.service_fulfillment_status ?? status,
                                    }
                                  : b
                              )
                            );
                          } finally {
                            setUpdatingId(null);
                          }
                        })();
                      }
                    : undefined
                }
                extraNotices={
                  ['Refund due', 'Refund processing', 'Refund delayed'].includes(
                    partnerPaymentLabel(booking)
                  ) ? (
                    <div className="mt-2 rounded-md border border-black/[0.06] border-l-[3px] border-l-amber-500 bg-paper px-3 py-2">
                      <p className="text-[13px] font-semibold text-ink">{partnerPaymentLabel(booking)}</p>
                      <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">
                        {refundDueManualCopy(inventoryFamily)}
                      </p>
                    </div>
                  ) : null
                }
                privateNotesSlot={
                  user?.id ? (
                    <BookingOpsNotesEditor
                      supplierId={user.id}
                      bookingId={booking.id}
                      canEdit={canEditBookings}
                    />
                  ) : null
                }
              />
            );
          })()
        : null}

      {rentalDetailMode && loading && !selectedBooking ? (
        <div className="tour-ops-detail tour-ops-detail--skeleton" aria-busy="true" aria-label="Loading rental booking">
          <div className="h-4 w-36 rounded bg-black/[0.06] animate-pulse" />
          <div className="mt-5 h-7 w-48 rounded bg-black/[0.07] animate-pulse" />
          <div className="mt-3 h-4 w-24 rounded bg-black/[0.05] animate-pulse" />
          <div className="tour-ops-detail__grid mt-8">
            <div className="space-y-3">
              <div className="h-28 rounded-xl bg-black/[0.04] animate-pulse" />
              <div className="h-40 rounded-xl bg-black/[0.04] animate-pulse" />
            </div>
            <div className="space-y-3">
              <div className="h-36 rounded-xl bg-black/[0.04] animate-pulse" />
              <div className="h-24 rounded-xl bg-black/[0.04] animate-pulse" />
            </div>
          </div>
        </div>
      ) : null}

      {rentalDetailMode && !selectedBooking && !loading ? (
        <div className="tour-ops-detail">
          <button
            type="button"
            className="tour-ops-detail__back lux-flat"
            onClick={() => leaveBookingDetail(highlightBookingId)}
          >
            ←{' '}
            {partnerInboxReturnMatches(highlightBookingId)
              ? 'Back to Inbox'
              : 'Back to rental bookings'}
          </button>
          <h1 className="tour-ops-detail__ref">Rental booking unavailable</h1>
          <p className="tour-ops-detail__muted mt-2">
            This rental booking was not found, or you do not have access to it.
          </p>
        </div>
      ) : null}

      {rentalDetailMode && selectedBooking
        ? (() => {
            const booking = selectedBooking;
            const meta = listingMeta[booking.listing_id];
            const rentalSnap = parseRentalPurchaseSnapshot(booking.purchase_snapshot);
            const rentalReturn = rentalSnap ? rentalReturnPoint(rentalSnap) : null;
            const listingTitle = displayListingTitleFromPurchase(
              booking.purchase_snapshot,
              meta?.title,
              'Rental'
            );
            const collectionLabel = formatRentalOpsInstant(rentalSnap?.pickupAt) || '—';
            const returnLabel = formatRentalOpsInstant(rentalSnap?.returnAt) || '—';
            const periodLine =
              collectionLabel !== '—' && returnLabel !== '—'
                ? `${collectionLabel} → ${returnLabel}`
                : collectionLabel;
            const quantityLabel = formatRentalQuantityLabel(
              rentalSnap?.quantity ?? booking.guests ?? 1,
              meta?.rentalCategory
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
            const busy = updatingId === booking.id;
            const referenceLabel = bookingReferenceLabel(booking);
            const customerPhone = guestPhoneFromNotes(booking.special_requests);
            const requestNotes = customerRequestNotes(booking.special_requests);
            const financeReady = commercialState === 'ready' && commercialSnapshot != null;
            const commissionAdjusted =
              commercialSnapshot != null &&
              Number(commercialSnapshot.remaining_gross_minor) !== Number(commercialSnapshot.gross_minor);
            return (
              <RentalOpsBookingDetail
                model={{
                  referenceLabel,
                  statusLabel: rentalBookingSimpleStatusLabel(booking),
                  statusClass: bookingStatusClass(booking.status, booking.payment_status),
                  listingTitle,
                  variantLabel: rentalSnap?.variantName?.trim() || null,
                  imageUrl: meta?.imageUrl ?? null,
                  periodLine,
                  quantityLabel,
                  customerName: booking.guest_name?.trim() || 'Customer',
                  customerEmail: booking.guest_email?.trim() || null,
                  customerPhone,
                  requestNotes: requestNotes || null,
                  collectionLabel,
                  returnLabel,
                  collectionPlace: rentalSnap?.pickupAddress?.trim() || null,
                  returnPlace: rentalReturn?.address?.trim() || null,
                  returnSameAsCollection: rentalReturn?.sameAsPickup !== false,
                  collectionInstructions: rentalSnap?.pickupInstructions?.trim() || null,
                  returnInstructions: rentalSnap?.returnInstructions?.trim() || null,
                  collectionLat: rentalSnap?.pickupLat ?? null,
                  collectionLng: rentalSnap?.pickupLng ?? null,
                  returnLat: rentalReturn?.lat ?? null,
                  returnLng: rentalReturn?.lng ?? null,
                  cancellationLabel: rentalSnap?.cancellationLabel?.trim() || null,
                  depositDisclosure: rentalSnap?.depositDisclosure?.trim() || null,
                  unpaidHoldMessage: partnerBookingIsUnpaidCheckout(booking)
                    ? partnerUnpaidCheckoutHoldsInventory(booking)
                      ? `${formatPartnerCheckoutHoldLabel(booking)}. The traveler may still complete payment.`
                      : 'Hold expired. Inventory is already released.'
                    : null,
                  cancelWaitingMessage: openCancel
                    ? `Cancellation requested ${new Date(openCancel.created_at).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}. Waiting for the traveler.`
                    : null,
                  finance: {
                    state: commercialState,
                    customerPaid: financeReady
                      ? formatSnapshotMinor(
                          commercialSnapshot.remaining_gross_minor,
                          commercialSnapshot.currency
                        )
                      : customerBookingTotal(booking),
                    commission: financeReady
                      ? formatSnapshotMinor(
                          commercialSnapshot.remaining_commission_minor,
                          commercialSnapshot.currency
                        )
                      : null,
                    commissionRate: financeReady
                      ? formatCommissionPercentLabel(commercialSnapshot.commission_bps) || null
                      : null,
                    supplierEarnings: financeReady
                      ? formatSnapshotMinor(
                          commercialSnapshot.remaining_supplier_minor,
                          commercialSnapshot.currency
                        )
                      : null,
                    paymentStatus: partnerPaymentLabel(booking),
                    commissionAdjusted,
                  },
                }}
                activity={(() => {
                  const items: Array<{
                    id: string;
                    label: string;
                    detail?: string | null;
                    at: string | null;
                  }> = [];
                  if (booking.created_at) {
                    items.push({ id: 'booked', label: 'Booked', at: booking.created_at });
                  }
                  if (bookingPaymentWasCollected(booking.payment_status)) {
                    items.push({
                      id: 'paid',
                      label: partnerCollectedAmountCaption(booking),
                      at: null,
                    });
                  }
                  if (openCancel) {
                    items.push({
                      id: `cancel-${openCancel.id}`,
                      label: 'Cancellation requested',
                      at: openCancel.created_at,
                    });
                  }
                  for (const event of activityEvents) {
                    items.push({
                      id: event.id,
                      label: event.event_type.replace(/_/g, ' '),
                      detail: event.details,
                      at: event.created_at,
                    });
                  }
                  return items;
                })()}
                busy={busy}
                canEdit={canEditBookings}
                copied={copiedBookingId === booking.id}
                showConfirm={
                  partnerBookingIsOperatingTrip(booking) &&
                  booking.status === 'pending' &&
                  String(booking.payment_status ?? '').toLowerCase() !== 'authorized'
                }
                showCancelRequest={
                  partnerBookingIsOperatingTrip(booking) || partnerBookingIsUnpaidCheckout(booking)
                }
                cancelBlocked={Boolean(openCancel)}
                backLabel={
                  partnerInboxReturnMatches(booking.id)
                    ? 'Back to Inbox'
                    : 'Back to rental bookings'
                }
                onBack={() => leaveBookingDetail(booking.id)}
                onCopyReference={() => {
                  void navigator.clipboard.writeText(referenceLabel).then(() => {
                    setCopiedBookingId(booking.id);
                    window.setTimeout(() => {
                      setCopiedBookingId((current) => (current === booking.id ? null : current));
                    }, 1500);
                  });
                }}
                onMessageCustomer={() => openBookingInbox(booking.id)}
                onConfirm={() => void handleStatusChange(booking, 'confirmed')}
                onRequestCancel={() => openCancellationWorkflow([booking], [booking.id])}
                onOpenFinancialStatement={() =>
                  navigateSupplierUrl(`${PARTNER_APP_BASE}/money?tab=documents`)
                }
                privateNotesSlot={
                  user?.id ? (
                    <BookingOpsNotesEditor
                      supplierId={user.id}
                      bookingId={booking.id}
                      canEdit={canEditBookings}
                    />
                  ) : null
                }
              />
            );
          })()
        : null}

      {stayDetailMode && loading && !selectedBooking ? (
        <div className="tour-ops-detail tour-ops-detail--skeleton" aria-busy="true" aria-label="Loading reservation">
          <div className="h-4 w-36 rounded bg-black/[0.06] animate-pulse" />
          <div className="mt-5 h-7 w-48 rounded bg-black/[0.07] animate-pulse" />
          <div className="mt-3 h-4 w-24 rounded bg-black/[0.05] animate-pulse" />
          <div className="tour-ops-detail__grid mt-8">
            <div className="space-y-3">
              <div className="h-28 rounded-xl bg-black/[0.04] animate-pulse" />
              <div className="h-40 rounded-xl bg-black/[0.04] animate-pulse" />
            </div>
            <div className="space-y-3">
              <div className="h-36 rounded-xl bg-black/[0.04] animate-pulse" />
              <div className="h-24 rounded-xl bg-black/[0.04] animate-pulse" />
            </div>
          </div>
        </div>
      ) : null}

      {stayDetailMode && !selectedBooking && !loading ? (
        <div className="tour-ops-detail">
          <button
            type="button"
            className="tour-ops-detail__back lux-flat"
            onClick={() => leaveBookingDetail(highlightBookingId)}
          >
            ← {partnerInboxReturnMatches(highlightBookingId) ? 'Back to Inbox' : 'Back to reservations'}
          </button>
          <h1 className="tour-ops-detail__ref">Reservation unavailable</h1>
          <p className="tour-ops-detail__muted mt-2">
            This reservation was not found, or you do not have access to it.
          </p>
        </div>
      ) : null}

      {stayDetailMode && selectedBooking
        ? (() => {
            const booking = selectedBooking;
            const meta = listingMeta[booking.listing_id];
            const listingTitle = displayListingTitleFromPurchase(
              booking.purchase_snapshot,
              meta?.title,
              'Stay'
            );
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
            const stayRange = stayRangeFromBooking(booking);
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
            const nightLabel =
              stayNightCount > 0 ? `${stayNightCount} night${stayNightCount === 1 ? '' : 's'}` : null;
            const whenLabel = stayRange
              ? `${formatStayNightHuman(stayRange.checkIn)} → ${formatStayNightHuman(stayRange.checkOut)}`
              : formatActivityDateLong(booking.booking_date, null);
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
            const checkInAddress =
              displayCheckInAddressFromPurchase(booking.purchase_snapshot, booking.payment_status) || '';
            const houseRules = displayStayHouseRulesFromPurchase(booking.purchase_snapshot) || '';
            const stayInTime =
              displayStayCheckInTimeFromPurchase(booking.purchase_snapshot, meta?.stayCheckInTime) || '';
            const stayOutTime =
              displayStayCheckOutTimeFromPurchase(booking.purchase_snapshot, meta?.stayCheckOutTime) || '';
            const commissionAdjusted =
              commercialSnapshot != null &&
              Number(commercialSnapshot.remaining_gross_minor) !== Number(commercialSnapshot.gross_minor);
            const financeReady = commercialSnapshot && commercialState === 'ready';
            const activity = (() => {
              const items: Array<{ id: string; label: string; detail?: string | null; at: string | null }> = [];
              if (booking.created_at) {
                items.push({ id: 'booked', label: 'Booked', at: booking.created_at });
              }
              if (bookingPaymentWasCollected(booking.payment_status)) {
                items.push({
                  id: 'paid',
                  label: partnerCollectedAmountCaption(booking),
                  at: null,
                });
              }
              if (openCancel) {
                items.push({
                  id: `cancel-${openCancel.id}`,
                  label: 'Cancellation requested',
                  at: openCancel.created_at,
                });
              }
              if (booking.status === 'cancelled') {
                items.push({
                  id: 'cancelled',
                  label: 'Cancelled',
                  at: null,
                });
              }
              for (const event of activityEvents) {
                items.push({
                  id: event.id,
                  label: event.event_type.replace(/_/g, ' '),
                  detail: event.details,
                  at: event.created_at,
                });
              }
              return items.sort((a, b) => {
                const ta = a.at ? new Date(a.at).getTime() : 0;
                const tb = b.at ? new Date(b.at).getTime() : 0;
                return ta - tb;
              });
            })();

            return (
              <StayOpsBookingDetail
                model={{
                  referenceLabel,
                  statusLabel: partnerBookingLifecycleLabel(booking.status),
                  statusClass: bookingStatusClass(booking.status, booking.payment_status),
                  listingTitle,
                  imageUrl: meta?.imageUrl ?? null,
                  whenLabel,
                  nightLabel,
                  participantLabel: formatBookingParticipantsLabel(booking),
                  guestName: booking.guest_name?.trim() || 'Guest',
                  guestEmail: booking.guest_email?.trim() || null,
                  guestPhone,
                  requestNotes: requestNotes || null,
                  checkInDateLabel: stayRange
                    ? formatStayNightHuman(stayRange.checkIn)
                    : formatBookingDateDisplay(booking.booking_date ?? '') || '—',
                  checkInTimeLabel: stayInTime || null,
                  checkOutDateLabel: stayRange
                    ? formatStayNightHuman(stayRange.checkOut)
                    : '—',
                  checkOutTimeLabel: stayOutTime || null,
                  propertyAddress: checkInAddress || null,
                  accessInstructions: partnerPickup.pickupInstructions || null,
                  houseRules: houseRules || null,
                  unpaidHoldMessage: partnerBookingIsUnpaidCheckout(booking)
                    ? partnerUnpaidCheckoutHoldsInventory(booking)
                      ? `${formatPartnerCheckoutHoldLabel(booking)}. The traveler may still complete payment.`
                      : 'Hold expired. Inventory is already released.'
                    : null,
                  cancelWaitingMessage: openCancel
                    ? `Cancellation requested ${new Date(openCancel.created_at).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}. Waiting for the traveler.`
                    : null,
                  finance: {
                    state: commercialState,
                    customerPaid: financeReady
                      ? formatSnapshotMinor(
                          commercialSnapshot.remaining_gross_minor,
                          commercialSnapshot.currency
                        )
                      : customerBookingTotal(booking),
                    commission: financeReady
                      ? formatSnapshotMinor(
                          commercialSnapshot.remaining_commission_minor,
                          commercialSnapshot.currency
                        )
                      : null,
                    commissionRate: financeReady
                      ? formatCommissionPercentLabel(commercialSnapshot.commission_bps) || null
                      : null,
                    supplierEarnings: financeReady
                      ? formatSnapshotMinor(
                          commercialSnapshot.remaining_supplier_minor,
                          commercialSnapshot.currency
                        )
                      : null,
                    paymentStatus: partnerPaymentLabel(booking),
                    commissionAdjusted,
                  },
                }}
                activity={activity}
                busy={busy}
                canEdit={canEditBookings}
                copied={copiedBookingId === booking.id}
                showConfirm={
                  partnerBookingIsOperatingTrip(booking) &&
                  booking.status === 'pending' &&
                  String(booking.payment_status ?? '').toLowerCase() !== 'authorized' &&
                  !isStayRequestAwaitingHost(booking)
                }
                showCancelRequest={
                  partnerBookingIsOperatingTrip(booking) || partnerBookingIsUnpaidCheckout(booking)
                }
                cancelBlocked={Boolean(openCancel)}
                showRequestActions={isStayRequestAwaitingHost(booking)}
                requestActionsSlot={
                  isStayRequestAwaitingHost(booking) ? (
                    <StayRequestActions
                      role="supplier"
                      booking={{
                        ...booking,
                        listingTitle,
                      }}
                      onDone={() => void load()}
                    />
                  ) : null
                }
                backLabel={
                  partnerInboxReturnMatches(booking.id) ? 'Back to Inbox' : 'Back to reservations'
                }
                onBack={() => leaveBookingDetail(booking.id)}
                onCopyReference={() => {
                  void navigator.clipboard.writeText(referenceLabel).then(() => {
                    setCopiedBookingId(booking.id);
                    window.setTimeout(() => {
                      setCopiedBookingId((current) => (current === booking.id ? null : current));
                    }, 1500);
                  });
                }}
                onMessageGuest={() => openBookingInbox(booking.id)}
                onConfirm={() => void handleStatusChange(booking, 'confirmed')}
                onRequestCancel={() => openCancellationWorkflow([booking], [booking.id])}
                onOpenFinancialStatement={() =>
                  navigateSupplierUrl(`${PARTNER_APP_BASE}/money?tab=documents`)
                }
                onOpenStayCalendar={() =>
                  navigateSupplierUrl(
                    `${PARTNER_APP_BASE}/stay-calendar?listing=${encodeURIComponent(booking.listing_id)}`
                  )
                }
                extraNotices={
                  ['Refund due', 'Refund processing', 'Refund delayed'].includes(partnerPaymentLabel(booking)) ? (
                    <div className="mt-2 rounded-md border border-black/[0.06] border-l-[3px] border-l-amber-500 bg-paper px-3 py-2">
                      <p className="text-[13px] font-semibold text-ink">{partnerPaymentLabel(booking)}</p>
                      <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">
                        {refundDueManualCopy(inventoryFamily)}
                      </p>
                    </div>
                  ) : null
                }
                privateNotesSlot={
                  user?.id ? (
                    <BookingOpsNotesEditor
                      supplierId={user.id}
                      bookingId={booking.id}
                      canEdit={canEditBookings}
                    />
                  ) : null
                }
              />
            );
          })()
        : null}

      {cancelFlow ? (
        <SupplierCancellationWorkflow
          pool={cancelFlow.pool}
          initialSelectedIds={cancelFlow.initialIds}
          canSubmit={canEditBookings}
          onClose={() => {
            setCancelFlow(null);
            void load();
          }}
          onConfirmPaid={confirmPaidCancellation}
          onReleaseUnpaid={releaseUnpaidCancellation}
        />
      ) : null}

    </div>
  );
}
