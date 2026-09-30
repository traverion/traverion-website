import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1821: listing gallery lightbox polish', () => {
  it('defines tv-gallery-lightbox', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).toContain('Phase 1821');
    expect(css).toContain('.tv-gallery-lightbox');
    expect(css).toContain('.tv-gallery-lightbox__nav');
  });

  it('Tour and Stay lightboxes share chrome and prev/next', () => {
    const tour = readFileSync(resolve(__dirname, '../pages/TourDetails.tsx'), 'utf8');
    const stay = readFileSync(resolve(__dirname, '../pages/StayDetails.tsx'), 'utf8');
    expect(tour).toContain('tv-gallery-lightbox');
    expect(stay).toContain('tv-gallery-lightbox');
    expect(tour).toContain('Previous photo');
    expect(stay).toContain('Next photo');
    expect(tour).toContain('tv-section-cta');
    expect(stay).toContain('tv-section-cta');
  });
});
