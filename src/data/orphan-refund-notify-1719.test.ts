import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1719: orphan auto-refund uses checkout_payment_reversed', () => {
  it('helper picks checkout_payment_reversed when ensureCancelled is false', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/_shared/promote-paid-from-checkout.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1719');
    expect(src).toContain("ensureCancelled ? 'booking_cancelled' : 'checkout_payment_reversed'");
    expect(src).toContain('if (!res.ok)');
  });

  it('notify-customer-booking supports checkout_payment_reversed', () => {
    const edge = readFileSync(
      resolve(__dirname, '../../supabase/functions/notify-customer-booking/index.ts'),
      'utf8'
    );
    expect(edge).toContain("'checkout_payment_reversed'");
    expect(edge).toContain('A checkout payment was reversed');
  });
});
