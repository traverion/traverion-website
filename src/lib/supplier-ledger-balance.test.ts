import { describe, expect, it } from 'vitest';
import { ledgerAdjustmentTotal, ledgerNetTotal, supplierAvailableBalance } from './supplier-ledger-balance';
import { sumCollectedAmount } from './payment-states';

describe('supplier ledger balance', () => {
  const penalty = { kind: 'cancellation_penalty', amount: -20 };
  const earning = { kind: 'booking_earnings', amount: 189 };

  it('keeps a supplier-fault fee as a negative ledger net until an earning posts', () => {
    expect(ledgerNetTotal([penalty])).toBe(-20);
    expect(ledgerAdjustmentTotal([penalty])).toBe(-20);
    expect(supplierAvailableBalance({ collected: 634, ledger: [penalty] })).toBe(614);
  });

  it('offsets a negative fee with a later earning without double-counting collected', () => {
    const ledger = [penalty, earning];
    expect(ledgerNetTotal(ledger)).toBe(169);
    expect(ledgerAdjustmentTotal(ledger)).toBe(-20);
    expect(supplierAvailableBalance({ collected: 823, ledger })).toBe(803);
  });

  it('does not let a refunded stay inflate available collected', () => {
    const collected = sumCollectedAmount([
      { status: 'confirmed', payment_status: 'paid', amount_paid: 189 },
      { status: 'confirmed', payment_status: 'paid', amount_paid: 445 },
      { status: 'confirmed', payment_status: 'refunded', amount_paid: 445 },
      { status: 'cancelled', payment_status: 'paid', amount_paid: 189 },
      { status: 'confirmed', payment_status: 'paid', amount_paid: 189 },
    ]);
    expect(collected).toBe(823);
    expect(collected).not.toBe(1268);
    expect(supplierAvailableBalance({ collected, ledger: [penalty, earning] })).toBe(803);
  });
});
