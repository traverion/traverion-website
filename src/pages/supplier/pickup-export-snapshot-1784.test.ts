import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1784: Pickup CSV audit includes filter snapshot', () => {
  it('exportCsv records dayPreset/listing/needsPickup/query', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierPickupPlanner.tsx'), 'utf8');
    expect(src).toContain('Phase 1784');
    expect(src).toContain('needsPickupOnly');
    expect(src).toContain("surface: 'pickup'");
    expect(src).toContain('dateFrom: dateFrom || undefined');
  });
});
