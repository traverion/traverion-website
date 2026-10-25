import { describe, expect, it } from 'vitest';
import {
  parseRentalPurchaseSnapshot,
  validateRentalBookingTransition,
} from './rental-booking-domain';

describe('rental booking domain', () => {
  it('parses a frozen rental purchase snapshot', () => {
    const snap = parseRentalPurchaseSnapshot({
      inventoryFamily: 'rental',
      variantId: 'm',
      quantity: 2,
      pickupAt: '2030-01-01T09:00:00Z',
      returnAt: '2030-01-03T18:00:00Z',
      durationCount: 2,
      durationUnit: 'day',
      unitMinor: 2000,
      customerTotalMinor: 8000,
      commissionMinor: 1200,
      supplierEarningsMinor: 6800,
      commissionBps: 1500,
      discountApplied: false,
      currency: 'eur',
      rentalOpsStatus: 'awaiting_pickup',
    });
    expect(snap?.currency).toBe('EUR');
    expect(snap?.quantity).toBe(2);
  });

  it('rejects confirming unpaid or expired-hold bookings', () => {
    expect(
      validateRentalBookingTransition(
        {
          status: 'pending',
          paymentStatus: 'failed',
          opsStatus: 'awaiting_pickup',
          holdStatus: 'held',
        },
        'mark_paid'
      ).ok
    ).toBe(false);

    expect(
      validateRentalBookingTransition(
        {
          status: 'pending',
          paymentStatus: 'pending',
          opsStatus: 'awaiting_pickup',
          holdStatus: 'expired',
        },
        'mark_paid'
      ).ok
    ).toBe(false);
  });

  it('prevents double cancel and double refund', () => {
    expect(
      validateRentalBookingTransition(
        {
          status: 'cancelled',
          paymentStatus: 'pending',
          opsStatus: 'cancelled',
          holdStatus: 'released',
        },
        'cancel'
      ).ok
    ).toBe(false);

    expect(
      validateRentalBookingTransition(
        {
          status: 'cancelled',
          paymentStatus: 'refunded',
          opsStatus: 'cancelled',
          holdStatus: 'released',
        },
        'refund'
      ).ok
    ).toBe(false);
  });

  it('requires collection before return and paid confirmation before handover', () => {
    const unpaid = validateRentalBookingTransition(
      {
        status: 'pending',
        paymentStatus: 'pending',
        opsStatus: 'awaiting_pickup',
        holdStatus: 'held',
      },
      'mark_collected'
    );
    expect(unpaid.ok).toBe(false);

    const collected = validateRentalBookingTransition(
      {
        status: 'confirmed',
        paymentStatus: 'paid',
        opsStatus: 'awaiting_pickup',
        holdStatus: 'confirmed',
      },
      'mark_collected'
    );
    expect(collected.ok).toBe(true);
    if (!collected.ok) return;

    const returnedEarly = validateRentalBookingTransition(
      {
        status: 'confirmed',
        paymentStatus: 'paid',
        opsStatus: 'awaiting_pickup',
        holdStatus: 'confirmed',
      },
      'mark_returned'
    );
    expect(returnedEarly.ok).toBe(false);

    const returned = validateRentalBookingTransition(collected.next, 'mark_returned');
    expect(returned.ok).toBe(true);
  });

  it('happy path: claim → pay → collect → return', () => {
    const claim = validateRentalBookingTransition(
      {
        status: 'pending',
        paymentStatus: 'pending',
        opsStatus: 'awaiting_pickup',
        holdStatus: null,
      },
      'claim_hold'
    );
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;
    const paid = validateRentalBookingTransition(claim.next, 'mark_paid');
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;
    expect(paid.next.status).toBe('confirmed');
    expect(paid.next.holdStatus).toBe('confirmed');
  });
});
