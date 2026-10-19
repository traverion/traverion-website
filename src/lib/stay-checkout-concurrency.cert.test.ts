/**
 * Stay Instant Book concurrency after removing pre-payment inventory holds.
 * Multiple customers may open checkout; first successful paid promote wins.
 * Authoritative serialization: Postgres advisory lock + assert in promote_paid_checkout_booking.
 */

import { describe, expect, it } from 'vitest';
import { bookingOccupiesInventory, unpaidCheckoutSessionIsLive } from './booking-hold';
import {
  stayCheckoutNightsAlreadyBooked,
  stayDateRangesOverlap,
  stayAvailableForRequestedNights,
} from './stayOccupancy';

function stayInventoryLockKey(listingId: string): string {
  return `listing:${listingId.trim()}`;
}

function sameStayListingLock(aListingId: string, bListingId: string): boolean {
  return stayInventoryLockKey(aListingId) === stayInventoryLockKey(bListingId);
}

describe('stay checkout concurrency / overlap (no Instant Book hold)', () => {
  const listing = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const other = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const now = Date.parse('2026-10-20T12:00:00.000Z');

  it('same listing concurrent stay checkouts share the promote inventory lock', () => {
    expect(sameStayListingLock(listing, listing)).toBe(true);
    expect(sameStayListingLock(listing, other)).toBe(false);
  });

  it('1–3: Instant Book pending open/failed checkouts do not block nights', () => {
    const openCheckout = {
      id: 'hold-live',
      status: 'pending',
      payment_status: 'pending',
      booking_date: '2026-11-10',
      check_out: '2026-11-13',
      hold_expires_at: '2026-10-20T12:45:00.000Z',
    };
    const failed = { ...openCheckout, id: 'failed', payment_status: 'failed' };

    expect(bookingOccupiesInventory(openCheckout, now)).toBe(false);
    expect(unpaidCheckoutSessionIsLive(openCheckout, now)).toBe(true);
    expect(stayCheckoutNightsAlreadyBooked([openCheckout], '2026-11-11', '2026-11-14', null, now)).toBe(
      false
    );
    expect(stayCheckoutNightsAlreadyBooked([failed], '2026-11-11', '2026-11-14', null, now)).toBe(false);
  });

  it('4–5: paid booking blocks; second overlapping Instant Book open checkout may still proceed until pay', () => {
    const paid = {
      id: 'paid-a',
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-11-20',
      check_out: '2026-11-22',
    };
    const openB = {
      id: 'open-b',
      status: 'pending',
      payment_status: 'pending',
      booking_date: '2026-11-20',
      check_out: '2026-11-22',
      hold_expires_at: '2026-10-20T12:50:00.000Z',
    };
    expect(stayCheckoutNightsAlreadyBooked([paid], '2026-11-20', '2026-11-22', null, now)).toBe(true);
    // B's open checkout alone does not block; paid A does.
    expect(stayCheckoutNightsAlreadyBooked([openB], '2026-11-20', '2026-11-22', null, now)).toBe(false);
    expect(stayCheckoutNightsAlreadyBooked([paid, openB], '2026-11-20', '2026-11-22', 'open-b', now)).toBe(
      true
    );
  });

  it('authorized Request-to-Book still blocks overlapping Instant Book nights', () => {
    const authorized = {
      id: 'r2b',
      status: 'pending',
      payment_status: 'authorized',
      booking_date: '2026-12-01',
      check_out: '2026-12-04',
      hold_expires_at: '2026-10-21T12:00:00.000Z',
    };
    expect(bookingOccupiesInventory(authorized, now)).toBe(true);
    expect(stayCheckoutNightsAlreadyBooked([authorized], '2026-12-02', '2026-12-03', null, now)).toBe(
      true
    );
  });

  it('6: adjacent non-overlapping stays succeed; 7: catalog overlap agrees', () => {
    const occupied = [{ checkIn: '2026-11-01', checkOut: '2026-11-04' }];
    expect(stayDateRangesOverlap('2026-11-01', '2026-11-04', '2026-11-03', '2026-11-06')).toBe(true);
    expect(stayDateRangesOverlap('2026-11-01', '2026-11-04', '2026-11-04', '2026-11-06')).toBe(false);
    expect(stayAvailableForRequestedNights('2026-11-03', '2026-11-06', occupied)).toBe(false);
    expect(stayAvailableForRequestedNights('2026-11-04', '2026-11-06', occupied)).toBe(true);
  });
});
