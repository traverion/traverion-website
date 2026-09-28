import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: Partner Inbox search must match purchased listing titles and booking # on rows
 * (Bookings 1481/1484 / Pickup 1485 parity).
 */
describe('SupplierInbox search (Phase 1487)', () => {
  it('filters visible threads by purchased title and booking number', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'SupplierInbox.tsx'),
      'utf8'
    );
    expect(src).toMatch(/Phase 1487/);
    expect(src).toMatch(/partnerBookingNumberMatchesFilterQuery\(qRaw, b\.booking_number\)/);
    const filterBlock = src.slice(src.indexOf('Phase 1487'), src.indexOf('if (!unreadOnly) return rows'));
    expect(filterBlock).toMatch(/displayListingTitleFromPurchase\(\s*b\.purchase_snapshot/);
  });
});
