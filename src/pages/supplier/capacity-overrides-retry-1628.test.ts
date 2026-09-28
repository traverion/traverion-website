import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1628: capacity overrides Retry', () => {
  it('offers Retry that reloads caps for the visible month', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierAvailability.tsx'), 'utf8');
    expect(src).toContain('Phase 1628');
    expect(src).toMatch(/Capacity overrides unavailable[\s\S]*loadCaps\(listingId, monthFromIso, monthToIso\)/);
    expect(src).toContain('Retry');
  });
});
