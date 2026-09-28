import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: host schedule / pickup notify emails must use purchased listing title (Phase 1477),
 * not live listings.title after a partner rename.
 */
describe('updateBookingSchedule notify purchased title (Phase 1477)', () => {
  it('uses displayListingTitleFromPurchase for customer and supplier schedule emails', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'supabase-bookings.ts'), 'utf8');
    expect(src).toMatch(/Phase 1477/);
    expect(src).toMatch(/displayListingTitleFromPurchase\(\s*prior\.purchase_snapshot/);
    const fn = src.slice(src.indexOf('export async function updateBookingSchedule'));
    const notifyBlock = fn.slice(fn.indexOf('if (guestEmail)'), fn.indexOf('if (supplierId)'));
    expect(notifyBlock).toContain('listingTitle');
    expect(notifyBlock).not.toMatch(/lt\?\.title\?\.trim\(\)\s*\)\s*listingTitle\s*=/);
  });
});

/**
 * Layer B: traveler cancel notify emails must use purchased listing title (Phase 1478),
 * not live listings.title after a partner rename.
 */
describe('cancelBookingAsCustomer notify purchased title (Phase 1478)', () => {
  it('uses displayListingTitleFromPurchase for customer and supplier cancel emails', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'supabase-bookings.ts'), 'utf8');
    expect(src).toMatch(/Phase 1478/);
    const fn = src.slice(src.indexOf('export async function cancelBookingAsCustomer'));
    const notifyBlock = fn.slice(
      fn.indexOf('let listingTitle = displayListingTitleFromPurchase'),
      fn.indexOf('const guestEmail =')
    );
    expect(notifyBlock).toContain('bookingMeta.purchase_snapshot');
    expect(notifyBlock).not.toMatch(/listingTitle\s*=\s*listingData\.title/);
    expect(notifyBlock).not.toMatch(/listingTitle:\s*listingData\.title/);
  });
});

/**
 * Layer B: traveler special-request / meeting-details updates must use purchased title (Phase 1480),
 * not live listings.title after a partner rename (1477 schedule / 1478 cancel parity).
 */
describe('updateGuestBookingSpecialRequests notify purchased title (Phase 1480)', () => {
  it('uses displayListingTitleFromPurchase for customer and supplier detail-update emails', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'supabase-bookings.ts'), 'utf8');
    expect(src).toMatch(/Phase 1480/);
    const fn = src.slice(src.indexOf('export async function updateGuestBookingSpecialRequests'));
    const notifyStart = fn.indexOf('Phase 1480');
    const notifyBlock = fn.slice(notifyStart, fn.indexOf('export async function', notifyStart + 1));
    expect(notifyBlock).toMatch(/displayListingTitleFromPurchase\(\s*row\.purchase_snapshot/);
    expect(notifyBlock).not.toMatch(/listingTitle:\s*listingData\.title/);
    expect(notifyBlock).not.toMatch(/listingTitle:\s*listingData\?\.title/);
  });
});
