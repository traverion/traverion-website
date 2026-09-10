/**
 * Mirror of src/lib/checkout-paid-amount.ts for Deno edge runtime.
 */
export function checkoutPaidAmountAcceptable(params: {
  amountPaid: number | null | undefined;
  bookingTotalAmount?: number | null;
  quotedTotalMeta?: string | null;
}): boolean {
  const paid = Number(params.amountPaid);
  if (!Number.isFinite(paid) || paid <= 0) return false;

  const meta = Number(String(params.quotedTotalMeta ?? '').trim());
  if (Number.isFinite(meta) && meta > 0) {
    return paid + 0.011 >= meta;
  }

  const fromBooking = Number(params.bookingTotalAmount);
  if (Number.isFinite(fromBooking) && fromBooking > 0) {
    return paid + 0.011 >= fromBooking;
  }

  return true;
}

export function checkoutPaidCurrencyMatches(params: {
  sessionCurrency?: string | null;
  bookingCurrency?: string | null;
}): boolean {
  const session = String(params.sessionCurrency ?? '')
    .trim()
    .toUpperCase();
  const booking = String(params.bookingCurrency ?? '')
    .trim()
    .toUpperCase();
  if (!session || !booking) return true;
  return session === booking;
}
