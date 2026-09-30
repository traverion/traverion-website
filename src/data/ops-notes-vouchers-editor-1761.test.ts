import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1761: ops notes + vouchers editor writes', () => {
  it('migration swaps writes to is_supplier_account_editor', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/225_ops_notes_vouchers_editor_roles.sql'),
      'utf8'
    );
    expect(sql).toContain('Phase 1761');
    expect(sql).toContain('is_supplier_account_editor(supplier_id)');
    expect(sql).toContain('supplier_booking_ops_notes');
    expect(sql).toContain('supplier_booking_vouchers');
    expect(sql).not.toMatch(
      /for insert[\s\S]*is_supplier_account_side\(supplier_id\)[\s\S]*supplier_booking_ops_notes/
    );
  });
});
