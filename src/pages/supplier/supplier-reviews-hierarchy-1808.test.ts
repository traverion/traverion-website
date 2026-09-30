import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1808: supplier review card hierarchy', () => {
  it('defines tv-review-card primitives', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('Phase 1808');
    expect(css).toContain('.tv-review-card');
    expect(css).toContain('.tv-review-card__reply');
  });

  it('separates guest review from supplier response in markup', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierReviews.tsx'), 'utf8');
    expect(src).toContain('tv-review-card');
    expect(src).toContain('Guest review');
    expect(src).toContain('Your response');
    expect(src).toContain('font-display text-[1.05rem]');
    expect(src).toContain('r.listing_title');
  });
});
