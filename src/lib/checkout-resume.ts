/**
 * Resume checkout / webhook paid promotion must accept pending holds and
 * failed holds that were expired mid-Pay-now (or abandoned), so Stripe money
 * can still confirm the booking.
 */
export function checkoutPaymentStatusCanResume(paymentStatus: string | null | undefined): boolean {
  const pay = String(paymentStatus ?? 'pending')
    .trim()
    .toLowerCase();
  return pay === 'pending' || pay === 'failed';
}

export function stripeWebhookCanMarkPaidFrom(paymentStatus: string | null | undefined): boolean {
  return checkoutPaymentStatusCanResume(paymentStatus);
}
