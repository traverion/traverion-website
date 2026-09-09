import { partnerPaymentLabel, normalizePaymentStatus, type MoneyBookingRow } from './payment-states';

export type PartnerPickupCsvRow = MoneyBookingRow & {
  booking_date?: string | null;
  status?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  guests?: number | null;
  booking_number?: number | null;
};

/** Pickup planner export — payment_label matches Bookings honesty (Paid vs unpaid hold). */
export const PARTNER_PICKUP_CSV_HEADER = [
  'booking_date',
  'booking_number',
  'status',
  'payment_status',
  'payment_label',
  'listing_title',
  'guest',
  'guests',
  'start_time',
  'pickup_time',
  'meeting_point',
  'pickup_instructions',
] as const;

export function partnerPickupCsvValues(
  b: PartnerPickupCsvRow,
  listingTitle: string,
  startHm: string,
  pickupHm: string,
  meetingPoint: string,
  pickupInstructions: string
): string[] {
  return [
    b.booking_date ?? '',
    typeof b.booking_number === 'number' ? String(b.booking_number) : '',
    b.status ?? '',
    normalizePaymentStatus(b.payment_status),
    partnerPaymentLabel(b),
    listingTitle,
    b.guest_name ?? b.guest_email ?? '',
    b.guests != null ? String(b.guests) : '',
    startHm,
    pickupHm,
    meetingPoint,
    pickupInstructions,
  ];
}
