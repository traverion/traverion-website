import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1702: company profile update resolves team JWT to owner', () => {
  it('updateSupplierCompanyProfile uses resolveSupplierId before eq id', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-supplier-profile.ts'), 'utf8');
    expect(src).toContain('Phase 1702');
    const fn = src.slice(
      src.indexOf('export async function updateSupplierCompanyProfile'),
      src.indexOf('export async function fetchSupplierPublicLegal')
    );
    expect(fn).toContain('resolveSupplierId(userId)');
    expect(fn).toContain(".eq('id', ownerSupplierId)");
    expect(fn).not.toContain(".eq('id', userId)");
    expect(fn).toContain('supplierId: ownerSupplierId');
  });

  it('Settings verification_submitted notify uses owner supplier id', () => {
    const src = readFileSync(
      resolve(__dirname, '../components/supplier/SupplierSettingsPages.tsx'),
      'utf8'
    );
    expect(src).toContain('Phase 1702');
    expect(src).toContain('res.supplierId ?? p.user.id');
    expect(src).toMatch(/verification_submitted:\$\{ownerId\}/);
  });
});
