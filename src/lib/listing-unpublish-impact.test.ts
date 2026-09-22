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
});
