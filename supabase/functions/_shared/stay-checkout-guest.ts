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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Phase 1541: persist stay check_out + nights on checkout session update
 * (and claim) so Pay-now does not leave snapshot-only rows.
 */
export function stayBookingColumnsForCheckoutUpdate(params: {
  inventoryFamily?: string | null;
  bookingDate?: string | null;
  checkoutDate?: string | null;
  quoteNights?: number | null;
}): { check_out: string; nights: number } | null {
  if (String(params.inventoryFamily ?? '').trim() !== 'stay') return null;
  const checkOut = String(params.checkoutDate ?? '').trim();
  const checkIn = String(params.bookingDate ?? '').trim();
  if (!ISO_DATE.test(checkOut) || !ISO_DATE.test(checkIn) || checkOut <= checkIn) return null;
  const fromQuote = Math.floor(Number(params.quoteNights ?? NaN));
  if (Number.isFinite(fromQuote) && fromQuote >= 1) {
    return { check_out: checkOut, nights: fromQuote };
  }
  const computed = Math.round(
    (Date.parse(`${checkOut}T12:00:00Z`) - Date.parse(`${checkIn}T12:00:00Z`)) / 86400000
  );
  if (!Number.isFinite(computed) || computed < 1) return null;
  return { check_out: checkOut, nights: computed };
}
