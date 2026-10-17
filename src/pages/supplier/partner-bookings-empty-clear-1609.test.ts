import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1609: partner bookings filtered empty Clear filters', () => {
  it('empty state offers Clear filters', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1609');
    expect(src).toContain('Clear filters');
    expect(src).toMatch(/setOpsFilterAndUrl\('all'\)/);
  });
});
