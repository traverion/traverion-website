/**
 * Canonical labels. Payment, booking, and cancellation are separate domains.
 * Do not mix “Confirmed” with “Paid” unless both are true.
 */

export type BookingLifecycle = 'pending_payment' | 'confirmed' | 'cancelled' | 'completed';

export function bookingLifecycleLabel(status: string | null | undefined, paymentStatus?: string | null): string {
  const st = (status ?? '').trim().toLowerCase();
  const pay = (paymentStatus ?? '').trim().toLowerCase();
  if (st === 'cancelled') return 'Cancelled';
  if (pay === 'refunded') return 'Cancelled';
  if (st === 'confirmed' && (pay === 'paid' || pay === 'complete' || pay === 'succeeded')) return 'Confirmed';
  if (pay === 'failed') return 'Payment failed';
  // Match travelerPaymentLabel so Trips does not show two near-duplicate chips.
  if (st === 'pending' || pay === 'pending') return 'Payment pending';
  if (st === 'confirmed') return 'Confirmed';
  return 'Payment pending';
}

export function cancellationRequestLabel(status: string | null | undefined): string {
  const s = (status ?? '').trim().toLowerCase();
  if (s === 'requested') return 'Awaiting response';
  if (s === 'accepted') return 'Accepted';
  if (s === 'declined') return 'Declined';
  if (s === 'expired') return 'Review window passed';
  if (s === 'resolved') return 'Resolved';
  return 'None';
}
