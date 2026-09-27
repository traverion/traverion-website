/**
 * Phase 1129: unpaid-checkout cancel copy from payment_status (Deno mirror).
 * Keep in sync with src/lib/notify-unpaid-checkout.ts + payment-states.
 */

function normalizePaymentStatus(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

function isPaidPaymentStatus(raw: string | null | undefined): boolean {
  const pay = normalizePaymentStatus(raw);
  return pay === 'paid' || pay === 'complete' || pay === 'succeeded';
}

function bookingPaymentWasCollected(raw: string | null | undefined): boolean {
  const pay = normalizePaymentStatus(raw);
  return isPaidPaymentStatus(pay) || pay === 'refunded';
}

export function notifyUnpaidCheckoutFromPaymentStatus(
  paymentStatus: string | null | undefined
): boolean {
  return !bookingPaymentWasCollected(paymentStatus);
}
