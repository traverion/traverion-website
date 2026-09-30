import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1822: partner listings card polish', () => {
  it('defines tv-ops-listing-card', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('Phase 1822');
    expect(css).toContain('.tv-ops-listing-card');
  });

  it('uses display title and price hierarchy', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierListings.tsx'), 'utf8');
    expect(src).toContain('tv-ops-listing-card');
    expect(src).toContain('font-display text-[1.05rem]');
    expect(src).toContain('font-display text-[0.95rem] font-semibold tabular-nums');
    expect(src).not.toContain('font-sans text-base font-semibold text-ink leading-snug');
  });
});
