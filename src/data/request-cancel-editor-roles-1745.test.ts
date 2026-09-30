import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1745: host cancel request requires editor roles', () => {
  it('migration gates request_supplier_cancellation on is_listing_supplier_bookings_editor', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/217_request_cancel_editor_roles.sql'),
      'utf8'
    );
    expect(sql).toContain('Phase 1745');
    expect(sql).toContain('is_listing_supplier_bookings_editor');
    expect(sql).not.toMatch(
      /select exists \(\s*select 1\s*from public\.supplier_team_members stm\s*where stm\.supplier_id = v_supplier::text\s*and stm\.user_id = v_uid::text\s*\) into v_team/
    );
  });
});
