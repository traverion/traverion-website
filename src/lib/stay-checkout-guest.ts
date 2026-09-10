/** Lead guest name required for tour and stay checkout so the host can operate the booking. */
export function stayCheckoutLeadGuestNameReady(name: string | null | undefined): boolean {
  return (name ?? '').trim().length >= 2;
}

/** Alias — same rule for tours and stays. */
export const bookingLeadGuestNameReady = stayCheckoutLeadGuestNameReady;

/** Prefer client name; on Trips Pay now fall back to the name stored on the booking. */
export function resumeStayLeadGuestName(params: {
  bodyCustomerName?: string | null;
  bookingGuestName?: string | null;
}): string {
  const fromBody = String(params.bodyCustomerName ?? '').trim();
  if (fromBody) return fromBody;
  return String(params.bookingGuestName ?? '').trim();
}

export const resumeBookingLeadGuestName = resumeStayLeadGuestName;
