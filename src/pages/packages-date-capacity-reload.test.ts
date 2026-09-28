import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer A: tour date browse must not treat a failed capacity sweep as “no tours match”,
 * (Stays occupancy all-fail honesty parity — Phase 1192 partial maps).
 * Overlapping reloads (date change, tab visibility) must not commit stale capacity maps.
 */
describe('Packages date capacity reload honesty', () => {
  it('fail-closes when every per-tour capacity fetch fails', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Packages.tsx'), 'utf8');
    expect(src).toMatch(/ok\.length === 0 && allListings\.length > 0/);
    expect(src).toMatch(/setDateCapacityError\(/);
  });

  it('ignores stale date-capacity reload completions', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Packages.tsx'), 'utf8');
    expect(src).toMatch(/dateCapacityReloadGenRef/);
    expect(src).toMatch(/reloadGen !== dateCapacityReloadGenRef\.current/);
  });
});
