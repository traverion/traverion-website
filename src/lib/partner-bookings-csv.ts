import { partnerPaymentLabel, normalizePaymentStatus, bookingPaymentWasCollected, type MoneyBookingRow } from './payment-states';
import { bookingIsStayNight } from './pickup-completeness';
import { nightsOccupiedByStay, stayRangeFromBooking } from './stayOccupancy';
import { stayPaidAdjacentNightCount } from './booking-confirmation-copy';
import type { PurchaseSnapshot } from './purchase-snapshot';

export type PartnerBookingCsvRow = MoneyBookingRow & {
  id: string;
  listing_id?: string | null;
  booking_number?: number | null;
  guest_name?: string | null;
  guest_email?: string | null;
  guests?: number | null;
  booking_date?: string | null;
  check_out?: string | null;
  nights?: number | null;
  nightly_amount?: number | null;
  cleaning_fee?: number | null;
  start_time?: string | null;
  pickup_time?: string | null;
  acknowledged_at?: string | null;
  created_at?: string | null;
  special_requests?: string | null;
  cancellation_reason?: string | null;
  purchase_snapshot?: unknown;
};

/** Columns for partner Bookings export — payment_label matches UI honesty (Refund due, etc.). */
export const PARTNER_BOOKINGS_CSV_HEADER = [
  'booking_id',
  'booking_number',
  'listing_id',
  'listing_title',
  'inventory',
  'guest_name',
  'guest_email',
  'guests',
  'booking_date',
  'check_out',
  'nights',
  'start_time',
  'pickup_time',
  'status',
  'payment_status',
  'payment_label',
  'amount_paid',
  'currency',
  'acknowledged_at',
  'created_at',
  'special_requests',
  'cancellation_reason',
  'refund_choice',
] as const;

export function partnerBookingCsvValues(
  b: PartnerBookingCsvRow,
  listingTitle: string,
  startHm: string,
  pickupHm: string,
  opts?: { inventory?: 'tour' | 'stay'; nights?: number | null }
): string[] {
  // Phase 1538: stay shape = bookingIsStayNight + stayRangeFromBooking (1524 parity),
  // not check_out column alone (nights-only / snapshot-only must export check-out).
  const isStay = opts?.inventory === 'stay' || (opts?.inventory !== 'tour' && bookingIsStayNight(b));
  const inventory: 'tour' | 'stay' = opts?.inventory ?? (isStay ? 'stay' : 'tour');
  const range = inventory === 'stay' ? stayRangeFromBooking(b) : null;
  const checkOut = range?.checkOut ?? (typeof b.check_out === 'string' ? b.check_out.trim() : '');
  const nightsFromOpts =
    opts?.nights != null && Number.isFinite(opts.nights) && opts.nights > 0
      ? Math.floor(opts.nights)
      : null;
  // Phase 1552: prefer purchased range over stale bookings.nights (1538 check_out / 1551 parity).
  const nightsFromRange =
    range != null ? nightsOccupiedByStay(range.checkIn, range.checkOut).length : 0;
  const nightsFromRow =
    b.nights != null && Number.isFinite(Number(b.nights)) && Number(b.nights) >= 1
      ? Math.floor(Number(b.nights))
      : null;
  // Phase 1552/1573: purchased range nights beat opts override and stale row nights
  // (opts must not invent short nights beside 1564 exclusive check_out).
  const occupancyNights =
    nightsFromRange >= 1 ? nightsFromRange : nightsFromOpts != null ? nightsFromOpts : nightsFromRow;
  // Phase 1591: when paid+nightly, nights column reconciles to amount_paid (1588 / Bookings UI parity).
  // check_out stays exclusive occupancy range; omit nights when paid+nightly cannot reconcile.
  const paidWithNightly =
    inventory === 'stay' &&
    bookingPaymentWasCollected(b.payment_status) &&
    b.amount_paid != null &&
    Number(b.amount_paid) > 0 &&
    b.nightly_amount != null;
  const paidAdjacent = paidWithNightly
    ? stayPaidAdjacentNightCount({
        amountPaid: b.amount_paid,
        nightlyAmount: b.nightly_amount,
        cleaningFee: b.cleaning_fee,
        paymentCollected: true,
        columnNights: b.nights,
        snapshotNights: (b.purchase_snapshot as PurchaseSnapshot | null | undefined)?.nights,
        occupancyNights,
      })
    : null;
  const nights = paidWithNightly
    ? paidAdjacent != null
      ? String(paidAdjacent)
      : ''
    : occupancyNights != null && occupancyNights >= 1
      ? String(occupancyNights)
      : '';
  return [
    b.id,
    typeof b.booking_number === 'number' ? String(b.booking_number) : '',
    b.listing_id ?? '',
    listingTitle,
    inventory,
    b.guest_name ?? '',
    b.guest_email ?? '',
    b.guests != null ? String(b.guests) : '',
    b.booking_date ?? '',
    checkOut,
    nights,
    startHm,
    inventory === 'stay' ? '' : pickupHm,
    b.status ?? '',
    normalizePaymentStatus(b.payment_status),
    partnerPaymentLabel(b),
    b.amount_paid != null ? String(b.amount_paid) : '',
    b.currency ?? '',
    b.acknowledged_at ?? '',
    b.created_at ?? '',
    b.special_requests ?? '',
    b.cancellation_reason ?? '',
    b.refund_choice ?? '',
  ];
}
