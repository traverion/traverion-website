import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1673: Performance empty offers Your listings', () => {
  it('escapes to listings when all-time paid is empty with zero bookings', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierPerformance.tsx'), 'utf8');
    expect(src).toContain('Phase 1673');
    expect(src).toContain('Your listings');
    expect(src).toMatch(/listings\.length === 0[\s\S]*Your listings/);
  });
});
