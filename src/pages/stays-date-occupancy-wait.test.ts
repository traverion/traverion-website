import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: date-filtered stay browse must not spin forever when the catalog is empty
 * (Packages `waitingOnDateCapacity` requires `allListings.length > 0` parity).
 */
describe('Stays date occupancy wait guard', () => {
  it('only waits on occupancy when there are stays to check', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Stays.tsx'), 'utf8');
    expect(src).toMatch(/const waitingOnOccupancy =/);
    expect(src).toMatch(/stays\.length > 0/);
    expect(src).toMatch(/Boolean\(occupancyBrowseKey\)/);
  });
});
