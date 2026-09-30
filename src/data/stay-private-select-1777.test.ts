import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1777: stay private SELECT requires editors', () => {
  it('migration uses is_supplier_account_editor for listing_stay_private select', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/229_listing_stay_private_select_editor.sql'),
      'utf8'
    );
    expect(sql).toContain('Phase 1777');
    expect(sql).toContain('listing_stay_private');
    expect(sql).toContain('is_supplier_account_editor');
  });
});
