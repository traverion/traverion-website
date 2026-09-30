import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1744: listings writes require editor team roles', () => {
  it('migration defines is_supplier_account_editor for INSERT/UPDATE/DELETE', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/216_listings_write_editor_roles.sql'),
      'utf8'
    );
    expect(sql).toContain('is_supplier_account_editor');
    expect(sql).toContain("'owner', 'manager', 'ops'");
    expect(sql).toContain('is_supplier_account_editor(supplier_id)');
    expect(sql).toContain('for insert');
    expect(sql).toContain('for delete');
  });

  it('deleteListing fails closed on zero-row RLS', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-listings.ts'), 'utf8');
    expect(src).toContain('Phase 1744');
    expect(src).toContain('permission to remove it');
    expect(src).toMatch(/\.delete\(\)[\s\S]*\.select\('id'\)[\s\S]*\.maybeSingle\(\)/);
  });
});
