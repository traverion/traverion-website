/** Stay nights are [check-in, check-out) — checkout night is not occupied. */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function addCalendarDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function parseStayCheckOutFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  for (const raw of notes.split(/\n+/)) {
    const m = raw.trim().match(/^check_out:\s*(\d{4}-\d{2}-\d{2})/i);
    if (m?.[1] && ISO_DATE.test(m[1])) return m[1];
  }
  return null;
}

export function nightsOccupiedByStay(checkIn: string, checkOut: string): string[] {
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut) || checkOut <= checkIn) return [];
  const out: string[] = [];
  let cur = checkIn;
  while (cur < checkOut) {
    out.push(cur);
    cur = addCalendarDays(cur, 1);
    if (out.length > 400) break;
  }
  return out;
}

/** Half-open ranges [in, out) overlap when each start is before the other end. */
export function stayDateRangesOverlap(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  if (!ISO_DATE.test(aIn) || !ISO_DATE.test(aOut) || !ISO_DATE.test(bIn) || !ISO_DATE.test(bOut)) return false;
  return aIn < bOut && bIn < aOut;
}

export function stayRangeFromBooking(booking: {
  booking_date: string | null;
  check_out?: string | null;
  special_requests?: string | null;
}): { checkIn: string; checkOut: string } | null {
  const checkIn = (booking.booking_date ?? '').trim();
  if (!ISO_DATE.test(checkIn)) return null;
  const fromColumn = (booking.check_out ?? '').trim();
  const fromNotes = parseStayCheckOutFromNotes(booking.special_requests);
  const checkOut =
    fromColumn && fromColumn > checkIn
      ? fromColumn
      : fromNotes && fromNotes > checkIn
        ? fromNotes
        : addCalendarDays(checkIn, 1);
  return { checkIn, checkOut };
}

/** Partner closed this night. Occupancy is paid + live holds, not listing_availability.booked. */
export function stayNightIsOperatorBlocked(capacity: number): boolean {
  return !Number.isFinite(capacity) || capacity <= 0;
}
