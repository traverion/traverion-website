import { describe, expect, it } from 'vitest';

/**
 * Conventions for Edge Function idempotency keys (notify-customer-booking / notify-supplier-event).
 * Keep in sync with function default key builders.
 */
export function customerEmailIdempotencyKey(kind: string, bookingId?: string, email?: string): string {
  if (bookingId) return `customer:${kind}:${bookingId}`;
  return `customer:${kind}:${(email ?? '').trim().toLowerCase()}`;
}

export function supplierEmailIdempotencyKey(
  eventType: string,
  supplierId: string,
  bookingId?: string
): string {
  if (bookingId) return `supplier:${eventType}:${bookingId}`;
  return `supplier:${eventType}:${supplierId}`;
}

describe('transactional email idempotency keys', () => {
  it('scopes customer booking emails by kind + booking id', () => {
    expect(customerEmailIdempotencyKey('booking_confirmed_paid', 'b1')).toBe(
      'customer:booking_confirmed_paid:b1'
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
});
