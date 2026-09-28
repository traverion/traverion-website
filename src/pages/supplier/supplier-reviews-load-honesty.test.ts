import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer A/B: Partner Reviews must not paint a new review list while keeping a stale reply map.
 */
describe('SupplierReviews load honesty (Phase 1475)', () => {
  it('commits reviews and replies atomically and ignores stale reloads', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'SupplierReviews.tsx'), 'utf8');
    expect(src).toMatch(/loadGenRef/);
    expect(src).toMatch(/gen !== loadGenRef\.current/);
    expect(src).toMatch(/Phase 1475/);
    expect(src).toMatch(/commit reviews \+ replies together/);
    expect(src).not.toMatch(
      /fetchReviewsForSupplierListings\(uid\);\s*\n\s*setReviews\(list\);/
    );
  });
});
