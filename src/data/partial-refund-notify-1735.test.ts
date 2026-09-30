import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { remainingPaidMajorFromCharge } from '../lib/stripe-charge-refund';
import { isBookingTiedSupplierEvent } from '../lib/notify-supplier-event-guard';

describe('Phase 1735: partial Stripe refunds update Money and notify both parties', () => {
  it('remainingPaidMajorFromCharge shrinks Collected input', () => {
    expect(remainingPaidMajorFromCharge({ amount: 10000, amount_refunded: 2500 })).toBe(75);
    expect(remainingPaidMajorFromCharge({ amount: 10000, amount_refunded: 0 })).toBe(100);
    expect(remainingPaidMajorFromCharge({ amount: null, amount_refunded: 1 })).toBeNull();
  });

  it('stripe-webhook partial path updates amount_paid and emails both sides', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/stripe-webhook/index.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1735');
    expect(src).toContain('remainingPaidMajorFromCharge');
    expect(src).toContain("emailKind: 'partial_refund_recorded'");
    expect(src).toContain("eventType: 'partial_refund_recorded'");
    expect(src).toContain('customer:partial_refund_recorded:');
    expect(src).toContain('supplier:partial_refund_recorded:');
  });

  it('notify surfaces support partial_refund_recorded', () => {
    expect(isBookingTiedSupplierEvent('partial_refund_recorded')).toBe(true);
    const customer = readFileSync(
      resolve(__dirname, '../../supabase/functions/notify-customer-booking/index.ts'),
      'utf8'
    );
    expect(customer).toContain("'partial_refund_recorded'");
    expect(customer).toContain('A partial refund was recorded');
  });
});
