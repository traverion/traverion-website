import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: PDP review reload must not wipe host replies before the reply RPC returns —
 * a blip must not look like “no host response” (Phase 1176 keep-prior).
 */
describe('TourDetails review reply reload', () => {
  it('clears replies only on tour change, not at start of loadReviews', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'TourDetails.tsx'), 'utf8');
    expect(src).toMatch(/useEffect\(\(\) => \{\s*setReviewReplies\(\{\}\);\s*\}, \[tourId\]\);/);
    const loadReviewsBlock = src.slice(src.indexOf('const loadReviews = useCallback'));
    expect(loadReviewsBlock).not.toMatch(
      /setReviews\(\[\]\);\s*setReviewReplies\(\{\}\);\s*setReviewAggregate\(null\)/
    );
  });
});
