import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPPLIER_REFUND_COMPLETED_NOTIFY_SUB } from '../lib/booking-confirmation-copy';
import { isBookingTiedSupplierEvent } from '../lib/notify-supplier-event-guard';

describe('Phase 1733: host email on Stripe full refund', () => {
  it('stripe-webhook notifies supplier refund_completed after ledger reverse', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/stripe-webhook/index.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1733');
    expect(src).toContain("eventType: 'refund_completed'");
    expect(src).toContain('supplier:refund_completed:');
    expect(src).toContain('notify-supplier-event');
  });

  it('notify-supplier-event supports refund_completed copy', () => {
    const edge = readFileSync(
      resolve(__dirname, '../../supabase/functions/notify-supplier-event/index.ts'),
      'utf8'
    );
    expect(edge).toContain("'refund_completed'");
    expect(edge).toContain(SUPPLIER_REFUND_COMPLETED_NOTIFY_SUB);
    expect(isBookingTiedSupplierEvent('refund_completed')).toBe(true);
  });
});
