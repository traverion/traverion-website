import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1606: stay quote-failure Price unavailable', () => {
  it('booking panel and sticky use Price unavailable instead of em dash', () => {
    const src = readFileSync(resolve(__dirname, 'StayDetails.tsx'), 'utf8');
    expect(src).toContain('Phase 1606');
    expect(src).toMatch(/stayQuote && !stayQuote\.ok \? \(\s*<p[^>]*>Price unavailable<\/p>/);
    expect(src).toMatch(/checkIn && checkOut\s*\?\s*'Price unavailable'/);
    expect(src).toMatch(/stayQuote\.error\?\.trim\(\)\.slice\(0, 72\)/);
  });
});
