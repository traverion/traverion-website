/**
 * Stay checkout concurrency / overlap semantics.
 * Authoritative serialization is Postgres advisory lock on listing id during
 * claim/promote; this certifies the client/edge pre-check that rejects
 * overlapping nights when a live hold or paid stay already occupies them.
 */

import { describe, expect, it } from 'vitest';
import { bookingOccupiesInventory, CHECKOUT_HOLD_MINUTES } from './booking-hold';
import {
  stayCheckoutNightsAlreadyBooked,
  stayDateRangesOverlap,
  stayAvailableForRequestedNights,
} from './stayOccupancy';

/** Mirrors listing-scoped advisory lock used by claim/promote checkout. */
function stayInventoryLockKey(listingId: string): string {
  return `listing:${listingId.trim()}`;
}

function sameStayListingLock(aListingId: string, bListingId: string): boolean {
  return stayInventoryLockKey(aListingId) === stayInventoryLockKey(bListingId);
}

describe('stay checkout concurrency / overlap', () => {
  const listing = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const other = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const now = Date.parse('2026-10-20T12:00:00.000Z');

  it('same listing concurrent stay checkouts share the inventory lock', () => {
    expect(sameStayListingLock(listing, listing)).toBe(true);
    expect(sameStayListingLock(listing, other)).toBe(false);
  });

  it('live pending hold blocks overlapping nights; expired hold does not', () => {
    const liveHold = {
      id: 'hold-live',
      status: 'pending',
      payment_status: 'pending',
      booking_date: '2026-11-10',
      check_out: '2026-11-13',
      hold_expires_at: '2026-10-20T12:45:00.000Z',
    };
    const expiredHold = {
      ...liveHold,
      id: 'hold-expired',
      hold_expires_at: '2026-10-20T11:00:00.000Z',
    };

    expect(CHECKOUT_HOLD_MINUTES).toBe(60);
    expect(bookingOccupiesInventory(liveHold, now)).toBe(true);
    expect(bookingOccupiesInventory(expiredHold, now)).toBe(false);

    expect(stayCheckoutNightsAlreadyBooked([liveHold], '2026-11-11', '2026-11-14', null, now)).toBe(
      true
    );
    expect(stayCheckoutNightsAlreadyBooked([expiredHold], '2026-11-11', '2026-11-14', null, now)).toBe(
      false
    );
    // Back-to-back: check-out morning of hold may be next guest check-in.
    expect(stayCheckoutNightsAlreadyBooked([liveHold], '2026-11-13', '2026-11-15', null, now)).toBe(
      false
    );
  });

  it('authorized Request-to-Book holds block overlapping nights until approval window ends', () => {
    const authorized = {
      id: 'r2b',
      status: 'pending',
      payment_status: 'authorized',
      booking_date: '2026-12-01',
      check_out: '2026-12-04',
      hold_expires_at: '2026-10-21T12:00:00.000Z',
      approval_expires_at: '2026-10-21T12:00:00.000Z',
    };
    expect(bookingOccupiesInventory(authorized, now)).toBe(true);
    expect(stayCheckoutNightsAlreadyBooked([authorized], '2026-12-02', '2026-12-03', null, now)).toBe(
      true
    );

    const expiredAuth = { ...authorized, hold_expires_at: '2026-10-20T11:00:00.000Z' };
    expect(bookingOccupiesInventory(expiredAuth, now)).toBe(false);
    expect(
      stayCheckoutNightsAlreadyBooked([expiredAuth], '2026-12-02', '2026-12-03', null, now)
    ).toBe(false);
  });

  it('second concurrent claim sees nights already booked when first hold is live', () => {
    const firstClaim = {
      id: 'claim-a',
      status: 'pending',
      payment_status: 'pending',
      booking_date: '2026-11-20',
      check_out: '2026-11-22',
      hold_expires_at: '2026-10-20T12:50:00.000Z',
    };
    // Traveler B requests the same nights after A claimed — must be blocked.
    expect(
      stayCheckoutNightsAlreadyBooked([firstClaim], '2026-11-20', '2026-11-22', null, now)
    ).toBe(true);
    // Traveler B resume of own booking excludes self.
    expect(
      stayCheckoutNightsAlreadyBooked([firstClaim], '2026-11-20', '2026-11-22', 'claim-a', now)
    ).toBe(false);
  });

  it('catalog filter and range overlap agree on adjacent vs overlapping stays', () => {
    const occupied = [{ checkIn: '2026-11-01', checkOut: '2026-11-04' }];
    expect(stayDateRangesOverlap('2026-11-01', '2026-11-04', '2026-11-03', '2026-11-06')).toBe(true);
    expect(stayDateRangesOverlap('2026-11-01', '2026-11-04', '2026-11-04', '2026-11-06')).toBe(false);
    expect(stayAvailableForRequestedNights('2026-11-03', '2026-11-06', occupied)).toBe(false);
    expect(stayAvailableForRequestedNights('2026-11-04', '2026-11-06', occupied)).toBe(true);
  });
});
