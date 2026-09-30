import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1754: company profile + verification storage editors', () => {
  it('migration requires is_supplier_account_editor for profile and verification writes', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/224_supplier_profile_verification_editor_roles.sql'),
      'utf8'
    );
    expect(sql).toContain('Phase 1754');
    expect(sql).toContain('is_supplier_account_editor(id)');
    expect(sql).toContain("bucket_id = 'supplier-verification'");
    expect(sql).toContain('is_supplier_account_editor(split_part(name');
  });

  it('Business profile UI gates saves with canManageBookings', () => {
    const src = readFileSync(
      resolve(__dirname, '../components/supplier/SupplierSettingsPages.tsx'),
      'utf8'
    );
    expect(src).toContain('Phase 1754');
    expect(src).toContain('canEditProfile');
    expect(src).toContain('canManageBookings');
    expect(src).toContain('cannot change company, payout, or legal');
  });
});
