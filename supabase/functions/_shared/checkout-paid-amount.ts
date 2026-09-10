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

  const fromBooking = Number(params.bookingTotalAmount);
  if (Number.isFinite(fromBooking) && fromBooking > 0) {
    return paid + 0.011 >= fromBooking;
  }

  const meta = Number(String(params.quotedTotalMeta ?? '').trim());
  if (Number.isFinite(meta) && meta > 0) {
    return paid + 0.011 >= meta;
  }

  return true;
}
