import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1711: partner shell must not wipe team JWTs', () => {
  it('AuthContext skips traveler partner-only gate on partner host and uses own-row profile', () => {
    const src = readFileSync(resolve(__dirname, '../contexts/AuthContext.tsx'), 'utf8');
    expect(src).toContain('Phase 1711');
    expect(src).toContain('isTraverionPartnerHost()');
    expect(src).toContain('userHasSupplierProfile');
    expect(src).not.toMatch(/fetchSupplierProfile\(user\.id\)/);
    expect(src).not.toMatch(/fetchSupplierProfile\(data\.user\.id\)/);
  });

  it('EmailConfirmedSuccess uses own-row supplier check', () => {
    const src = readFileSync(resolve(__dirname, '../pages/EmailConfirmedSuccess.tsx'), 'utf8');
    expect(src).toContain('Phase 1711');
    expect(src).toContain('userHasSupplierProfile');
    expect(src).not.toContain('fetchSupplierProfile');
  });
});
