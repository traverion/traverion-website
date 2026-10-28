import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1805: mobile booking bar + quick facts polish', () => {
  it('defines tv-booking-mobile-bar and Tour/Stay use it', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    const tour = readFileSync(resolve(__dirname, '../pages/TourDetails.tsx'), 'utf8');
    const stay = readFileSync(resolve(__dirname, '../pages/StayDetails.tsx'), 'utf8');
    expect(css).toContain('Phase 1805');
    expect(css).toContain('.tv-booking-mobile-bar');
    expect(tour).toContain('tv-booking-mobile-bar');
    expect(stay).toContain('tv-booking-mobile-bar');
    expect(tour).toMatch(/text-base font-semibold tabular-nums/);
  });

  it('TourQuickFacts uses shared ListingPdpQuickFacts tiles', () => {
    const src = readFileSync(resolve(__dirname, 'tour-detail/TourQuickFacts.tsx'), 'utf8');
    const shared = readFileSync(resolve(__dirname, 'ListingPdpQuickFacts.tsx'), 'utf8');
    expect(src).toContain('ListingPdpQuickFacts');
    expect(shared).toContain('bg-[#F5F7FA]');
    expect(shared).toContain('text-[#0B397E]');
  });
});

