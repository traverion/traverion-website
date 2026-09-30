import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1791: await CSV export audit insert', () => {
  it('Money/Bookings/Pickup await insertSupplierExportRun and warn on failure', () => {
    const money = readFileSync(
      resolve(__dirname, 'SupplierEarnings.tsx'),
      'utf8'
    );
    const bookings = readFileSync(
      resolve(__dirname, 'SupplierBookings.tsx'),
      'utf8'
    );
    const pickup = readFileSync(
      resolve(__dirname, 'SupplierPickupPlanner.tsx'),
      'utf8'
    );
    expect(money).toContain('Phase 1791');
    expect(bookings).toContain('Phase 1791');
    expect(pickup).toContain('Phase 1791');
    expect(money).toMatch(/const audited = await insertSupplierExportRun/);
    expect(bookings).toMatch(/return insertSupplierExportRun/);
    expect(pickup).toMatch(/const audited = await insertSupplierExportRun/);
    expect(money).not.toMatch(/void insertSupplierExportRun/);
    expect(bookings).not.toMatch(/void insertSupplierExportRun/);
    expect(pickup).not.toMatch(/void insertSupplierExportRun/);
    expect(money).toContain('audit log failed');
    expect(bookings).toContain('audit log failed');
    expect(pickup).toContain('audit log failed');
  });
});
