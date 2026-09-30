import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canManageFinance } from '../../lib/supplierTeamRoles';

describe('Phase 1760: Money CSV export role + audit log', () => {
  it('canManageFinance is owner or finance only', () => {
    expect(canManageFinance('owner')).toBe(true);
    expect(canManageFinance('finance')).toBe(true);
    expect(canManageFinance('ops')).toBe(false);
    expect(canManageFinance('viewer')).toBe(false);
  });

  it('SupplierEarnings gates Export and inserts supplier_export_runs', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierEarnings.tsx'), 'utf8');
    expect(src).toContain('Phase 1760');
    expect(src).toContain('canManageFinance');
    expect(src).toContain('insertSupplierExportRun');
    expect(src).toContain("surface: 'money'");
    expect(src).toContain('disabled={!canExportFinance || !canExportMoney}');
  });
});
