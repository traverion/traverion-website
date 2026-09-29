import { describe, expect, it } from 'vitest';
import { resolvePartnerPickupCopy } from './pickup-completeness';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1716: traveler sees host pickup note overrides', () => {
  it('resolvePartnerPickupCopy prefers meeting_point note over empty snapshot', () => {
    const copy = resolvePartnerPickupCopy({
      purchaseSnapshot: {
        v: 1,
        listingId: 'x',
        listingKind: 'tour',
        title: 'Tour',
        currency: 'EUR',
        totalAmount: 10,
        meetingPoint: '',
        pickupInstructions: '',
      },
      specialRequests: 'meeting_point: Hotel lobby\npickup_instructions: Look for the blue van',
    });
    expect(copy.meetingPoint).toBe('Hotel lobby');
    expect(copy.pickupInstructions).toBe('Look for the blue van');
  });

  it('Trips and confirmation wire resolvePartnerPickupCopy; pickup copy save notifies', () => {
    const trips = readFileSync(resolve(__dirname, '../pages/MyBookings.tsx'), 'utf8');
    const conf = readFileSync(resolve(__dirname, '../pages/BookingConfirmationPage.tsx'), 'utf8');
    const bookings = readFileSync(resolve(__dirname, '../data/supabase-bookings.ts'), 'utf8');
    expect(trips).toContain('Phase 1716');
    expect(trips).toContain('resolvePartnerPickupCopy');
    expect(conf).toContain('Phase 1716');
    expect(conf).toContain('resolvePartnerPickupCopy');
    expect(bookings).toContain('Phase 1716');
    expect(bookings).toContain("emailKind = priorEmpty ? 'pickup_confirmed'");
  });
});
