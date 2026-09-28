import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: Pickup / Bookings listing filters must label like rows (purchased title),
 * not live listings.title after a partner rename (Bookings search 1481 parity).
 */
describe('Partner listing filter purchased title (Phase 1483)', () => {
  it('Pickup listing select uses partnerListingFilterLabelFromBookings', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'SupplierPickupPlanner.tsx'), 'utf8');
    expect(src).toMatch(/partnerListingFilterLabelFromBookings/);
  });

  it('Bookings listing select uses partnerListingFilterLabelFromBookings', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'SupplierBookings.tsx'), 'utf8');
    expect(src).toMatch(/partnerListingFilterLabelFromBookings/);
  });
});
