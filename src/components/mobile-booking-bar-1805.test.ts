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
    expect(tour).toMatch(/font-display text-base font-semibold tabular-nums/);
  });

  it('TourQuickFacts uses solid paper surface', () => {
    const src = readFileSync(resolve(__dirname, 'tour-detail/TourQuickFacts.tsx'), 'utf8');
    expect(src).toContain('bg-paper-raised');
    expect(src).toContain('shadow-soft');
    expect(src).not.toContain('bg-paper-raised/80');
  });
});
