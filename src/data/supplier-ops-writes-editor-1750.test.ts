import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1750: supplier ops campaign/message writes require editors', () => {
  it('migration uses is_supplier_account_editor for campaigns and booking messages', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/222_supplier_ops_writes_editor_roles.sql'),
      'utf8'
    );
    expect(sql).toContain('Phase 1750');
    expect(sql).toContain('is_supplier_account_editor');
    expect(sql).toContain('supplier_message_campaigns');
    expect(sql).toContain('supplier_booking_messages');
    expect(sql).toContain('Export runs stay account-side');
  });
});
