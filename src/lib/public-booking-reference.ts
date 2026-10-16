/** Customer-facing booking code. Not the sequential booking_number. */
const PUBLIC_REFERENCE = /^TV-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

export function travelerPublicBookingReference(raw: string | null | undefined): string | null {
  const code = (raw ?? '').trim().toUpperCase();
  return PUBLIC_REFERENCE.test(code) ? code : null;
}
