import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1774: verification storage SELECT requires editors', () => {
  it('migration uses is_supplier_account_editor for supplier-verification select', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/228_supplier_verification_storage_select_editor.sql'),
      'utf8'
    );
    expect(sql).toContain('Phase 1774');
    expect(sql).toContain("bucket_id = 'supplier-verification'");
    expect(sql).toContain('is_supplier_account_editor');
    expect(sql).not.toContain('is_supplier_account_side');
  });
});
