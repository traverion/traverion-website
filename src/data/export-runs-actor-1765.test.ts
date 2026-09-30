import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1765: export_runs insert excludes viewer', () => {
  it('migration defines is_supplier_account_export_actor with finance+editors', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/227_supplier_export_runs_actor_roles.sql'),
      'utf8'
    );
    expect(sql).toContain('Phase 1765');
    expect(sql).toContain('is_supplier_account_export_actor');
    expect(sql).toContain("'owner', 'manager', 'ops', 'finance'");
    expect(sql).toContain('Suppliers can write own export runs');
  });
});
