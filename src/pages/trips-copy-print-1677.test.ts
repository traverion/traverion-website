import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1677: Trips expanded reference has Copy and Print', () => {
  it('offers Copy and Print next to the reference', () => {
    const src = readFileSync(resolve(__dirname, 'MyBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1677');
    expect(src).toContain('copiedTripRefId');
    expect(src).toContain('Print trip details');
    expect(src).toContain('Copy booking reference');
  });
});
