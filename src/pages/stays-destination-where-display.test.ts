import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: stay browse Where pill must reflect ?destination= filter (Tours tab switch / share links).
 */
describe('Stays destination filter in Where display', () => {
  it('uses marketplaceWhereDisplay for search values and mobile summary', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Stays.tsx'), 'utf8');
    expect(src).toMatch(/marketplaceWhereDisplay\(draftWhere, selectedDestination, destinationOptions\)/);
    expect(src).toMatch(/get\('destination'\)/);
    expect(src).toMatch(/destOnly/);
  });
});
