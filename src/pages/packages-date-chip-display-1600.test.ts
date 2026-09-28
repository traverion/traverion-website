import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatBookingDateDisplay } from '../lib/booking-flow';

describe('Phase 1600: tour browse date chip display', () => {
  it('Packages formats active date chip via formatBookingDateDisplay', () => {
    const src = readFileSync(resolve(__dirname, 'Packages.tsx'), 'utf8');
    expect(src).toContain('formatBookingDateDisplay');
    expect(src).toMatch(
      /MarketplaceActiveChip[\s\S]*label=\{formatBookingDateDisplay\(filterDate\) \|\| filterDate\}/
    );
  });

  it('formatBookingDateDisplay is not raw ISO for a valid day', () => {
    const out = formatBookingDateDisplay('2026-09-29');
    expect(out).not.toBe('2026-09-29');
    expect(out.length).toBeGreaterThan(8);
  });
});
