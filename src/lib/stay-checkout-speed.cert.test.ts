import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Stay checkout initiation speed', () => {
  it('does not await occupancy re-fetch or self-book query before opening Stripe', () => {
    const src = readFileSync(resolve(__dirname, '../pages/StayDetails.tsx'), 'utf8');
    const fn = src.slice(src.indexOf('const startStayCheckout = async'));
    // Must not block on a second occupancy network round-trip.
    expect(fn).not.toMatch(
      /await Promise\.all\(\[\s*fetchPublishedStayOccupiedRanges/
    );
    // Must use prefetched self-book state, not a second team membership query.
    expect(fn).not.toContain('await viewerIsListingSupplierSide');
    expect(fn).toContain('selfBookBlocked');
    expect(fn).toContain('setPaying(true)');
    expect(fn.indexOf('setPaying(true)')).toBeLessThan(fn.indexOf('createBookingCheckoutSession'));
    expect(fn).toContain('createCheckoutTiming');
    expect(fn).toContain('logCheckoutInitiationTiming');
  });

  it('edge function parallelizes auth/body, expire+discounts, and stay occupancy fetches', () => {
    const edge = readFileSync(
      resolve(__dirname, '../../supabase/functions/create-booking-checkout-session/index.ts'),
      'utf8'
    );
    expect(edge).toContain('createCheckoutTiming');
    expect(edge).toContain('authedClient.auth.getUser()');
    expect(edge).toContain('req.json()');
    expect(edge).toMatch(/Promise\.all\(\[\s*authedClient\.auth\.getUser/);
    expect(edge).toContain("admin.rpc('expire_stale_checkout_holds'");
    expect(edge).toContain('listing_discounts');
    expect(edge).toMatch(/Promise\.all\(\[\s*admin\.rpc\('expire_stale_checkout_holds'/);
    expect(edge).toContain('stayOccupancyMs');
    expect(edge).toContain('timings');
  });
});
