import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: Publish from Review must jump to the wizard step that owns the first blocker
 * (same as clicking a blocker link — not a coarse Review/Photos-only heuristic).
 */
describe('SupplierListingForm publish blocker jump', () => {
  it('routes failed publish through jumpToPublishBlocker', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'SupplierListingForm.tsx'),
      'utf8'
    );
    expect(src).toMatch(/jumpToPublishBlocker\(first\)/);
    expect(src).not.toMatch(/photosRelated/);
  });
});
