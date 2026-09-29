import { describe, expect, it } from 'vitest';
import { isCollectedBooking, sumCollectedAmount } from '../lib/payment-states';
import { supplierAvailableBalance } from '../lib/supplier-ledger-balance';

describe('Phase 1725: Money Collected keeps late no_refund cancels', () => {
  it('Available still includes amount_paid after cancelled+paid+no_refund', () => {
    const rows = [
      { status: 'confirmed', payment_status: 'paid', amount_paid: 200, currency: 'EUR' },
      {
        status: 'cancelled',
        payment_status: 'paid',
        amount_paid: 150,
        currency: 'EUR',
        refund_choice: 'no_refund',
      },
      {
        status: 'cancelled',
        payment_status: 'paid',
        amount_paid: 80,
        currency: 'EUR',
        refund_choice: 'full_refund',
      },
    ];
    expect(isCollectedBooking(rows[1]!)).toBe(true);
    expect(isCollectedBooking(rows[2]!)).toBe(false);
    const collected = sumCollectedAmount(rows);
    expect(collected).toBe(350);
    // booking_earnings mirrors Collected; excluded from adjustments — Available must still show 350.
    expect(
      supplierAvailableBalance({
        collected,
        ledger: [
          { kind: 'booking_earnings', amount: 200 },
          { kind: 'booking_earnings', amount: 150 },
          { kind: 'booking_earnings', amount: 80 },
          { kind: 'refund', amount: -80 },
        ],
      })
    ).toBe(350);
  });
});
