import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1746: listing child writes require editor roles', () => {
  it('migration switches availability/stay_private/discounts writes to is_supplier_account_editor', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/218_listing_child_writes_editor_roles.sql'),
      'utf8'
    );
    expect(sql).toContain('Phase 1746');
    expect(sql).toContain('is_supplier_account_editor');
    expect(sql).toContain('listing_availability');
    expect(sql).toContain('listing_stay_private');
    expect(sql).toContain('listing_discounts');
    expect(sql).not.toMatch(
      /for insert[\s\S]*is_supplier_account_side\(l\.supplier_id\)/
    );
  });
});
