import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: Home destination tiles must count inventory with marketplace destination parity
 * (city/country fields — not substring matches on the free-text destination line).
 */
describe('Home destination tile counts', () => {
  it('uses matchesDestination for tour/stay counts on each chip', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Home.tsx'), 'utf8');
    expect(src).toMatch(/matchesDestination\(t, p\.id, \[p\]\)/);
    expect(src).not.toMatch(/destination\.toLowerCase\(\)\.includes\(p\.label/);
  });
});
