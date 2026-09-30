import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1742: partner Bookings/Dashboard honor pickup note overrides', () => {
  it('SupplierBookings list + detail use resolvePartnerPickupCopy', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1742');
    expect(src).toContain('resolvePartnerPickupCopy');
    expect(src).toMatch(/rowPickup\s*=\s*resolvePartnerPickupCopy/);
    expect(src).toMatch(/partnerPickup\s*=\s*resolvePartnerPickupCopy/);
  });

  it('SupplierDashboard Today Meet uses resolvePartnerPickupCopy', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierDashboard.tsx'), 'utf8');
    expect(src).toContain('Phase 1742');
    expect(src).toMatch(/Today Meet line[\s\S]*resolvePartnerPickupCopy/);
  });
});
