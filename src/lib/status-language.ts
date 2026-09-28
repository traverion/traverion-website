/**
 * Canonical labels. Payment, booking, and cancellation are separate domains.
 * Do not mix “Confirmed” with “Paid” unless both are true.
 */

import { partnerUnpaidCheckoutHoldsInventory } from './booking-hold';

export type BookingLifecycle = 'pending_payment' | 'confirmed' | 'cancelled' | 'completed';

export function bookingLifecycleLabel(
  status: string | null | undefined,
  paymentStatus?: string | null,
  hold?: { hold_expires_at?: string | null; created_at?: string | null } | null
): string {
  const st = (status ?? '').trim().toLowerCase();
  const pay = (paymentStatus ?? '').trim().toLowerCase();
  if (st === 'cancelled') return 'Cancelled';
  if (pay === 'refunded') return 'Cancelled';
  if (st === 'confirmed' && (pay === 'paid' || pay === 'complete' || pay === 'succeeded')) return 'Confirmed';
  if (pay === 'failed') return 'Payment failed';
  // Phase 1312: match travelerPaymentLabel — expired holds are not “Payment pending”.
  if (st === 'pending' || pay === 'pending') {
    if (
      pay === 'pending' &&
      hold &&
      !partnerUnpaidCheckoutHoldsInventory({
        status,
        payment_status: paymentStatus,
        hold_expires_at: hold.hold_expires_at,
        created_at: hold.created_at,
      })
    ) {
      return 'Hold expired';
    }
    return 'Payment pending';
  }
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
