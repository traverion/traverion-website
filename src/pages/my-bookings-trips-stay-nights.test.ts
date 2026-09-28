import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nightsOccupiedByStay, stayRangeFromBooking } from '../lib/stayOccupancy';

const here = dirname(fileURLToPath(import.meta.url));

describe('Trips stay nights from purchased range (Phase 1551)', () => {
  const src = readFileSync(join(here, 'MyBookings.tsx'), 'utf8');

  it('derives night suffix from stayRangeFromBooking, not b.nights column', () => {
    expect(src).toContain('Phase 1551');
    expect(src).toContain('stayNightsSuffix');
    expect(src).toContain('nightsOccupiedByStay');
    expect(src).not.toMatch(
      /formatBookingParticipantsLabel\(b\)\s*\n\s*\{b\.nights \?/
    );
  });

  it('snapshot-only stay yields occupied night count for display', () => {
    const stay = stayRangeFromBooking({
      booking_date: '2026-09-10',
      purchase_snapshot: { checkOut: '2026-09-14' },
    });
    expect(stay).not.toBeNull();
    expect(nightsOccupiedByStay(stay!.checkIn, stay!.checkOut).length).toBe(4);
  });
});

describe('Confirmation paid breakdown nights (Phase 1551)', () => {
  const src = readFileSync(join(here, 'BookingConfirmationPage.tsx'), 'utf8');

  it('uses stayNights from range for × nightly line', () => {
    expect(src).toMatch(/stayNights != null && stayNights >= 1 && booking\.nightly_amount/);
    expect(src).not.toMatch(/stayCheckOut && booking\.nights && booking\.nightly_amount/);
  });
});
