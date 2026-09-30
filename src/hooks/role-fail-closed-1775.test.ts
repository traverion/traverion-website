import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1775: useSupplierRole fails closed as viewer', () => {
  it('defaults and error path use viewer not owner', () => {
    const src = readFileSync(resolve(__dirname, 'useSupplierRole.ts'), 'utf8');
    expect(src).toContain('Phase 1775');
    expect(src).toContain("useState<SupplierRole>('viewer')");
    expect(src).toContain("setRole('viewer')");
    expect(src).not.toContain("useState<SupplierRole>('owner')");
  });
});
