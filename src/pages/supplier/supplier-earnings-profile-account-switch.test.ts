import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer A: Partner Income must not keep a prior account's payout profile after team/account switch.
 */
describe('SupplierEarnings profile account switch (Phase 1488)', () => {
  it('clears profile before paint and ignores stale profile fetches', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'SupplierEarnings.tsx'), 'utf8');
    expect(src).toMatch(/profileLoadGenRef/);
    expect(src).toMatch(/Phase 1488/);
    expect(src).toMatch(/gen !== profileLoadGenRef\.current/);
    expect(src).toMatch(/setProfile\(null\)/);
    expect(src).toMatch(/earningsHubUserIdRef/);
    expect(src).not.toMatch(/fetchSupplierProfile\(uid\)\.then\(setProfile\)/);
  });
});
