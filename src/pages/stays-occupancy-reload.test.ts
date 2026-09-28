import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer A: stay night browse must not treat a failed occupancy sweep as “no stays free”,
 * and overlapping reloads (visibility / date change) must not commit stale maps.
 */
describe('Stays occupancy reload honesty', () => {
  it('fail-closes when every per-stay occupancy fetch fails', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Stays.tsx'), 'utf8');
    expect(src).toMatch(/ok\.length === 0 && stays\.length > 0/);
    expect(src).toMatch(/setOccupancyError\(/);
  });

  it('ignores stale occupancy reload completions', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Stays.tsx'), 'utf8');
    expect(src).toMatch(/occupancyReloadGenRef/);
    expect(src).toMatch(/reloadGen !== occupancyReloadGenRef\.current/);
  });
});
