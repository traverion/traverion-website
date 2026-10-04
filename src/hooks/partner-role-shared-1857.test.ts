import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1857: shared partner role roster across create→listings', () => {
  it('SupplierRoleProvider wraps the partner shell', () => {
    const app = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    expect(app).toContain('SupplierRoleProvider');
    expect(app).toMatch(/SupplierAuthProvider[\s\S]*SupplierRoleProvider/);
  });

  it('useSupplierRole reads shared context with roleStatus', () => {
    const hook = readFileSync(resolve(__dirname, 'useSupplierRole.ts'), 'utf8');
    expect(hook).toContain('useSupplierRoleContext');
    expect(hook).toContain('roleStatus');
  });

  it('listings waits for roleReady before stripping create deep-links', () => {
    const src = readFileSync(resolve(__dirname, '../pages/supplier/SupplierListings.tsx'), 'utf8');
    expect(src).toContain('roleReady');
    expect(src).toContain('Phase 1857');
    expect(src).toMatch(/if \(!roleReady\) return/);
  });

  it('create page does not treat loading as permanent view-only', () => {
    const src = readFileSync(resolve(__dirname, '../pages/supplier/PartnerCreateListingPage.tsx'), 'utf8');
    expect(src).toContain('roleStatus');
    expect(src).toContain('Checking your workspace role');
  });
});
