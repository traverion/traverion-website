import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1828: traveler review compose polish', () => {
  it('defines tv-review-compose', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).toContain('Phase 1828');
    expect(css).toContain('.tv-review-compose');
  });

  it('Tour and Stay review forms use compose panel', () => {
    const tour = readFileSync(resolve(__dirname, '../pages/TourDetails.tsx'), 'utf8');
    const stay = readFileSync(resolve(__dirname, '../pages/StayDetails.tsx'), 'utf8');
    expect(tour).toContain('tv-review-compose');
    expect(stay).toContain('tv-review-compose');
    expect(tour).toContain('Share what stood out');
    expect(stay).toContain('size={28}');
  });
});
