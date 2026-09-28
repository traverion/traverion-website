import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1631: disable Go to checkout when quote failed', () => {
  it('disables the review dock CTA and shows Price unavailable', () => {
    const src = readFileSync(resolve(__dirname, 'BookingPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1631');
    expect(src).toMatch(/disabled=\{quoteFailed\}/);
    expect(src).toMatch(/quoteFailed \? 'Price unavailable' : 'Go to checkout'/);
  });
});
