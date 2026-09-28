/**
 * Mirror of src/lib/booking-notes.ts for Deno edge (checkout claim sanitization).
 * Phase 1522: strip client-planted machine keys before checkout hold insert.
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

export function sanitizeCheckoutGuestPhone(raw: string | null | undefined): string {
  return guestFacingBookingNotes(raw)
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function buildCheckoutClaimSpecialRequests(params: {
  customerPhone?: string | null;
  specialRequests?: string | null;
  optionId?: string | null;
  checkOutDate?: string | null;
}): string | null {
  const phone = sanitizeCheckoutGuestPhone(params.customerPhone);
  const guestNotes = guestFacingBookingNotes(params.specialRequests);
  const optionId = (params.optionId ?? '').trim();
  const checkOut = (params.checkOutDate ?? '').trim();
  const parts = [
    phone ? `Guest phone: ${phone}` : '',
    guestNotes,
    optionId ? `booking_option_id: ${optionId}` : '',
    /^\d{4}-\d{2}-\d{2}$/.test(checkOut) ? `check_out: ${checkOut}` : '',
  ].filter(Boolean);
  const joined = parts.join('\n\n').trim();
  return joined.length > 0 ? joined : null;
}
