import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer A: tour date-capacity snapshot must include catalog identity, not date alone
 * (Stays occupancy browse key parity — stale map must not filter after catalog changes).
 */
describe('Packages date capacity browse key', () => {
  it('keys loaded capacity by listing ids and filter date', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Packages.tsx'), 'utf8');
    expect(src).toMatch(/dateCapacityBrowseKey/);
    expect(src).toMatch(/`\$\{supabaseListingIdsKey\}\|\$\{filterDate\}`/);
    expect(src).toMatch(/setDateCapacityLoadedFor\(browseKeyAtStart\)/);
    expect(src).toMatch(/dateCapacityLoadedFor !== dateCapacityBrowseKey/);
  });
});
