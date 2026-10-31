/**
 * Rental booking lifecycle for UI — schedule-based, not supplier handover actions.
 * Confirmed → Completed at/after the exact scheduled return instant (listing timezone).
 * Cancelled stays cancelled. Payment/refund labels remain separate.
 *
 * purchase_snapshot.rentalOpsStatus may still exist on historical rows; UI ignores it
 * for status chips. Inventory holds are interval-based and do not require ops transitions.
 */

import {
  lifecycleRentalReturnYmd,
  resolveLifecycleTimezone,
  ymdInTimeZone,
} from './booking-lifecycle-calendar';
import { normalizePaymentStatus } from './payment-states';
import { bookingIsRental } from './pickup-completeness';
import { parseRentalPurchaseSnapshot } from './rental-booking-domain';

export type RentalSimpleStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export type RentalStatusBooking = {
  status?: string | null;
  payment_status?: string | null;
  booking_date?: string | null;
  check_out?: string | null;
  purchase_snapshot?: unknown;
};

function rentalIsCancelled(b: RentalStatusBooking): boolean {
  const st = (b.status ?? '').trim().toLowerCase();
  const pay = normalizePaymentStatus(b.payment_status);
  return st === 'cancelled' || pay === 'refunded';
}

function snapshotReturnAtRaw(b: RentalStatusBooking): string | null {
  const snap = parseRentalPurchaseSnapshot(b.purchase_snapshot);
  if (snap?.returnAt?.trim()) return snap.returnAt.trim();
  if (b.purchase_snapshot && typeof b.purchase_snapshot === 'object') {
    const raw = (b.purchase_snapshot as { returnAt?: unknown }).returnAt;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return null;
}

/**
 * Absolute ms of the scheduled return in the rental location timezone.
 * Prefers purchase_snapshot.returnAt; date-only fallbacks use end of that local day.
 */
export function rentalScheduledReturnAtMs(b: RentalStatusBooking): number | null {
  if (!bookingIsRental(b)) return null;
  const tz = resolveLifecycleTimezone(b.purchase_snapshot);
  const raw = snapshotReturnAtRaw(b);
  if (raw) {
    const hasOffset = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(raw.trim());
    if (hasOffset) {
      const ms = Date.parse(raw);
      return Number.isFinite(ms) ? ms : null;
    }
    // Wall-clock without offset — interpret in listing timezone via mid-search on UTC.
    const m = raw.match(
      /^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/
    );
    if (m) {
      const ymd = m[1];
      const hh = m[2] ?? '23';
      const mm = m[3] ?? '59';
      const ss = m[4] ?? (m[2] ? '00' : '59');
      return wallTimeInTimeZoneToUtcMs(ymd, `${hh}:${mm}:${ss}`, tz);
    }
  }
  const ymd = lifecycleRentalReturnYmd(b) ?? (b.booking_date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return wallTimeInTimeZoneToUtcMs(ymd, '23:59:59', tz);
}

/** Convert listing-local YMD + HH:mm:ss to UTC ms (binary search on zone offset). */
function wallTimeInTimeZoneToUtcMs(
  ymd: string,
  hms: string,
  timeZone: string
): number | null {
  const [y, mo, d] = ymd.split('-').map(Number);
  const [hh, mm, ss] = hms.split(':').map((p) => Number(p) || 0);
  if (![y, mo, d, hh, mm, ss].every((n) => Number.isFinite(n))) return null;
  // Guess: treat components as UTC then correct by observed local offset.
  let guess = Date.UTC(y, mo - 1, d, hh, mm, ss);
  for (let i = 0; i < 3; i += 1) {
    const local = localPartsInTimeZone(guess, timeZone);
    if (!local) return null;
    const asUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second
    );
    const target = Date.UTC(y, mo - 1, d, hh, mm, ss);
    const delta = target - asUtc;
    if (delta === 0) return guess;
    guess += delta;
  }
  const verify = localPartsInTimeZone(guess, timeZone);
  if (
    !verify ||
    verify.year !== y ||
    verify.month !== mo ||
    verify.day !== d ||
    verify.hour !== hh ||
    verify.minute !== mm
  ) {
    return null;
  }
  return guess;
}

function localPartsInTimeZone(
  ms: number,
  timeZone: string
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(ms));
    const num = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value ?? NaN);
    const year = num('year');
    const month = num('month');
    const day = num('day');
    const hour = num('hour');
    const minute = num('minute');
    const second = num('second');
    if (![year, month, day, hour, minute, second].every((n) => Number.isFinite(n))) {
      return null;
    }
    return { year, month, day, hour, minute, second };
  } catch {
    return null;
  }
}

/** True when now is at or after the scheduled return instant (listing timezone). */
export function rentalScheduledReturnElapsed(
  b: RentalStatusBooking,
  nowMs: number = Date.now()
): boolean {
  const at = rentalScheduledReturnAtMs(b);
  return at != null && nowMs >= at;
}

/**
 * True when the booking should show Completed (paid/confirmed path after return instant).
 * Does not require supplier “mark returned”. Ignores rentalOpsStatus.
 */
export function rentalBookingIsScheduleCompleted(
  b: RentalStatusBooking,
  nowMs: number = Date.now()
): boolean {
  if (!bookingIsRental(b)) return false;
  if (rentalIsCancelled(b)) return false;
  return rentalScheduledReturnElapsed(b, nowMs);
}

/**
 * Map booking row → simple rental lifecycle for partner/customer chips.
 * Legacy rentalOpsStatus values are not used (safe ignore / soft migrate).
 */
export function rentalBookingSimpleStatus(
  b: RentalStatusBooking,
  nowMs: number = Date.now()
): RentalSimpleStatus {
  if (rentalIsCancelled(b)) return 'cancelled';
  const st = (b.status ?? '').trim().toLowerCase();
  if (st === 'pending') return 'pending';
  if (rentalBookingIsScheduleCompleted(b, nowMs)) return 'completed';
  if (st === 'completed') return 'completed';
  return 'confirmed';
}

export function rentalBookingSimpleStatusLabel(
  b: RentalStatusBooking,
  nowMs: number = Date.now()
): string {
  const s = rentalBookingSimpleStatus(b, nowMs);
  if (s === 'completed') return 'Completed';
  if (s === 'cancelled') return 'Cancelled';
  if (s === 'pending') return 'Pending';
  return 'Confirmed';
}

/** @deprecated Prefer rentalScheduledReturnElapsed — kept for calendar-day callers. */
export function rentalScheduleCompletionYmd(b: RentalStatusBooking): string | null {
  if (!bookingIsRental(b)) return null;
  const at = rentalScheduledReturnAtMs(b);
  if (at != null) {
    return ymdInTimeZone(at, resolveLifecycleTimezone(b.purchase_snapshot));
  }
  const fromReturn = lifecycleRentalReturnYmd(b);
  if (fromReturn) return fromReturn;
  const date = (b.booking_date ?? '').trim();
  return date || null;
}
