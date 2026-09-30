import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1781: admin payout requires supplier_profiles', () => {
  it('migration checks supplier_profiles not auth.users', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/230_admin_payout_requires_supplier_profile.sql'),
      'utf8'
    );
    expect(sql).toContain('Phase 1781');
    expect(sql).toContain('supplier_profiles');
    expect(sql).not.toContain('from auth.users where id = p_supplier_id');
  });
});
