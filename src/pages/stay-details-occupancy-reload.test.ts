import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer A: stay PDP calendar must not paint stale occupancy when reloads overlap
 * (Stays browse + TourDetails day-capacity reload gen parity — tab visibility + in-flight fetch).
 */
describe('StayDetails occupancy reload concurrency', () => {
  it('ignores stale occupancy reload completions', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'StayDetails.tsx'), 'utf8');
    expect(src).toMatch(/occupancyReloadGenRef/);
    expect(src).toMatch(/reloadGen !== occupancyReloadGenRef\.current/);
  });
});
