import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1748: real partner roles + review reply editors', () => {
  it('useSupplierRole loads roster from fetchSupplierListingAccess', () => {
    const hook = readFileSync(resolve(__dirname, '../hooks/useSupplierRole.ts'), 'utf8');
    const ctx = readFileSync(resolve(__dirname, '../contexts/SupplierRoleContext.tsx'), 'utf8');
    const team = readFileSync(resolve(__dirname, 'supabase-supplier-team.ts'), 'utf8');
    expect(hook).toContain('Phase 1748');
    expect(ctx).toContain('fetchSupplierListingAccess');
    expect(ctx).toContain('requestRef');
    expect(ctx).toContain("useState<SupplierRole>('viewer')");
    expect(ctx).not.toMatch(/role:\s*'owner',\s*\n\s*members:\s*\[\]/);
    expect(team).toContain('effectiveListingRole');
    expect(team).toContain('data.session?.access_token');
    expect(team).toContain("mine?.role ?? 'viewer'");
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
