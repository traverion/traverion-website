import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1763: Bookings and Pickup CSV export gate + audit', () => {
  it('Bookings Export requires canEditBookings and inserts export run', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1763');
    expect(src).toContain('insertSupplierExportRun');
    expect(src).toContain("surface: 'bookings'");
    // Phase 1768: finance may export too via canExportBookingsCsv.
    expect(src).toMatch(/disabled=\{!canExportBookingsCsv \|\| filteredBookings\.length === 0\}/);
  });

  it('Pickup Export requires canEditBookings and inserts export run', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierPickupPlanner.tsx'), 'utf8');
    expect(src).toContain('Phase 1763');
    expect(src).toContain('insertSupplierExportRun');
    expect(src).toContain("surface: 'pickup'");
    // Phase 1768: finance may export too via canExportPickupCsv.
    expect(src).toMatch(/disabled=\{!canExportPickupCsv\}/);
  });
});
