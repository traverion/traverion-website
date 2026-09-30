import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1799: booking events/messages SELECT require editors', () => {
  it('migration locks SELECT to is_supplier_account_editor', () => {
    const sql = readFileSync(
      resolve(
        __dirname,
        '../../supabase/migrations/235_booking_events_messages_select_editor.sql'
      ),
      'utf8'
    );
    expect(sql).toContain('Phase 1799');
    expect(sql).toContain('supplier_booking_events');
    expect(sql).toContain('supplier_booking_messages');
    expect(sql).toContain('is_supplier_account_editor');
    expect(sql).not.toMatch(/is_supplier_account_side\(supplier_id\)/);
  });
});
