/**
 * Documents checkout inventory lock semantics for concurrent last-spot races.
 * The authoritative lock lives in Postgres assert_checkout_inventory
 * (pg_advisory_xact_lock on listing id) inside claim_pending_checkout_booking.
 */

import { describe, expect, it } from 'vitest';

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

describe('checkout inventory concurrency semantics', () => {
  const listing = '11111111-1111-1111-1111-111111111111';
  const other = '22222222-2222-2222-2222-222222222222';

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
});
