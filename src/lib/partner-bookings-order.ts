/**
 * Partner Bookings list order: date, then departure time (multi-schedule desk).
 */

export function comparePartnerBookingsOperational(
  a: { booking_date?: string | null; start_time_hm?: string | null; created_at: string },
  b: { booking_date?: string | null; start_time_hm?: string | null; created_at: string },
  opts?: { pastFirst?: boolean }
): number {
  const pastFirst = Boolean(opts?.pastFirst);
  const da = a.booking_date ?? '';
  const db = b.booking_date ?? '';
  if (da !== db) return pastFirst ? db.localeCompare(da) : da.localeCompare(db);
  const ta = a.start_time_hm ?? '';
  const tb = b.start_time_hm ?? '';
  if (ta !== tb) return ta.localeCompare(tb);
  return a.created_at.localeCompare(b.created_at);
}
