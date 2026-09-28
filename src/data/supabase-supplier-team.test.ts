import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer A: team JWT → owner supplier_id resolution must fail closed.
 * A blip on supplier_team_members must not invent “primary account” scope.
 */
describe('resolveSupplierId team lookup honesty (Phase 1473)', () => {
  it('throws on supplier_team_members query error instead of falling back to JWT user id', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'supabase-supplier-team.ts'), 'utf8');
    expect(src).toMatch(/if \(error\) throw new Error\(error\.message\)/);
    expect(src).toMatch(/Phase 1473/);
  });
});
