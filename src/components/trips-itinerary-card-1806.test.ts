import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1806: Trips itinerary card polish', () => {
  it('defines tv-trip-card and MyBookings uses itinerary hierarchy', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    const trips = readFileSync(resolve(__dirname, '../pages/MyBookings.tsx'), 'utf8');
    expect(css).toContain('Phase 1806');
    expect(css).toContain('.tv-trip-card');
    expect(css).toContain('.tv-trip-card__facts');
    expect(trips).toContain('tv-trip-card');
    expect(trips).toContain('tv-trip-card__facts');
    expect(trips).toMatch(/font-display text-\[1\.05rem\].*font-semibold text-ink/);
    expect(trips).toContain("data-open={open ? 'true' : 'false'}");
  });

  it('Home stays section uses shared tv-section-cta', () => {
    const home = readFileSync(resolve(__dirname, '../pages/Home.tsx'), 'utf8');
    expect(home).toMatch(/goToStays\(\).*tv-section-cta/s);
  });
});
