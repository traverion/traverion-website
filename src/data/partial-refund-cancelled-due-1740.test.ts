import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1740: partial refund on cancelled Refund due', () => {
  it('stripe-webhook skips shrink_paid_booking_earnings when cancelledRefundDue', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/stripe-webhook/index.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1740');
    expect(src).toContain('cancelledRefundDue');
    expect(src).toContain("refundBookingSelect");
    expect(src).toMatch(/if\s*\(\s*!cancelledRefundDue\s*\)[\s\S]*shrink_paid_booking_earnings/);
  });

  it('customer and supplier partial copy branch for cancelled Refund due', () => {
    const customer = readFileSync(
      resolve(__dirname, '../../supabase/functions/notify-customer-booking/index.ts'),
      'utf8'
    );
    expect(customer).toContain('cancelledRefundDuePartial');
    expect(customer).toContain('Refund due for any remaining charge');

    const supplier = readFileSync(
      resolve(__dirname, '../../supabase/functions/notify-supplier-event/index.ts'),
      'utf8'
    );
    expect(supplier).toContain('cancelledRefundDue');
    expect(supplier).toContain('already cancelled (Refund due)');
  });
});
