import { describe, expect, it } from 'vitest';
import { countUpcomingPaidTripsForListing, unpublishUpcomingBookingsNotice } from './listing-unpublish-impact';

describe('listing-unpublish-impact', () => {
  const today = '2026-09-22';

  it('counts only upcoming paid trips for the listing', () => {
    const n = countUpcomingPaidTripsForListing(
      [
        {
          listing_id: 'a',
          booking_date: '2026-10-01',
          status: 'confirmed',
          payment_status: 'paid',
        },
        {
          listing_id: 'a',
          booking_date: '2026-09-01',
          status: 'confirmed',
          payment_status: 'paid',
        },
        {
          listing_id: 'a',
          booking_date: '2026-10-02',
          status: 'pending',
          payment_status: 'pending',
        },
        {
          listing_id: 'b',
          booking_date: '2026-10-01',
          status: 'confirmed',
          payment_status: 'paid',
        },
      ],
      'a',
      today
    );
    expect(n).toBe(1);
    expect(unpublishUpcomingBookingsNotice(1)).toMatch(/1 upcoming paid booking/);
    expect(unpublishUpcomingBookingsNotice(0)).toBeNull();
  });

  it('uses experience-local today per booking when todayIso omitted (Phase 1079)', () => {
    // 22:00 UTC Sep 27 = Sep 28 in Helsinki — Sep 27 tour is past there.
    const nowMs = Date.UTC(2026, 8, 27, 22, 0, 0);
    const n = countUpcomingPaidTripsForListing(
      [
        {
          listing_id: 'a',
          booking_date: '2026-09-27',
          status: 'confirmed',
          payment_status: 'paid',
          purchase_snapshot: { listingTitle: 'Tour', departureTimezone: 'Europe/Helsinki' },
        },
        {
          listing_id: 'a',
          booking_date: '2026-09-28',
          status: 'confirmed',
          payment_status: 'paid',
          purchase_snapshot: { listingTitle: 'Tour', departureTimezone: 'Europe/Helsinki' },
        },
      ],
      'a',
      undefined,
      nowMs
    );
    expect(n).toBe(1);
  });
});
