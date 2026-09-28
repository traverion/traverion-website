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
