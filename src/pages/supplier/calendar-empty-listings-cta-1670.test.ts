import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1670: Calendar empty offers Your listings', () => {
  it('pairs New listing with Your listings escape', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierAvailability.tsx'), 'utf8');
    expect(src).toContain('Phase 1670');
    expect(src).toMatch(/Create a listing first[\s\S]*New listing[\s\S]*Your listings/);
  });
});
