import { bookingIsStayNight } from './pickup-completeness';
import { displayStayCheckOutTimeFromPurchase } from './purchase-snapshot';
import { stayRangeFromBooking } from './stayOccupancy';
import {
  durationMinutesFromPurchase,
  resolveReviewTimezone,
  reviewUnlockMsForStay,
  reviewUnlockMsForTour,
  tourStartHmFromBooking,
} from './review-experience-end';

/**
 * Pure rules for when a booking may unlock a traveler review.
 * Mirrors SQL booking_experience_started_for_review (Phase 1326/1328 + duration end).
 *
 * Tours: unlock after scheduled departure + snapshotted duration (when present).
 * Stays: unlock after scheduled checkout (date + optional checkOutTime).
 * Cancelled / unpaid never unlock.
 */
export function bookingEligibleForReview(
  b: {
    status?: string | null;
    payment_status?: string | null;
    booking_date: string | null;
    start_time?: string | null;
    check_out?: string | null;
    nights?: number | null;
    special_requests?: string | null;
    purchase_snapshot?: unknown;
    /** Optional explicit TZ when snapshot is not attached. */
    departureTimezone?: string | null;
  },
  nowMs: number = Date.now()
): boolean {
  if (lower(b.status) !== 'confirmed') return false;
  const pay = lower(b.payment_status);
  if (!(pay === 'paid' || pay === 'complete' || pay === 'succeeded')) return false;

  const tz = resolveReviewTimezone({
    purchase_snapshot: b.purchase_snapshot,
    departureTimezone: b.departureTimezone,
  });

  if (bookingIsStayNight(b)) {
    const stay = stayRangeFromBooking(b);
    if (!stay) return false;
    const checkOutHm = displayStayCheckOutTimeFromPurchase(b.purchase_snapshot, null);
    const unlockMs = reviewUnlockMsForStay({
      checkOutYmd: stay.checkOut,
      checkOutTimeHm: checkOutHm,
      timeZone: tz,
    });
    return unlockMs != null && nowMs > unlockMs;
  }

  const date = (b.booking_date ?? '').trim();
  if (!date) return false;
  const startHm = tourStartHmFromBooking(b);
  const durationMinutes = durationMinutesFromPurchase(b.purchase_snapshot, null);
  const unlockMs = reviewUnlockMsForTour({
    bookingDate: date,
    startTimeHm: startHm,
    timeZone: tz,
    durationMinutes,
  });
  return unlockMs != null && nowMs > unlockMs;
}

function lower(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

/** Calendar YYYY-MM-DD in an IANA zone at the given instant. */
export function ymdInZone(ms: number, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(ms));
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (!y || !m || !d) return null;
    return `${y}-${m}-${d}`;
  } catch {
    return null;
  }
}
