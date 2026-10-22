import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Supplier profile inflight cache', () => {
  it('coalesces profile reads and invalidates on writes', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-supplier-profile.ts'), 'utf8');
    expect(src).toContain('createInflightCache');
    expect(src).toContain('supplierProfileCache');
    expect(src).toContain('invalidateSupplierProfileCache');
    expect(src).toMatch(/invalidateSupplierProfileCache\(userId\)/);
    expect(src).toContain('Transport failures must not cache as a null profile');
  });
});
