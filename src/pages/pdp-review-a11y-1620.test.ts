import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1620: PDP review a11y via shared PublicReviewCard', () => {
  it('TourDetails uses PublicReviewCard for listing reviews', () => {
    const src = readFileSync(resolve(__dirname, 'TourDetails.tsx'), 'utf8');
    expect(src).toContain('PublicReviewCard');
    expect(src).toContain('StarRatingDisplay');
  });

  it('StayDetails uses PublicReviewCard for listing reviews', () => {
    const src = readFileSync(resolve(__dirname, 'StayDetails.tsx'), 'utf8');
    expect(src).toContain('PublicReviewCard');
    expect(src).toContain('StarRatingDisplay');
  });

  it('PublicReviewCard announces ratings and keeps Verified subtle', () => {
    const card = readFileSync(resolve(__dirname, '../components/PublicReviewCard.tsx'), 'utf8');
    expect(card).toContain('StarRatingDisplay');
    expect(card).toContain('tv-review-verified');
    expect(card).not.toContain('bg-emerald-100');
    const stars = readFileSync(resolve(__dirname, '../components/StarRatingDisplay.tsx'), 'utf8');
    expect(stars).toContain('out of 5 stars');
  });
});
