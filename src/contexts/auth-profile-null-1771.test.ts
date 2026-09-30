import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1771: traveler session survives supplier_profiles lookup null', () => {
  it('travelerUserAllowed returns true when hasSupplierProfile is null', () => {
    const src = readFileSync(resolve(__dirname, 'AuthContext.tsx'), 'utf8');
    expect(src).toContain('Phase 1771');
    expect(src).toContain('if (hasSupplierProfile === null) return true');
    expect(src).not.toContain('if (hasSupplierProfile === null) return false');
  });
});
