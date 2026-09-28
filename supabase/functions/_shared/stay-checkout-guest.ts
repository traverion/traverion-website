/** Mirror of src/lib/stay-checkout-guest.ts for Deno edge runtime. */
export function stayCheckoutLeadGuestNameReady(name: string | null | undefined): boolean {
  return (name ?? '').trim().length >= 2;
}

/** Alias — same rule for tours and stays. */
export const bookingLeadGuestNameReady = stayCheckoutLeadGuestNameReady;

/**
 * Mirror of src/lib/stay-checkout-guest.ts — freeze lead guest to booking on resume.
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
