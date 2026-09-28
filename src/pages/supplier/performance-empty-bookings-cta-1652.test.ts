import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1652: Performance empty View bookings CTA', () => {
  it('offers View bookings when all-time paid is empty but bookings exist', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierPerformance.tsx'), 'utf8');
    expect(src).toContain('Phase 1652');
    expect(src).toContain('View bookings');
    expect(src).toMatch(/bookings\.length > 0 \?[\s\S]*View bookings/);
  });
});
