import { describe, expect, it } from 'vitest';
import {
  countUpcomingPaidTripsForListing,
  countBookingsForListing,
  deleteListingBlockedByBookingsNotice,
  partnerListingUpcomingPaidCheckPending,
  unpublishUpcomingBookingsCheckFailedNotice,
  unpublishUpcomingBookingsNotice,
} from './listing-unpublish-impact';

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
    expect(unpublishUpcomingBookingsCheckFailedNotice()).toMatch(/could not load/i);
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

  it('blocks confirm while upcoming-paid check is in flight (Phase 1490)', () => {
    expect(
      partnerListingUpcomingPaidCheckPending({ requiresCheck: true, count: null, checkFailed: false })
    ).toBe(true);
    expect(
      partnerListingUpcomingPaidCheckPending({ requiresCheck: true, count: 0, checkFailed: false })
    ).toBe(false);
    expect(
      partnerListingUpcomingPaidCheckPending({ requiresCheck: true, count: null, checkFailed: true })
    ).toBe(false);
    expect(
      partnerListingUpcomingPaidCheckPending({ requiresCheck: false, count: null, checkFailed: false })
    ).toBe(false);
  });

  it('Phase 1734: any booking count blocks hard delete', () => {
    expect(
      countBookingsForListing(
        [
          { listing_id: 'a' },
          { listing_id: 'a' },
          { listing_id: 'b' },
        ],
        'a'
      )
    ).toBe(2);
    expect(deleteListingBlockedByBookingsNotice(0)).toBeNull();
    expect(deleteListingBlockedByBookingsNotice(1)?.toLowerCase()).toContain('take the listing offline');
    expect(deleteListingBlockedByBookingsNotice(2)?.toLowerCase()).toContain('2 bookings');
  });
});
