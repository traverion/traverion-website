import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1785: campaigns/notes/vouchers SELECT require editors', () => {
  it('migration locks SELECT to is_supplier_account_editor', () => {
    const sql = readFileSync(
      resolve(
        __dirname,
        '../../supabase/migrations/231_campaigns_notes_vouchers_select_editor.sql'
      ),
      'utf8'
    );
    expect(sql).toContain('Phase 1785');
    expect(sql).toContain('supplier_message_campaigns');
    expect(sql).toContain('supplier_booking_ops_notes');
    expect(sql).toContain('supplier_booking_vouchers');
    expect(sql).toContain('is_supplier_account_editor');
    expect(sql).not.toMatch(/is_supplier_account_side\(supplier_id\)/);
  });
});
