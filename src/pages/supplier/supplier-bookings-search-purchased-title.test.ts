import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: Partner Bookings search must match purchased listing titles on rows,
 * not live listings.title after a partner rename (Inbox 1481 / notify 1477 parity).
 */
describe('SupplierBookings search purchased title (Phase 1481)', () => {
  it('filters by displayListingTitleFromPurchase, not raw listingMeta title', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const desk = readFileSync(join(here, '../../lib/partner-bookings-desk.ts'), 'utf8');
    const page = readFileSync(join(here, 'SupplierBookings.tsx'), 'utf8');
    expect(desk).toMatch(/Phase 1481/);
    const filterBlock = desk.slice(desk.indexOf('if (!q) return true;'), desk.indexOf('idLower.includes(q)'));
    expect(filterBlock).toMatch(/extras\.title\(b\)/);
    expect(page).toMatch(/displayListingTitleFromPurchase\(\s*b\.purchase_snapshot/);
    expect(page).not.toMatch(/listingMeta\[b\.listing_id\]\?\.title \?\? ''\)\.toLowerCase\(\)/);
  });
});
