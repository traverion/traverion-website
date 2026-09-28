import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: tour browse Where pill must reflect ?destination= filter (Home chips / share links).
 */
describe('Packages destination filter in Where display', () => {
  it('uses marketplaceWhereDisplay for search values and mobile summary', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'Packages.tsx'),
      'utf8'
    );
    expect(src).toMatch(/marketplaceWhereDisplay\(draftWhere, selectedDestination, destinationOptions\)/);
    expect(src).toMatch(/destOnly/);
  });
});
