import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Tour Details desktop sticky booking column', () => {
  const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
  const tour = readFileSync(resolve(__dirname, 'TourDetails.tsx'), 'utf8');

  it('keeps sticky panel as a stretched grid sibling of main content (not align-items:start)', () => {
    // Regression: align-items:start on .tv-pdp-layout shrinks the aside to panel height,
    // so position:sticky has no travel range and the booking card does not follow scroll.
    const layoutBlock = css.slice(css.indexOf('.tv-pdp-layout'), css.indexOf('.tv-pdp-below'));
    expect(layoutBlock).toMatch(/\.tv-pdp-layout\s*\{[^}]*align-items:\s*stretch/s);
    expect(layoutBlock).not.toMatch(/\.tv-pdp-layout[^{]*\{[^}]*align-items:\s*start/s);
    expect(tour).toContain('tv-pdp-layout');
    expect(tour).toContain('tv-pdp-aside');
    expect(tour).toMatch(/tv-booking-sticky[\s\S]*lg:sticky/);
  });

  it('places sticky panel beside TourListingSections inside the same layout grid', () => {
    const layoutStart = tour.indexOf('tv-pdp-layout');
    const layoutSlice = tour.slice(layoutStart, tour.indexOf('id="tour-reviews"'));
    expect(layoutSlice).toContain('TourListingSections');
    expect(layoutSlice).toContain('tour-booking-panel');
    expect(layoutSlice.indexOf('TourListingSections')).toBeLessThan(
      layoutSlice.indexOf('tour-booking-panel')
    );
  });
});
