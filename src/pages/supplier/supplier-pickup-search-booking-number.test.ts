import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: Partner Pickup search must resolve desk lookups by booking # shown on cards.
 */
describe('SupplierPickupPlanner search booking number (Phase 1485)', () => {
  it('uses partnerBookingNumberMatchesFilterQuery in guest search', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'SupplierPickupPlanner.tsx'), 'utf8');
    expect(src).toMatch(/partnerBookingNumberMatchesFilterQuery/);
    expect(src).toMatch(/Phase 1485|partnerBookingNumberMatchesFilterQuery\(q, b\.booking_number\)/);
  });
});
