import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: tour browse must not treat a failed Supabase catalog fetch as a confirmed
 * empty catalog (Stays/Home/Destination Phase 1356 emptyOnFirstError: false parity).
 */
describe('Packages catalog load failure honesty', () => {
  it('keeps supplierListings null on first fetch error', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Packages.tsx'), 'utf8');
    expect(src).toMatch(/usePublishedSupplierListings\(\{\s*emptyOnFirstError:\s*false\s*\}\)/);
  });
});
