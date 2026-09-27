import { stayRangeFromBooking } from './stayOccupancy';

/** Pure rules for when a booking may unlock a traveler review. */
export function bookingEligibleForReview(
  b: {
    status?: string | null;
    payment_status?: string | null;
    booking_date: string | null;
    start_time?: string | null;
    check_out?: string | null;
    nights?: number | null;
    special_requests?: string | null;
  },
  nowMs: number = Date.now()
): boolean {
  if (lower(b.status) !== 'confirmed') return false;
  const pay = lower(b.payment_status);
  if (!(pay === 'paid' || pay === 'complete' || pay === 'succeeded')) return false;

  const stay = stayRangeFromBooking(b);
  if (stay) {
    const checkoutMs = new Date(`${stay.checkOut}T00:00:00`).getTime();
    return Number.isFinite(checkoutMs) && nowMs >= checkoutMs;
  }
  const startMs = toStartMs(b.booking_date, b.start_time ?? null);
  return startMs != null && nowMs > startMs;
}

function lower(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

function toStartMs(bookingDate: string | null, startTime: string | null): number | null {
  const date = (bookingDate ?? '').trim();
  if (!date) return null;
  const t = (startTime ?? '').trim();
  const hhmm = /^(\d{1,2}):(\d{2})/.exec(t);
  const hh = hhmm ? hhmm[1].padStart(2, '0') : '23';
  const mm = hhmm ? hhmm[2] : '59';
  const d = new Date(`${date}T${hh}:${mm}:00`);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}
