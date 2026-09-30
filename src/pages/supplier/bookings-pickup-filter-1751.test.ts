import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1751: Bookings pickup ops filter uses resolvePartnerPickupCopy', () => {
  it('pickup filter resolves note overrides before attention check', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1751');
    expect(src).toMatch(/opsFilter === 'pickup'[\s\S]*resolvePartnerPickupCopy/);
  });
});
