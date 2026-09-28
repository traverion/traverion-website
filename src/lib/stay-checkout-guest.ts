/** Lead guest name required for tour and stay checkout so the host can operate the booking. */
export function stayCheckoutLeadGuestNameReady(name: string | null | undefined): boolean {
  return (name ?? '').trim().length >= 2;
}

/** Alias — same rule for tours and stays. */
export const bookingLeadGuestNameReady = stayCheckoutLeadGuestNameReady;

/**
 * Pay now resume freezes lead guest to the claimed booking when set.
 * Client customerName may only fill an empty column (first claim edge cases).
 */
export function resumeStayLeadGuestName(params: {
  bodyCustomerName?: string | null;
  bookingGuestName?: string | null;
}): string {
  const fromBooking = String(params.bookingGuestName ?? '').trim();
  if (fromBooking) return fromBooking;
  return String(params.bodyCustomerName ?? '').trim();
}

export const resumeBookingLeadGuestName = resumeStayLeadGuestName;
