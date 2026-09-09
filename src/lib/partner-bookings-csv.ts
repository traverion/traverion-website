import { partnerPaymentLabel, normalizePaymentStatus, type MoneyBookingRow } from './payment-states';

export type PartnerBookingCsvRow = MoneyBookingRow & {
  id: string;
  listing_id?: string | null;
  booking_number?: number | null;
  guest_name?: string | null;
  guest_email?: string | null;
  guests?: number | null;
  booking_date?: string | null;
  start_time?: string | null;
  pickup_time?: string | null;
  acknowledged_at?: string | null;
  created_at?: string | null;
  special_requests?: string | null;
  cancellation_reason?: string | null;
};

/** Columns for partner Bookings export — payment_label matches UI honesty (Refund due, etc.). */
export const PARTNER_BOOKINGS_CSV_HEADER = [
  'booking_id',
  'booking_number',
  'listing_id',
  'listing_title',
  'guest_name',
  'guest_email',
  'guests',
  'booking_date',
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
  pickupHm: string
): string[] {
  return [
    b.id,
    typeof b.booking_number === 'number' ? String(b.booking_number) : '',
    b.listing_id ?? '',
    listingTitle,
    b.guest_name ?? '',
    b.guest_email ?? '',
    b.guests != null ? String(b.guests) : '',
    b.booking_date ?? '',
    startHm,
    pickupHm,
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
