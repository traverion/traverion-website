import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: date-filtered tour browse must not spin forever when capacity cannot be keyed
 * (Stays `waitingOnOccupancy` requires `stays.length > 0` + `Boolean(occupancyBrowseKey)` parity).
 */
describe('Packages date capacity wait guard', () => {
  it('only waits on date capacity when there are Supabase tours to check', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Packages.tsx'), 'utf8');
    expect(src).toMatch(/const waitingOnDateCapacity =/);
    expect(src).toMatch(/allListings\.length > 0/);
    expect(src).toMatch(/Boolean\(dateCapacityBrowseKey\)/);
    expect(src).toMatch(/!\s*supabaseListingIdsKey/);
  });
});
