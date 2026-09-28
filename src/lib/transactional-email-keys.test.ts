import { describe, expect, it } from 'vitest';
import {
  defaultCustomerEmailIdempotencyKey,
  defaultSupplierEmailIdempotencyKey,
  resolveCustomerEmailIdempotencyKey,
  resolveSupplierEmailIdempotencyKey,
} from '../../supabase/functions/_shared/transactional-idempotency-key.ts';

/** @deprecated Prefer defaultCustomerEmailIdempotencyKey — kept for call-site clarity in older tests. */
export function customerEmailIdempotencyKey(kind: string, bookingId?: string, email?: string): string {
  return defaultCustomerEmailIdempotencyKey(kind, bookingId, email);
}

/** @deprecated Prefer defaultSupplierEmailIdempotencyKey */
export function supplierEmailIdempotencyKey(
  eventType: string,
  supplierId: string,
  bookingId?: string
): string {
  return defaultSupplierEmailIdempotencyKey(eventType, supplierId, bookingId);
}

describe('transactional email idempotency keys', () => {
  it('scopes customer booking emails by kind + booking id', () => {
    expect(customerEmailIdempotencyKey('booking_confirmed_paid', 'b1')).toBe(
      'customer:booking_confirmed_paid:b1'
    );
    expect(customerEmailIdempotencyKey('booking_confirmed_paid', 'b1')).toBe(
      customerEmailIdempotencyKey('booking_confirmed_paid', 'b1')
    );
    expect(customerEmailIdempotencyKey('refund_completed', 'b1')).toBe('customer:refund_completed:b1');
    expect(customerEmailIdempotencyKey('traveler_welcome', undefined, 'a@b.com')).toBe(
      'customer:traveler_welcome:a@b.com'
    );
  });

  it('scopes supplier events by booking when present', () => {
    expect(supplierEmailIdempotencyKey('new_booking', 's1', 'b1')).toBe('supplier:new_booking:b1');
    expect(supplierEmailIdempotencyKey('verification_submitted', 's1')).toBe(
      'supplier:verification_submitted:s1'
    );
  });

  it('Phase 1510: ignores cross-kind client keys that would poison paid/refund slots', () => {
    expect(
      resolveCustomerEmailIdempotencyKey({
        kind: 'your_details_updated',
        bookingId: 'b1',
        clientKey: 'customer:booking_confirmed_paid:b1',
      })
    ).toBe('customer:your_details_updated:b1');

    expect(
      resolveCustomerEmailIdempotencyKey({
        kind: 'booking_cancelled',
        bookingId: 'b1',
        clientKey: 'customer:refund_completed:b1',
      })
    ).toBe('customer:booking_cancelled:b1');

    expect(
      resolveSupplierEmailIdempotencyKey({
        eventType: 'guest_message',
        supplierId: 's1',
        bookingId: 'b1',
        clientKey: 'supplier:new_booking:b1',
      })
    ).toBe('supplier:guest_message:b1');
  });

  it('Phase 1510: allows same-kind suffixes used for field-diff uniqueness', () => {
    expect(
      resolveCustomerEmailIdempotencyKey({
        kind: 'your_details_updated',
        bookingId: 'b1',
        clientKey: 'customer:your_details_updated:b1:pickup-changed',
      })
    ).toBe('customer:your_details_updated:b1:pickup-changed');

    expect(
      resolveCustomerEmailIdempotencyKey({
        kind: 'your_details_updated',
        bookingId: 'b1',
        clientKey: 'customer:your_details_updated:b1',
      })
    ).toBe('customer:your_details_updated:b1');
  });

  it('Phase 1510: empty or prefix-only client keys fall back to canonical default', () => {
    expect(
      resolveCustomerEmailIdempotencyKey({
        kind: 'your_details_updated',
        bookingId: 'b1',
        clientKey: 'customer:your_details_updated:',
      })
    ).toBe('customer:your_details_updated:b1');

    expect(
      resolveCustomerEmailIdempotencyKey({
        kind: 'traveler_welcome',
        email: 'A@B.com',
        clientKey: null,
      })
    ).toBe('customer:traveler_welcome:a@b.com');
  });
});
