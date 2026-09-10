/** Mirror of src/lib/stay-checkout-guest.ts for Deno edge runtime. */
export function stayCheckoutLeadGuestNameReady(name: string | null | undefined): boolean {
  return (name ?? '').trim().length >= 2;
}

/** Prefer client name; on Trips Pay now fall back to the name stored on the booking. */
export function resumeStayLeadGuestName(params: {
  bodyCustomerName?: string | null;
  bookingGuestName?: string | null;
}): string {
  const fromBody = String(params.bodyCustomerName ?? '').trim();
  if (fromBody) return fromBody;
  return String(params.bookingGuestName ?? '').trim();
}
