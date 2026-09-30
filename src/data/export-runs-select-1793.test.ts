import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1793: export_runs SELECT requires exporters', () => {
  it('migration locks SELECT to is_supplier_account_export_actor', () => {
    const sql = readFileSync(
      resolve(
        __dirname,
        '../../supabase/migrations/233_export_runs_select_export_actor.sql'
      ),
      'utf8'
    );
    expect(sql).toContain('Phase 1793');
    expect(sql).toContain('supplier_export_runs');
    expect(sql).toContain('is_supplier_account_export_actor');
    expect(sql).not.toMatch(/is_supplier_account_side\(supplier_id\)/);
  });
});
