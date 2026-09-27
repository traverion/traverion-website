import { resolveDepartureTimezone, wallTimeInZoneToUtcMs } from './tour-departure-cutoff';
import { displayDepartureTimezoneFromPurchase, displayStartTimeFromPurchase } from './purchase-snapshot';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Pure rules for when a booking may unlock a traveler review — mirrors SQL booking_experience_started_for_review. */
export function bookingEligibleForReview(
  b: {
    status?: string | null;
    payment_status?: string | null;
    booking_date: string | null;
    start_time?: string | null;
    check_out?: string | null;
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

  const tz = resolveDepartureTimezone(
    displayDepartureTimezoneFromPurchase(b.purchase_snapshot) || b.departureTimezone
  );

  // Stay: only real check_out column (matches SQL booking_experience_started_for_review).
  // Do not invent checkout from notes — that opened UI while RLS still blocked.
  const checkOutCol = (b.check_out ?? '').trim();
  if (ISO_DATE.test(checkOutCol)) {
    const todayLocal = ymdInZone(nowMs, tz);
    return Boolean(todayLocal && todayLocal >= checkOutCol);
  }

  const date = (b.booking_date ?? '').trim();
  if (!date) return false;
  const startHm =
    displayStartTimeFromPurchase(b.purchase_snapshot, b.start_time)?.slice(0, 5) || '23:59';
  const startMs = wallTimeInZoneToUtcMs(date, startHm, tz);
  return startMs != null && nowMs > startMs;
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
