import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1768: Bookings/Pickup CSV allow finance exporters', () => {
  it('Bookings Export allows canManageFinance', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1768');
    expect(src).toContain('canManageFinance');
    expect(src).toContain('canExportBookingsCsv');
    expect(src).toContain('disabled={!canExportBookingsCsv || filteredBookings.length === 0}');
  });

  it('Pickup Export allows canManageFinance', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierPickupPlanner.tsx'), 'utf8');
    expect(src).toContain('Phase 1768');
    expect(src).toContain('canExportPickupCsv');
    expect(src).toContain('disabled={!canExportPickupCsv}');
  });
});
