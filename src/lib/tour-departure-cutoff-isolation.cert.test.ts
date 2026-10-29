import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

describe('Tour per-departure cutoff isolation (cert)', () => {
  it('payment promote uses evaluateDepartureBookingWindow with hold grace — not raw assertDepartureStillBookable', () => {
    const promote = read('supabase/functions/_shared/promote-paid-from-checkout.ts');
    expect(promote).toContain('evaluateDepartureBookingWindow');
    expect(promote).toContain('existingHold: true');
    expect(promote).toContain('lastMinutePolicyFromListingExtras');
    expect(promote).toContain('departureHasConfirmedPaidBooking');
    expect(promote).not.toMatch(/assertDepartureStillBookable\s*\(/);
  });

  it('server quote applies slot-aware effectiveBookingCutoffHours and existingHold', () => {
    const quote = read('supabase/functions/_shared/booking-quote.ts');
    expect(quote).toContain('effectiveBookingCutoffHours({');
    expect(quote).toContain('existingHold: input.existingHold === true');
    expect(quote).toContain('evaluateDepartureBookingWindow');
  });

  it('PDP calendar uses listing-level cutoff fallback and slotOverrides — not selected-option cutoff for all slots', () => {
    const tour = read('src/pages/TourDetails.tsx');
    expect(tour).toContain('cutoffHoursBeforeStart: listingCutoffHours');
    expect(tour).toContain('slotOverrides: tour?.listingExtras?.slotOverrides');
    expect(tour).toContain('evaluateDepartureBookingWindow');
    expect(tour).toContain('bookingClockMs');
  });

  it('shared last-minute module scopes confirmed keys to date|time|option', () => {
    const src = read('src/lib/last-minute-booking.ts');
    const edge = read('supabase/functions/_shared/last-minute-booking.ts');
    expect(src).toContain('confirmedDepartureKey');
    expect(src).toContain('existingHold');
    expect(edge).toContain('existingHold');
    expect(edge).toContain('evaluateDepartureBookingWindow');
  });
});
