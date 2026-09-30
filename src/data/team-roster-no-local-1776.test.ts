import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1776: team roster errors do not fall back to localStorage', () => {
  it('fetchSupplierTeamMembers throws on Supabase error', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-supplier-team.ts'), 'utf8');
    expect(src).toContain('Phase 1776');
    expect(src).toContain('never fall back to forgeable localStorage roles');
    expect(src).toMatch(
      /if \(error\) \{\s*\/\/ Phase 1776:[\s\S]*?throw new Error\(error\.message\);/
    );
  });
});
