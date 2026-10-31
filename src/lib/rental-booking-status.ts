/**
 * Rental booking lifecycle for UI — schedule-based, not supplier handover actions.
 * Confirmed → (after scheduled return day) Completed. Cancelled stays cancelled.
 * Payment/refund labels remain separate (partnerPaymentLabel / travelerPaymentLabel).
 *
 * purchase_snapshot.rentalOpsStatus may still exist on historical rows; UI ignores it
 * for status chips. Inventory holds are interval-based and do not require ops transitions.
 */

import { lifecycleRentalReturnYmd } from './booking-lifecycle-calendar';
import { bookingIsCancelledTrip, scheduleTodayIsoForBooking } from './trip-views';
import { bookingIsRental } from './pickup-completeness';

export type RentalSimpleStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export type RentalStatusBooking = {
  status?: string | null;
  payment_status?: string | null;
  booking_date?: string | null;
  check_out?: string | null;
  purchase_snapshot?: unknown;
};

/** Experience-local return calendar day — completion anchor. */
export function rentalScheduleCompletionYmd(b: RentalStatusBooking): string | null {
  if (!bookingIsRental(b)) return null;
  const fromReturn = lifecycleRentalReturnYmd(b);
  if (fromReturn) return fromReturn;
  const date = (b.booking_date ?? '').trim();
  return date || null;
}

/**
 * True when the scheduled return day is strictly before experience-local today.
 * Does not require supplier “mark returned”. Does not inspect damage/overdue flags.
 */
export function rentalBookingIsScheduleCompleted(
  b: RentalStatusBooking,
  todayIso?: string,
  nowMs: number = Date.now()
): boolean {
  if (!bookingIsRental(b)) return false;
  if (bookingIsCancelledTrip(b)) return false;
  const day = todayIso ?? scheduleTodayIsoForBooking(b, nowMs);
  const completion = rentalScheduleCompletionYmd(b);
  return Boolean(completion && completion < day);
}

/**
 * Map booking row → simple rental lifecycle for partner/customer chips.
 * Legacy rentalOpsStatus values are not used (safe ignore / soft migrate).
 */
export function rentalBookingSimpleStatus(
  b: RentalStatusBooking,
  todayIso?: string,
  nowMs: number = Date.now()
): RentalSimpleStatus {
  if (bookingIsCancelledTrip(b)) return 'cancelled';
  const st = (b.status ?? '').trim().toLowerCase();
  if (st === 'pending') return 'pending';
  if (rentalBookingIsScheduleCompleted(b, todayIso, nowMs)) return 'completed';
  if (st === 'confirmed' || st === 'completed') return st === 'completed' ? 'completed' : 'confirmed';
  return st === 'cancelled' ? 'cancelled' : 'confirmed';
}

export function rentalBookingSimpleStatusLabel(
  b: RentalStatusBooking,
  todayIso?: string,
  nowMs: number = Date.now()
): string {
  const s = rentalBookingSimpleStatus(b, todayIso, nowMs);
  if (s === 'completed') return 'Completed';
  if (s === 'cancelled') return 'Cancelled';
  if (s === 'pending') return 'Pending';
  return 'Confirmed';
}
