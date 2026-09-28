import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1618: reviews modal empty star filter CTA', () => {
  it('offers Show all ratings when a star filter hides every review', () => {
    const src = readFileSync(resolve(__dirname, 'ListingReviewsModal.tsx'), 'utf8');
    expect(src).toContain('Phase 1618');
    expect(src).toContain('Show all ratings');
    expect(src).toMatch(/setStarFilter\('all'\)/);
  });
});
