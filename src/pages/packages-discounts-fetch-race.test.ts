import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: tour browse must not treat a prior catalog's offer map as loaded for the
 * current listing id set (missing rows looked like “no discount”; stale rows could flash wrong prices).
 */
describe('Packages discounts fetch race honesty', () => {
  it('gates card offers on catalog id key + load generation', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Packages.tsx'), 'utf8');
    expect(src).toMatch(/discountsLoadedForKey/);
    expect(src).toMatch(/discountsLoadGenRef/);
    expect(src).toMatch(/setDiscountsLoadedForKey\(null\)/);
    expect(src).toMatch(/discountsLoadedForKey === supabaseListingIdsKey/);
    expect(src).toMatch(/gen !== discountsLoadGenRef\.current/);
  });
});
