import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1798: earnings/ledger SELECT exclude viewers', () => {
  it('migration uses is_supplier_account_export_actor', () => {
    const sql = readFileSync(
      resolve(
        __dirname,
        '../../supabase/migrations/234_earnings_ledger_select_non_viewer.sql'
      ),
      'utf8'
    );
    expect(sql).toContain('Phase 1798');
    expect(sql).toContain('supplier_earnings');
    expect(sql).toContain('supplier_ledger_entries');
    expect(sql).toContain('is_supplier_account_export_actor');
    expect(sql).not.toMatch(/is_supplier_account_side\(supplier_id\)/);
  });
});
