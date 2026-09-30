import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1812: booking progress continuity', () => {
  it('defines tv-booking-progress track', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).toContain('Phase 1812');
    expect(css).toContain('.tv-booking-progress');
    expect(css).toContain('.tv-booking-progress__fill');
  });

  it('BookingProgress uses connected track and Check icons', () => {
    const src = readFileSync(resolve(__dirname, '../pages/BookingPage.tsx'), 'utf8');
    expect(src).toContain('tv-booking-progress');
    expect(src).toContain('progressPct');
    expect(src).toContain('<Check');
    expect(src).toContain('tv-booking-progress__fill');
    expect(src).not.toMatch(/mx-0\.5 sm:mx-1 text-ink-faint select-none[\s\S]*→/);
  });
});
