import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1651: Pickup planner empty CTAs', () => {
  it('offers Open bookings and Your listings when no bookings', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierPickupPlanner.tsx'), 'utf8');
    expect(src).toContain('Phase 1651');
    expect(src).toMatch(/No bookings yet[\s\S]*Open bookings[\s\S]*Your listings/);
  });
});
