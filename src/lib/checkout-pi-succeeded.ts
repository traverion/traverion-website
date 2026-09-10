/**
 * Documents when payment_intent.succeeded should resolve a Checkout session
 * and run the same paid-promotion path as checkout.session.completed.
 * Session lookup / promote happen in the Stripe webhook; this is the gate only.
 */
export function paymentIntentSucceededShouldPromote(params: {
  status?: string | null;
  bookingId?: string | null;
}): boolean {
  if (String(params.status ?? '').trim() !== 'succeeded') return false;
  return Boolean(String(params.bookingId ?? '').trim());
}
