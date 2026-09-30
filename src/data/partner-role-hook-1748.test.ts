import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1748: real partner roles + review reply editors', () => {
  it('useSupplierRole loads roster from fetchSupplierTeamMembers', () => {
    const src = readFileSync(resolve(__dirname, '../hooks/useSupplierRole.ts'), 'utf8');
    expect(src).toContain('Phase 1748');
    expect(src).toContain('fetchSupplierTeamMembers');
    expect(src).toContain("mine?.role ?? 'viewer'");
    expect(src).not.toMatch(/role:\s*'owner',\s*\n\s*members:\s*\[\]/);
  });

  it('migration gates review_replies writes with is_supplier_account_editor', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/220_review_replies_editor_roles.sql'),
      'utf8'
    );
    expect(sql).toContain('Phase 1748');
    expect(sql).toContain('is_supplier_account_editor');
    expect(sql).toContain('review_replies');
  });
});
