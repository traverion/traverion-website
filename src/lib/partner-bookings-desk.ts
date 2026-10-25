import { addCalendarDaysYmd } from './booking-lifecycle-calendar';
import { isRefundDueBooking, isPaidPaymentStatus } from './payment-states';
import { partnerBookingNumberMatchesFilterQuery } from './partner-bookings-search';
import { localYmd } from './local-ymd';
import {
  partnerBookingIsPastSchedule,
  partnerBookingIsUnpaidCheckout,
  partnerBookingIsOperatingTrip,
  scheduleTodayIsoForBooking,
} from './trip-views';
import { nightsOccupiedByStay, stayRangeFromBooking } from './stayOccupancy';
import { partnerStayTouchesScheduleDay } from './trip-views';

export type PartnerBookingsTravelWindow = 'all' | 'today' | 'tomorrow' | 'upcoming' | 'past' | 'range';
export type PartnerBookingsSort =
  | 'newest'
  | 'oldest'
  | 'travel_asc'
  | 'travel_desc'
  | 'value_asc'
  | 'value_desc';
export type PartnerBookingsOps = 'all' | 'unpaid' | 'pickup' | 'cancel' | 'refund_due';
export type PartnerBookingsPaymentFilter = '' | 'paid' | 'unpaid' | 'refund_due' | 'refunded';

export type PartnerBookingsDeskQuery = {
  search: string;
  travel: PartnerBookingsTravelWindow;
  travelFrom: string;
  travelTo: string;
  purchaseFrom: string;
  purchaseTo: string;
  status: string;
  payment: PartnerBookingsPaymentFilter;
  listingId: string;
  ops: PartnerBookingsOps;
  sort: PartnerBookingsSort;
  inventoryFamily?: 'tour' | 'stay' | 'rental';
  highlightBookingId?: string | null;
};

export type PartnerBookingsDeskRow = {
  id: string;
  listing_id: string;
  guest_name?: string | null;
  guest_email?: string | null;
  booking_date?: string | null;
  status?: string | null;
  payment_status?: string | null;
  created_at: string;
  start_time?: string | null;
  booking_number?: number | null;
  public_reference?: string | null;
  amount_paid?: number | null;
  check_out?: string | null;
  nights?: number | null;
  special_requests?: string | null;
  hold_expires_at?: string | null;
  purchase_snapshot?: unknown;
  refund_choice?: string | null;
};

export const PARTNER_BOOKINGS_SORTS: Array<{ value: PartnerBookingsSort; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'travel_asc', label: 'Travel · earliest' },
  { value: 'travel_desc', label: 'Travel · latest' },
  { value: 'value_asc', label: 'Value · low–high' },
  { value: 'value_desc', label: 'Value · high–low' },
];

export const PARTNER_BOOKINGS_TRAVEL: Array<{ value: PartnerBookingsTravelWindow; label: string }> = [
  { value: 'all', label: 'Travel date' },
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
  { value: 'range', label: 'Custom range' },
];

export function partnerBookingLifecycleLabel(status: string | null | undefined): string {
  const s = (status ?? '').trim().toLowerCase();
  if (s === 'confirmed') return 'Confirmed';
  if (s === 'pending') return 'Pending';
  if (s === 'cancelled') return 'Cancelled';
  if (s === 'completed') return 'Completed';
  return (status ?? '').trim() || 'Pending';
}

export function partnerBookingsDeskFiltersActive(query: PartnerBookingsDeskQuery): boolean {
  return Boolean(
    query.search.trim() ||
      query.travel !== 'all' ||
      query.travelFrom ||
      query.travelTo ||
      query.purchaseFrom ||
      query.purchaseTo ||
      query.status ||
      query.payment ||
      query.listingId ||
      query.ops !== 'all' ||
      query.sort !== 'newest'
  );
}

function createdDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return localYmd(d);
}

function bookingValue(row: PartnerBookingsDeskRow): number {
  const n = Number(row.amount_paid ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function compareStable(a: PartnerBookingsDeskRow, b: PartnerBookingsDeskRow, primary: number): number {
  if (primary !== 0) return primary;
  return a.id.localeCompare(b.id);
}

export function comparePartnerBookingsDesk(
  a: PartnerBookingsDeskRow,
  b: PartnerBookingsDeskRow,
  sort: PartnerBookingsSort,
  startHm: (row: PartnerBookingsDeskRow) => string
): number {
  if (sort === 'oldest') return compareStable(a, b, a.created_at.localeCompare(b.created_at));
  if (sort === 'travel_asc' || sort === 'travel_desc') {
    const dir = sort === 'travel_asc' ? 1 : -1;
    const date = (a.booking_date ?? '').localeCompare(b.booking_date ?? '');
    if (date !== 0) return date * dir;
    const time = startHm(a).localeCompare(startHm(b));
    if (time !== 0) return time * dir;
    return a.id.localeCompare(b.id);
  }
  if (sort === 'value_asc' || sort === 'value_desc') {
    const dir = sort === 'value_asc' ? 1 : -1;
    const value = bookingValue(a) - bookingValue(b);
    if (value !== 0) return value * dir;
    return a.id.localeCompare(b.id);
  }
  return compareStable(a, b, b.created_at.localeCompare(a.created_at));
}

function matchesTravel(
  row: PartnerBookingsDeskRow,
  query: PartnerBookingsDeskQuery,
  isStay: boolean,
  nowMs: number
): boolean {
  if (query.travel === 'all' && !query.travelFrom && !query.travelTo) return true;
  const stayRange = isStay ? stayRangeFromBooking(row) : null;
  const experienceToday = scheduleTodayIsoForBooking(row, nowMs);
  const experienceTomorrow = addCalendarDaysYmd(experienceToday, 1) ?? experienceToday;
  if (query.travel === 'today' || query.travel === 'tomorrow') {
    if (query.ops === 'refund_due' || query.ops === 'unpaid' || query.ops === 'cancel') return true;
    if (!partnerBookingIsOperatingTrip(row)) return false;
    const dayIso = query.travel === 'today' ? experienceToday : experienceTomorrow;
    if (stayRange) return partnerStayTouchesScheduleDay(stayRange.checkIn, stayRange.checkOut, dayIso);
    return row.booking_date === dayIso;
  }
  if (query.travel === 'upcoming') {
    if (query.ops === 'refund_due' || query.ops === 'unpaid' || query.ops === 'cancel') return true;
    if (!partnerBookingIsOperatingTrip(row)) return false;
    if (stayRange) return stayRange.checkIn > experienceToday;
    return Boolean(row.booking_date && row.booking_date > experienceToday);
  }
  if (query.travel === 'past') {
    if (query.ops === 'refund_due' || query.ops === 'unpaid' || query.ops === 'cancel') return true;
    return partnerBookingIsPastSchedule(row, experienceToday);
  }
  const from = query.travelFrom;
  const to = query.travelTo;
  if (!from && !to) return true;
  if (stayRange) {
    const nights = nightsOccupiedByStay(stayRange.checkIn, stayRange.checkOut);
    const overlapsFrom = !from || nights.some((n) => n >= from);
    const overlapsTo = !to || nights.some((n) => n <= to);
    return overlapsFrom && overlapsTo;
  }
  if (from && (!row.booking_date || row.booking_date < from)) return false;
  if (to && (!row.booking_date || row.booking_date > to)) return false;
  return true;
}

function matchesPayment(row: PartnerBookingsDeskRow, payment: PartnerBookingsPaymentFilter): boolean {
  if (!payment) return true;
  const pay = (row.payment_status ?? '').trim().toLowerCase();
  if (payment === 'refund_due') return isRefundDueBooking(row);
  if (payment === 'refunded') return pay === 'refunded';
  if (payment === 'unpaid') {
    return partnerBookingIsUnpaidCheckout(row) || pay === 'authorized';
  }
  if (payment === 'paid') return isPaidPaymentStatus(pay) && pay !== 'refunded' && !isRefundDueBooking(row);
  return true;
}

/**
 * Filter then sort the supplier's authorized bookings.
 * Search runs on the full set passed in, not a single page.
 */
export function applyPartnerBookingsDesk<T extends PartnerBookingsDeskRow>(
  rows: T[],
  query: PartnerBookingsDeskQuery,
  extras: {
    nowMs: number;
    isStay: (row: T) => boolean;
    isRental?: (row: T) => boolean;
    pickupAttention: (row: T) => boolean;
    openCancel: (row: T) => boolean;
    title: (row: T) => string;
    startHm: (row: T) => string;
  }
): T[] {
  const q = query.search.trim().toLowerCase();
  const filtered = rows.filter((b) => {
    const isStay = extras.isStay(b);
    const isRental = extras.isRental?.(b) ?? false;
    // Strict separation: Bookings = tours; Reservations = stays; Rental bookings = rentals.
    // Wrong-desk deep links redirect in SupplierBookings (do not leak cross-family rows).
    if (query.inventoryFamily === 'stay' && (!isStay || isRental)) return false;
    if (query.inventoryFamily === 'tour' && (isStay || isRental)) return false;
    if (query.inventoryFamily === 'rental' && !isRental) return false;
    if (query.listingId && b.listing_id !== query.listingId) return false;
    if (query.status && (b.status ?? '').trim().toLowerCase() !== query.status) return false;
    if (!matchesPayment(b, query.payment)) return false;
    if (!matchesTravel(b, query, isStay, extras.nowMs)) return false;
    if (query.purchaseFrom || query.purchaseTo) {
      const day = createdDay(b.created_at);
      if (query.purchaseFrom && (!day || day < query.purchaseFrom)) return false;
      if (query.purchaseTo && (!day || day > query.purchaseTo)) return false;
    }
    if (query.ops === 'unpaid' && !partnerBookingIsUnpaidCheckout(b)) return false;
    if (query.ops === 'pickup' && !extras.pickupAttention(b)) return false;
    if (query.ops === 'cancel' && !extras.openCancel(b)) return false;
    if (query.ops === 'refund_due' && !isRefundDueBooking(b)) return false;
    if (!q) return true;

    // Phase 1481: search must match purchased titles shown on rows, not live listing renames.
    // Phase 1484: search must match booking # shown on rows (admin 1053 parity).
    const title = extras.title(b).toLowerCase();
    const idLower = b.id.toLowerCase();
    const guestName = (b.guest_name ?? '').toLowerCase();
    const guestEmail = (b.guest_email ?? '').toLowerCase();
    const reference = (b.public_reference ?? '').toLowerCase();
    return (
      title.includes(q) ||
      partnerBookingNumberMatchesFilterQuery(q, b.booking_number) ||
      idLower.includes(q) ||
      reference.includes(q) ||
      guestName.includes(q) ||
      guestEmail.includes(q)
    );
  });
  filtered.sort((a, b) => comparePartnerBookingsDesk(a, b, query.sort, (row) => extras.startHm(row as T)));
  return filtered;
}
