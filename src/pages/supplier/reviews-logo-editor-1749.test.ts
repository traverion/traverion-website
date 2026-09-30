import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1749: logo storage editors + review reply UI gate', () => {
  it('migration requires is_supplier_account_editor for supplier-logos writes', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../supabase/migrations/221_supplier_logos_storage_editor_roles.sql'),
      'utf8'
    );
    expect(sql).toContain('Phase 1749');
    expect(sql).toContain('is_supplier_account_editor');
    expect(sql).toContain("bucket_id = 'supplier-logos'");
  });

  it('SupplierReviews gates replies with canManageBookings', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierReviews.tsx'), 'utf8');
    expect(src).toContain('Phase 1749');
    expect(src).toContain('canReply');
    expect(src).toContain('canManageBookings');
    expect(src).toContain('cannot publish replies');
  });
});
