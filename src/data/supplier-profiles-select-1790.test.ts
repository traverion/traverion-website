import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1790: supplier_profiles SELECT excludes viewers', () => {
  it('migration uses is_supplier_account_export_actor for profile select', () => {
    const sql = readFileSync(
      resolve(
        __dirname,
        '../../supabase/migrations/232_supplier_profiles_select_non_viewer.sql'
      ),
      'utf8'
    );
    expect(sql).toContain('Phase 1790');
    expect(sql).toContain('supplier_profiles');
    expect(sql).toContain('is_supplier_account_export_actor');
    expect(sql).not.toMatch(/is_supplier_account_side\(id\)/);
  });
});
