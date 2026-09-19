/**
 * Checkout stores machine keys in special_requests (option id, stay check-out, pickup overrides).
 * Travelers and partners should not see those as guest notes.
 */
const INTERNAL_NOTE_LINE = /^(booking_option_id|check_out|meeting_point|pickup_instructions)\s*:/i;

export function guestFacingBookingNotes(raw: string | null | undefined): string {
  return (raw ?? '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !INTERNAL_NOTE_LINE.test(line))
    .join('\n\n')
    .trim();
}

function readKeyedNoteLine(notes: string | null | undefined, key: string): string | null {
  if (!notes) return null;
  const re = new RegExp(`^${key}\\s*:\\s*(.+)$`, 'i');
  for (const raw of notes.split(/\n+/)) {
    const m = raw.trim().match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

/** Per-booking meeting override stored in special_requests (Pickup planner). */
export function parseBookingMeetingPointOverride(notes: string | null | undefined): string | null {
  return readKeyedNoteLine(notes, 'meeting_point');
}

/** Per-booking pickup instructions override stored in special_requests (Pickup planner). */
export function parseBookingPickupInstructionsOverride(notes: string | null | undefined): string | null {
  return readKeyedNoteLine(notes, 'pickup_instructions');
}

/** Upsert machine note lines without wiping guest-facing notes or other keys. */
export function upsertBookingPickupNoteOverrides(
  notes: string | null | undefined,
  meetingPoint: string,
  pickupInstructions: string
): string {
  const lines = (notes ?? '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^(meeting_point|pickup_instructions)\s*:/i.test(l));
  const m = meetingPoint.trim();
  const p = pickupInstructions.trim();
  if (m) lines.push(`meeting_point: ${m}`);
  if (p) lines.push(`pickup_instructions: ${p}`);
  return lines.join('\n');
}
