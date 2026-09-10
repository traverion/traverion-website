/**
 * Stripe checkout.session.completed must not confirm a booking for less than the
 * server quote. Overpayment is accepted (amount_paid records what Stripe charged).
 * Missing quote totals (legacy rows) do not block confirmation.
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

/** Session currency must match the booking quote currency when both are present. */
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
