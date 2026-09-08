import { parseStayCheckOutFromNotes } from './stayOccupancy';

/** Listing-level pickup copy is incomplete when meeting + pickup notes are too thin to operate. */
export function listingPickupCopyIncomplete(meetingPoint: string | null | undefined, pickupInstructions: string | null | undefined): boolean {
  const m = (meetingPoint ?? '').trim();
  const p = (pickupInstructions ?? '').trim();
  return m.length + p.length < 20;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Stay nights are check-in/out, not tour pickup. */
export function bookingIsStayNight(b: {
  check_out?: string | null;
  special_requests?: string | null;
}): boolean {
  const col = (b.check_out ?? '').trim();
  if (ISO_DATE.test(col)) return true;
  return Boolean(parseStayCheckOutFromNotes(b.special_requests));
}

/** Incomplete pickup copy only matters for tour departures. */
export function bookingNeedsPickupCopy(
  b: { check_out?: string | null; special_requests?: string | null },
  meetingPoint: string | null | undefined,
  pickupInstructions: string | null | undefined
): boolean {
  if (bookingIsStayNight(b)) return false;
  return listingPickupCopyIncomplete(meetingPoint, pickupInstructions);
}
