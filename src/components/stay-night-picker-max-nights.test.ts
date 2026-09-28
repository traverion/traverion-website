import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer A/B: StayNightPicker must not allow ranges beyond stayOccupancy night iteration cap.
 */
describe('StayNightPicker max nights', () => {
  it('rejects check-out when occupied-night count exceeds STAY_MAX_OCCUPIED_NIGHTS', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'StayNightPicker.tsx'),
      'utf8'
    );
    expect(src).toMatch(/STAY_MAX_OCCUPIED_NIGHTS/);
    expect(src).toMatch(/nights\.length > STAY_MAX_OCCUPIED_NIGHTS/);
  });
});
