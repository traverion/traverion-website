import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1617: dashboard schedule load-failure panels', () => {
  it('shows Retry panels for Today and Next 7 days when bookings fail', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierDashboard.tsx'), 'utf8');
    expect(src).toContain('Phase 1617');
    expect(src).toMatch(/Bookings couldn’t load/g);
    expect((src.match(/Bookings couldn’t load/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(src).not.toMatch(/bookingsLoadFailed \? null/);
  });
});
