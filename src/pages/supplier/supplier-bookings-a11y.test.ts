import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer C: Partner Bookings schedule tabs (Today/Tomorrow/…) wire to a tabpanel
 * (MyBookings Trips tabpanel parity).
 */
describe('SupplierBookings schedule tabpanel', () => {
  it('connects schedule tabs to the bookings list tabpanel', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'SupplierBookings.tsx'),
      'utf8'
    );
    expect(src).toMatch(/aria-controls=\{PARTNER_BOOKINGS_TABPANEL_ID\}/);
    expect(src).toMatch(/id=\{PARTNER_BOOKINGS_TABPANEL_ID\}/);
    expect(src).toMatch(/role="tabpanel"/);
    expect(src).toMatch(/aria-labelledby=\{partnerBookingsTabId\(view\)\}/);
  });
});
