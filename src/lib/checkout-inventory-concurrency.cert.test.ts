/**
 * Documents checkout inventory lock semantics for concurrent last-spot races.
 * The authoritative lock lives in Postgres assert_checkout_inventory
 * (pg_advisory_xact_lock on listing id) inside claim_pending_checkout_booking
 * and — Phase 1513 / mig 198 — promote_paid_checkout_booking (assert + paid UPDATE).
 * Phase 1526 / mig 202: stay promote passes stay_booking_check_out (not NULL tour branch).
 */

import { describe, expect, it } from 'vitest';
import { tourCheckoutOccupiedGuests } from './booking-hold';
import { tourDepartureRemainingSeats } from './tour-departure-remaining';
import { promotePaidRequiresAtomicAssertUpdate, promotePaidAssertCheckOut } from './promote-paid-checkout';

/** Mirrors the SQL lock key shape: hashtext(listing_id::text) — listing-scoped. */
export function checkoutInventoryLockKey(listingId: string): string {
  return `listing:${listingId.trim()}`;
}

/**
 * Two travelers fighting the last seat on the same departure must share a lock.
 * Different listings must not share a lock.
 */
export function sameInventoryRace(
  a: { listingId: string; date: string; startTimeHm: string | null },
  b: { listingId: string; date: string; startTimeHm: string | null }
): boolean {
  if (checkoutInventoryLockKey(a.listingId) !== checkoutInventoryLockKey(b.listingId)) {
    return false;
  }
  // Listing-scoped advisory lock serializes all dates/slots for that listing.
  // Same-day same-slot is the dangerous race; different slots still serialize (safe, coarse).
  return true;
}

/**
 * After Traveler A holds the final seat, Traveler B's pre-assert remaining check
 * (create-booking-checkout-session) must see 0 and 409 — mirrors edge capacity gate.
 */
export function lastSeatRemainingAfterHold(params: {
  capacity: number;
  occupiedGuests: number;
  requestingGuests: number;
}): { remaining: number; allowClaim: boolean } {
  const remaining = tourDepartureRemainingSeats({
    slotMaxSpots: params.capacity,
    paidGuestsSlot: params.occupiedGuests,
  });
  return {
    remaining,
    allowClaim: remaining >= params.requestingGuests,
  };
}

describe('checkout inventory concurrency semantics', () => {
  const listing = '11111111-1111-1111-1111-111111111111';
  const other = '22222222-2222-2222-2222-222222222222';
  const now = Date.parse('2026-10-01T12:00:00.000Z');

  it('same listing last-spot attempts share a lock (serialized)', () => {
    expect(
      sameInventoryRace(
        { listingId: listing, date: '2026-10-01', startTimeHm: '08:00' },
        { listingId: listing, date: '2026-10-01', startTimeHm: '08:00' }
      )
    ).toBe(true);
  });

  it('different listings do not share a lock', () => {
    expect(
      sameInventoryRace(
        { listingId: listing, date: '2026-10-01', startTimeHm: '08:00' },
        { listingId: other, date: '2026-10-01', startTimeHm: '08:00' }
      )
    ).toBe(false);
  });

  it('lock key is listing-scoped (multi-departure still serialized per listing)', () => {
    expect(checkoutInventoryLockKey(listing)).toBe(`listing:${listing}`);
    expect(
      sameInventoryRace(
        { listingId: listing, date: '2026-10-01', startTimeHm: '08:00' },
        { listingId: listing, date: '2026-10-01', startTimeHm: '20:00' }
      )
    ).toBe(true);
  });

  it('capacity 1: after A holds 1 seat, B cannot claim the same departure', () => {
    const rows = [
      {
        id: 'aaaa',
        booking_date: '2026-10-01',
        guests: 1,
        status: 'pending',
        payment_status: 'pending',
        hold_expires_at: '2026-10-01T13:00:00.000Z',
        start_time: '09:00:00',
        purchase_snapshot: { startTimeHm: '09:00' },
      },
    ];
    const occupied = tourCheckoutOccupiedGuests(rows, '2026-10-01', null, now, '09:00');
    expect(occupied).toBe(1);
    const forB = lastSeatRemainingAfterHold({
      capacity: 1,
      occupiedGuests: occupied,
      requestingGuests: 1,
    });
    expect(forB.remaining).toBe(0);
    expect(forB.allowClaim).toBe(false);
  });

  it('capacity 1: excluding A own hold still leaves B blocked when counting A', () => {
    // B's checkout excludes only B's booking id — A's hold still occupies.
    const rows = [
      {
        id: 'hold-a',
        booking_date: '2026-10-01',
        guests: 1,
        status: 'pending',
        payment_status: 'pending',
        hold_expires_at: '2026-10-01T13:00:00.000Z',
        start_time: '09:00:00',
        purchase_snapshot: { startTimeHm: '09:00' },
      },
    ];
    const occupiedForB = tourCheckoutOccupiedGuests(rows, '2026-10-01', 'hold-b', now, '09:00');
    expect(occupiedForB).toBe(1);
    expect(
      lastSeatRemainingAfterHold({
        capacity: 1,
        occupiedGuests: occupiedForB,
        requestingGuests: 1,
      }).allowClaim
    ).toBe(false);
  });

  it('capacity N: concurrent requests consuming final N seats — last one fails', () => {
    const capacity = 3;
    const rows = [
      {
        id: 'a',
        booking_date: '2026-10-01',
        guests: 2,
        status: 'pending',
        payment_status: 'pending',
        hold_expires_at: '2026-10-01T13:00:00.000Z',
        start_time: '10:00:00',
        purchase_snapshot: { startTimeHm: '10:00' },
      },
    ];
    const occupied = tourCheckoutOccupiedGuests(rows, '2026-10-01', null, now, '10:00');
    expect(occupied).toBe(2);
    expect(
      lastSeatRemainingAfterHold({ capacity, occupiedGuests: occupied, requestingGuests: 1 }).allowClaim
    ).toBe(true);
    expect(
      lastSeatRemainingAfterHold({ capacity, occupiedGuests: occupied, requestingGuests: 2 }).allowClaim
    ).toBe(false);
  });

  it('Phase 1513/1516: paid promote must assert+update in one transaction', () => {
    // Expired-hold + claim_pending race: separate assert then paid UPDATE oversells.
    expect(promotePaidRequiresAtomicAssertUpdate({ assertAndUpdateSameTransaction: false })).toBe(
      false
    );
    expect(promotePaidRequiresAtomicAssertUpdate({ assertAndUpdateSameTransaction: true })).toBe(
      true
    );
  });

  it('Phase 1526: nights-only stay promote asserts exclusive check-out, not NULL tour branch', () => {
    // Column-only (pre-1526) would pass NULL → tour assert; nights-only stay must use
    // stay_booking_check_out (e.g. 2026-12-01 + 3 nights → 2026-12-04).
    expect(
      promotePaidAssertCheckOut({
        isStayNight: true,
        stayExclusiveCheckOut: '2026-12-04',
        checkOutColumn: null,
        bookingDate: '2026-12-01',
      })
    ).toBe('2026-12-04');
    expect(
      promotePaidAssertCheckOut({
        isStayNight: false,
        checkOutColumn: null,
        bookingDate: '2026-12-01',
      })
    ).toBeNull();
  });
});
