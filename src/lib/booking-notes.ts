/**
 * Checkout stores machine keys in special_requests (option id, stay check-out).
 * Travelers and partners should not see those as notes.
 */
const INTERNAL_NOTE_LINE = /^(booking_option_id|check_out)\s*:/i;

export function guestFacingBookingNotes(raw: string | null | undefined): string {
  return (raw ?? '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !INTERNAL_NOTE_LINE.test(line))
    .join('\n\n')
    .trim();
}
