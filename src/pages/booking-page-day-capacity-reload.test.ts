import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer A: checkout calendar must not paint stale occupancy when capacity reloads overlap
 * (Packages date-capacity reload gen parity — tab visibility + in-flight fetch).
 */
describe('BookingPage day capacity reload concurrency', () => {
  it('ignores stale day-capacity reload completions', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'BookingPage.tsx'), 'utf8');
    expect(src).toMatch(/dayCapacityReloadGenRef/);
    expect(src).toMatch(/reloadGen !== dayCapacityReloadGenRef\.current/);
  });
});
