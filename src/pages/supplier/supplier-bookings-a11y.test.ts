import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Bookings list is a named region. Schedule tabs were replaced by the filter toolbar.
 */
describe('SupplierBookings list region', () => {
  it('names the bookings list for assistive tech', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'SupplierBookings.tsx'),
      'utf8'
    );
    expect(src).toMatch(/id=\{PARTNER_BOOKINGS_LIST_ID\}/);
    expect(src).toMatch(/role="region"/);
    expect(src).toMatch(/aria-label="Bookings"/);
    expect(src).toMatch(/aria-label="Search name, email or booking ID"/);
  });
});
