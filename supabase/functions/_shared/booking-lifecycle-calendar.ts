/** Mirror of src/lib/booking-lifecycle-calendar.ts for Deno edge runtime. */
/**
 * Experience-local calendar semantics for booking lifecycle jobs (reminders, reviews).
 *
 * PURCHASE CONTRACT:
 * - Tour departure date = booking_date (sold seat; startTimeHm is wall clock on that date)
 * - Stay check-in date = booking_date; stay completes on check_out (column, nights, notes, or snap)
 * - Rental pickup = purchase_snapshot.pickupAt (else booking_date); return = returnAt (else check_out)
 * - Timezone = purchase_snapshot.departureTimezone (else Europe/Helsinki)
 *
 * Reminder: local calendar day before departure / check-in / rental pickup.
 * Rental return reminder: local calendar day before returnAt.
 * Review prompt: local calendar day after tour departure, stay check-out, or rental return
 * (never after check-in / pickup alone for multi-day products).
 *
 * Keep in sync with src/lib/booking-lifecycle-calendar.ts.
 */

export const LIFECYCLE_DEFAULT_TIMEZONE = 'Europe/Helsinki';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type LifecycleBookingRow = {
  booking_date?: string | null;
  check_out?: string | null;
  nights?: number | null;
  special_requests?: string | null;
  purchase_snapshot?: unknown;
  status?: string | null;
  payment_status?: string | null;
};

export function resolveLifecycleTimezone(snapshot: unknown): string {
  if (snapshot && typeof snapshot === 'object') {
    const raw = (snapshot as Record<string, unknown>).departureTimezone;
    const candidate = typeof raw === 'string' ? raw.trim() : '';
    if (candidate) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: candidate });
        return candidate;
      } catch {
        /* fall through */
      }
    }
  }
  return LIFECYCLE_DEFAULT_TIMEZONE;
}

/** Calendar YYYY-MM-DD in an IANA zone at the given instant. */
export function ymdInTimeZone(ms: number, timeZone: string): string | null {
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

/** Add whole calendar days to a YYYY-MM-DD (UTC-noon arithmetic — date-only). */
export function addCalendarDaysYmd(ymd: string, days: number): string | null {
  const day = ymd.trim();
  if (!ISO_DATE.test(day) || !Number.isFinite(days)) return null;
  const [y, m, d] = day.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d) + Math.trunc(days) * 86_400_000;
  const dt = new Date(utc);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function isoDay(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  return ISO_DATE.test(t) ? t : null;
}

function snapshotString(snapshot: unknown, key: string): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const v = (snapshot as Record<string, unknown>)[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function snapshotInventoryFamily(snapshot: unknown): string | null {
  const raw = snapshotString(snapshot, 'inventoryFamily');
  return raw ? raw.toLowerCase() : null;
}

/** True when purchase_snapshot.inventoryFamily = rental. */
export function lifecycleBookingIsRental(b: LifecycleBookingRow): boolean {
  return snapshotInventoryFamily(b.purchase_snapshot) === 'rental';
}

/**
 * Stay shape parity with bookingIsStayNight / SQL booking_is_stay_night (Phase 1523):
 * check_out column, purchased checkOut, or nights >= 1 — never notes-only check_out:.
 * Rentals reuse check_out for return-day accounting — never treat as stays.
 */
export function lifecycleBookingIsStay(b: LifecycleBookingRow): boolean {
  if (lifecycleBookingIsRental(b)) return false;
  if (isoDay(b.check_out)) return true;
  const snapOut = snapshotString(b.purchase_snapshot, 'checkOut');
  if (snapOut && ISO_DATE.test(snapOut)) return true;
  const nights = Math.floor(Number(b.nights ?? 0));
  if (Number.isFinite(nights) && nights >= 1) return true;
  return false;
}

/** YYYY-MM-DD from an ISO timestamp in the experience timezone. */
function ymdFromIsoInTz(iso: string | null, timeZone: string): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    const day = isoDay(iso.slice(0, 10));
    return day;
  }
  return ymdInTimeZone(ms, timeZone);
}

/**
 * Stay check-out day: latest of column / nights / snap (Phase 1524/1554/1564). Never notes-only.
 */
export function lifecycleStayCheckOutYmd(b: LifecycleBookingRow): string | null {
  const checkIn = isoDay(b.booking_date);
  const fromColumn = isoDay(b.check_out);
  const nights = Math.floor(Number(b.nights ?? 0));
  const fromNights =
    checkIn && Number.isFinite(nights) && nights >= 1 ? addCalendarDaysYmd(checkIn, nights) : null;
  const fromSnap = isoDay(snapshotString(b.purchase_snapshot, 'checkOut'));
  const columnOk = fromColumn && checkIn && fromColumn > checkIn ? fromColumn : null;
  const nightsOk = fromNights && checkIn && fromNights > checkIn ? fromNights : null;
  const snapOk = fromSnap && checkIn && fromSnap > checkIn ? fromSnap : null;
  // Phase 1564: later of all signals (stale short column must not win).
  const candidates = [columnOk, nightsOk, snapOk].filter((d): d is string => Boolean(d));
  if (candidates.length > 0) return candidates.reduce((a, b) => (a > b ? a : b));
  // Preserve prior behavior: return malformed/equal column when no longer signal exists.
  return fromColumn;
}

/**
 * Date the traveler is preparing for: tour departure, stay check-in, or rental pickup.
 * Tours/stays: booking_date. Rentals: pickupAt local day (fallback booking_date).
 */
export function lifecycleReminderAnchorYmd(b: LifecycleBookingRow): string | null {
  if (lifecycleBookingIsRental(b)) {
    const tz = resolveLifecycleTimezone(b.purchase_snapshot);
    const fromPickup = ymdFromIsoInTz(snapshotString(b.purchase_snapshot, 'pickupAt'), tz);
    if (fromPickup) return fromPickup;
  }
  return isoDay(b.booking_date);
}

/**
 * Rental return calendar day (experience TZ). Null for non-rentals.
 */
export function lifecycleRentalReturnYmd(b: LifecycleBookingRow): string | null {
  if (!lifecycleBookingIsRental(b)) return null;
  const tz = resolveLifecycleTimezone(b.purchase_snapshot);
  const fromReturn = ymdFromIsoInTz(snapshotString(b.purchase_snapshot, 'returnAt'), tz);
  if (fromReturn) return fromReturn;
  return isoDay(b.check_out);
}

/**
 * Date after which the experience is complete for review prompting.
 * Tour: departure day. Stay: check-out day. Rental: return day — never pickup alone.
 */
export function lifecycleReviewCompletionYmd(b: LifecycleBookingRow): string | null {
  if (lifecycleBookingIsRental(b)) {
    return lifecycleRentalReturnYmd(b) ?? isoDay(b.booking_date);
  }
  if (lifecycleBookingIsStay(b)) {
    return lifecycleStayCheckOutYmd(b);
  }
  return isoDay(b.booking_date);
}

function isPaidConfirmed(b: LifecycleBookingRow): boolean {
  const st = (b.status ?? '').trim().toLowerCase();
  const pay = (b.payment_status ?? '').trim().toLowerCase();
  if (st !== 'confirmed') return false;
  return pay === 'paid' || pay === 'complete' || pay === 'succeeded';
}

/** True when experience-local today is the calendar day before departure/check-in/pickup. */
export function shouldSendExperienceReminder(b: LifecycleBookingRow, nowMs: number = Date.now()): boolean {
  if (!isPaidConfirmed(b)) return false;
  const anchor = lifecycleReminderAnchorYmd(b);
  if (!anchor) return false;
  const tz = resolveLifecycleTimezone(b.purchase_snapshot);
  const todayLocal = ymdInTimeZone(nowMs, tz);
  if (!todayLocal) return false;
  return addCalendarDaysYmd(todayLocal, 1) === anchor;
}

/**
 * Rental-only: true when experience-local today is the calendar day before return.
 * Uses a separate notify idempotency key from pickup reminders.
 */
export function shouldSendRentalReturnReminder(b: LifecycleBookingRow, nowMs: number = Date.now()): boolean {
  if (!lifecycleBookingIsRental(b)) return false;
  if (!isPaidConfirmed(b)) return false;
  const returnYmd = lifecycleRentalReturnYmd(b);
  if (!returnYmd) return false;
  const tz = resolveLifecycleTimezone(b.purchase_snapshot);
  const todayLocal = ymdInTimeZone(nowMs, tz);
  if (!todayLocal) return false;
  return addCalendarDaysYmd(todayLocal, 1) === returnYmd;
}

/**
 * True when experience-local today is the calendar day after completion
 * (tour departure, stay check-out, or rental return).
 */
export function shouldSendReviewRequest(b: LifecycleBookingRow, nowMs: number = Date.now()): boolean {
  if (!isPaidConfirmed(b)) return false;
  const completion = lifecycleReviewCompletionYmd(b);
  if (!completion) return false;
  const tz = resolveLifecycleTimezone(b.purchase_snapshot);
  const todayLocal = ymdInTimeZone(nowMs, tz);
  if (!todayLocal) return false;
  return addCalendarDaysYmd(completion, 1) === todayLocal;
}

/**
 * UTC calendar window large enough to cover all IANA offsets when selecting
 * candidate rows before per-booking local filtering.
 */
export function lifecycleCandidateUtcWindow(nowMs: number = Date.now()): {
  fromYmd: string;
  toYmd: string;
} {
  const utcToday = new Date(nowMs).toISOString().slice(0, 10);
  return {
    fromYmd: addCalendarDaysYmd(utcToday, -3) ?? utcToday,
    toYmd: addCalendarDaysYmd(utcToday, 3) ?? utcToday,
  };
}

/**
 * Wider check-in window so nights-only stays whose check-out falls in the
 * ±3 day candidate window are still selected (Phase 1332).
 */
export function lifecycleStayNightsCandidateUtcWindow(nowMs: number = Date.now()): {
  fromYmd: string;
  toYmd: string;
} {
  const utcToday = new Date(nowMs).toISOString().slice(0, 10);
  return {
    fromYmd: addCalendarDaysYmd(utcToday, -60) ?? utcToday,
    toYmd: addCalendarDaysYmd(utcToday, 3) ?? utcToday,
  };
}
