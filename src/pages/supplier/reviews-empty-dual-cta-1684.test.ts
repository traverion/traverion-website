import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Reviews empty state stays on Reviews', () => {
  it('shows No reviews yet without New listing / Your listings CTAs', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierReviews.tsx'), 'utf8');
    expect(src).toContain('No reviews yet');
    expect(src).toContain(
      'Your guest reviews will appear here once customers start sharing their experiences.'
    );
    expect(src).not.toContain('New listing');
    expect(src).not.toContain('Your listings');
    expect(src).not.toContain('PARTNER_CREATE_PATH');
  });

  it('always mounts Search Listing Rating Reply Sort above the empty state', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierReviews.tsx'), 'utf8');
    expect(src).toContain('data-testid="reviews-filters-toolbar"');
    expect(src).toContain('reviews-filter-search-label');
    expect(src).toContain('reviews-filter-listing-label');
    expect(src).toContain('reviews-filter-rating-label');
    expect(src).toContain('reviews-filter-reply-label');
    expect(src).toContain('reviews-filter-sort-label');
    expect(src).toContain('data-testid="reviews-empty-zero"');
    const toolbar = src.indexOf('{filtersToolbar}');
    const empty = src.indexOf('reviews-empty-zero');
    expect(toolbar).toBeGreaterThan(-1);
    expect(empty).toBeGreaterThan(-1);
    expect(toolbar).toBeLessThan(empty);
  });
});
