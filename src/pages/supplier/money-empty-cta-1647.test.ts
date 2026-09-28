import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1647: Money empty state CTAs', () => {
  it('offers Open bookings and Your listings when no collected revenue', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierEarnings.tsx'), 'utf8');
    expect(src).toContain('Phase 1647');
    expect(src).toMatch(/PARTNER_MONEY_EMPTY_BODY[\s\S]*Open bookings[\s\S]*Your listings/);
  });
});
