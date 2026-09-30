import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1804: sticky booking card polish', () => {
  it('PriceHero uses display type for amount', () => {
    const src = readFileSync(resolve(__dirname, 'PriceBreakdown.tsx'), 'utf8');
    expect(src).toContain('Phase 1804');
    expect(src).toMatch(/font-display text-3xl/);
  });

  it('Tour and Stay sticky panels use tv-booking-sticky', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    const tour = readFileSync(resolve(__dirname, '../pages/TourDetails.tsx'), 'utf8');
    const stay = readFileSync(resolve(__dirname, '../pages/StayDetails.tsx'), 'utf8');
    expect(css).toContain('.tv-booking-sticky');
    expect(tour).toContain('tv-booking-sticky');
    expect(stay).toContain('tv-booking-sticky');
  });
});
