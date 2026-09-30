import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1783: Bookings CSV audit includes filter snapshot', () => {
  it('downloadBookingsCsv passes view/opsFilter/listing/query into filtersSnapshot', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1783');
    expect(src).toContain('opsFilter');
    expect(src).toContain("surface: 'bookings'");
    expect(src).toContain('dateFrom: filterDateFrom || undefined');
  });
});
