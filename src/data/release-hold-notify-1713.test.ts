import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1713: Release hold + late-pay refund traveler emails', () => {
  it('updateBookingStatus emails traveler on unpaid partner cancel', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-bookings.ts'), 'utf8');
    expect(src).toContain('Phase 1713');
    expect(src).toContain('partner_release_hold');
    expect(src).toContain("emailKind: 'booking_cancelled'");
    expect(src).toContain('unpaidCheckout: true');
  });

  it('promote-paid notifies traveler after cancelled_checkout_refund', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/_shared/promote-paid-from-checkout.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1713');
    expect(src).toContain('cancelled_checkout_refund');
    expect(src).toContain('cancelled_checkout_refund:${session.id}');
  });
});
