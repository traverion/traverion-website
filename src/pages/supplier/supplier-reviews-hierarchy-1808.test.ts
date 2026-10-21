import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Partner Reviews hierarchy + always-visible toolbar', () => {
  it('defines tv-reviews card and filter primitives', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('.tv-reviews');
    expect(css).toContain('.tv-reviews-card');
    expect(css).toContain('.tv-reviews-filters');
    expect(css).toContain('.tv-reviews-title');
    expect(css).toContain('Plus Jakarta Sans');
  });

  it('keeps guest review content separate from supplier response', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierReviews.tsx'), 'utf8');
    expect(src).toContain('tv-reviews-card');
    expect(src).toContain('Your response');
    expect(src).toContain('r.listing_title');
    expect(src).not.toContain('font-display text-[1.05rem]');
  });

  it('renders the filter toolbar outside the zero-reviews empty branch', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierReviews.tsx'), 'utf8');
    expect(src).toContain('data-testid="reviews-filters-toolbar"');
    expect(src).toContain('Toolbar is outside loading / empty conditionals');
    const toolbarIdx = src.indexOf('{filtersToolbar}');
    const emptyIdx = src.indexOf('reviews.length === 0');
    expect(toolbarIdx).toBeGreaterThan(-1);
    expect(emptyIdx).toBeGreaterThan(-1);
    expect(toolbarIdx).toBeLessThan(emptyIdx);
  });
});
