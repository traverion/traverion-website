import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1617: dashboard schedule load-failure panels', () => {
  it('shows a Retry panel for Upcoming schedule when bookings fail', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierDashboard.tsx'), 'utf8');
    expect(src).toContain('Phase 1617');
    expect(src).toContain('Bookings couldn’t load');
    expect(src).toContain('week-ahead');
    expect(src).not.toMatch(/bookingsLoadFailed \? null/);
    expect(src).toMatch(/bookingsLoadFailed \?[\s\S]*Retry/);
  });
});
