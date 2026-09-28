/**
 * Experience-local calendar semantics for booking lifecycle jobs (reminders, reviews).
 *
 * PURCHASE CONTRACT:
 * - Tour departure date = booking_date (sold seat; startTimeHm is wall clock on that date)
 * - Stay check-in date = booking_date; stay completes on check_out (column, nights, notes, or snap)
 * - Timezone = purchase_snapshot.departureTimezone (else Europe/Helsinki)
 *
 * Reminder: local calendar day before departure / check-in.
 * Review prompt: local calendar day after tour departure, or after stay check-out
 * (never after check-in alone).
 *
 * Mirrored at supabase/functions/_shared/booking-lifecycle-calendar.ts.
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

/**
 * Stay shape parity with bookingIsStayNight / SQL booking_is_stay_night (Phase 1523):
 * check_out column, purchased checkOut, or nights >= 1 — never notes-only check_out:.
 */
export function lifecycleBookingIsStay(b: LifecycleBookingRow): boolean {
  if (isoDay(b.check_out)) return true;
  const snapOut = snapshotString(b.purchase_snapshot, 'checkOut');
  if (snapOut && ISO_DATE.test(snapOut)) return true;
  const nights = Math.floor(Number(b.nights ?? 0));
  if (Number.isFinite(nights) && nights >= 1) return true;
  return false;
}

/**
 * Stay check-out day: column → nights → snap (Phase 1524). Never notes-only check_out:.
 */
export function lifecycleStayCheckOutYmd(b: LifecycleBookingRow): string | null {
  const checkIn = isoDay(b.booking_date);
  const fromColumn = isoDay(b.check_out);
  if (fromColumn && checkIn && fromColumn > checkIn) return fromColumn;
  if (fromColumn) return fromColumn;
  const nights = Math.floor(Number(b.nights ?? 0));
  if (checkIn && Number.isFinite(nights) && nights >= 1) {
    return addCalendarDaysYmd(checkIn, nights);
  }
  const fromSnap = isoDay(snapshotString(b.purchase_snapshot, 'checkOut'));
  if (fromSnap && (!checkIn || fromSnap > checkIn)) return fromSnap;
  return null;
}

/**
 * Date the traveler is preparing for: tour departure or stay check-in.
 * Always booking_date (purchase contract).
 */
export function lifecycleReminderAnchorYmd(b: LifecycleBookingRow): string | null {
  return isoDay(b.booking_date);
}

/**
 * Date after which the experience is complete for review prompting.
 * Tour: departure day. Stay: check-out day — never check-in alone.
 */
export function lifecycleReviewCompletionYmd(b: LifecycleBookingRow): string | null {
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

/** True when experience-local today is the calendar day before departure/check-in. */
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
 * True when experience-local today is the calendar day after completion
 * (tour departure or stay check-out).
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
