import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1686: Stay sticky avoids em dash when nightly missing', () => {
  it('uses Price unavailable instead of — for no-dates no-nightly', () => {
    const src = readFileSync(resolve(__dirname, 'StayDetails.tsx'), 'utf8');
    expect(src).toContain('Phase 1686');
    expect(src).toContain("nightly > 0\n                        ? formatMoney(nightly, currency)\n                        : 'Price unavailable'");
  });
});
