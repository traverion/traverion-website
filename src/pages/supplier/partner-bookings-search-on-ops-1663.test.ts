import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1663: Partner Bookings Search · on includes ops chips', () => {
  it('treats opsFilter !== all like other active filters', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1663');
    expect(src).toContain("opsFilter !== 'all'");
    expect(src).toMatch(/Search\{[^}]*opsFilter !== 'all'[^}]*\}/);
  });
});
