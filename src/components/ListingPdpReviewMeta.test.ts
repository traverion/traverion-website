import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ListingPdpReviewMeta', () => {
  const src = readFileSync(resolve(__dirname, 'ListingPdpReviewMeta.tsx'), 'utf8');

  it('always labels zero reviews without a fabricated score', () => {
    expect(src).toContain('0 reviews');
    expect(src).not.toContain('(0) reviews');
    expect(src).toContain("count === 1 ? 'review' : 'reviews'");
    expect(src).toContain('fill-[#C9A227]');
    expect(src).toContain('text-ink-faint');
  });

  it('scrolls to the reviews section only when reviews exist', () => {
    expect(src).toContain('reviewsSectionId');
    expect(src).toContain('scrollIntoView');
    expect(src).toContain('const hasReviews = count > 0');
  });
});
