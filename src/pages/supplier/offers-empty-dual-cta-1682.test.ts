import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1682: Offers empty uses New listing + Your listings', () => {
  it('pairs create path with listings escape when no listings', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierDiscountsOffers.tsx'), 'utf8');
    expect(src).toContain('Phase 1682');
    expect(src).toContain('PARTNER_CREATE_PATH');
    expect(src).toContain('New listing');
    expect(src).toContain('Your listings');
  });
});
