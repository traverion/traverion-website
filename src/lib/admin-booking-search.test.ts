import { describe, expect, it } from 'vitest';
import { adminBookingSearchOrParts, sanitizeAdminBookingSearch } from './admin-booking-search';

describe('adminBookingSearchOrParts (Phase 1053)', () => {
  it('matches guest fields and booking number', () => {
    const parts = adminBookingSearchOrParts('42');
    expect(parts).toContain('guest_name.ilike.%42%');
    expect(parts).toContain('guest_email.ilike.%42%');
    expect(parts).toContain('booking_number.eq.42');
  });

  it('matches booking UUID exactly', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const parts = adminBookingSearchOrParts(id);
    expect(parts).toContain(`id.eq.${id}`);
  });

  it('matches Stripe checkout session and payment intent exactly', () => {
    expect(adminBookingSearchOrParts('cs_test_abc123XYZ')).toContain(
      'checkout_session_id.eq.cs_test_abc123XYZ'
    );
    expect(adminBookingSearchOrParts('pi_3AbcDef')).toContain('payment_intent_id.eq.pi_3AbcDef');
  });

  it('sanitizes PostgREST-hostile characters and caps length', () => {
    expect(sanitizeAdminBookingSearch('a,b(c)%d')).toBe('abcd');
    expect(sanitizeAdminBookingSearch('x'.repeat(200)).length).toBe(128);
  });
});
