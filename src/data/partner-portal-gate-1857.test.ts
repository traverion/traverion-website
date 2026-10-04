import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1857: SupplierLayout uses patient partner portal gate', () => {
  it('wires partnerPortalAccessFalseShouldBlock and avoids early sign-out', () => {
    const src = readFileSync(
      resolve(__dirname, '../../src/components/supplier/SupplierLayout.tsx'),
      'utf8'
    );
    expect(src).toContain('partnerPortalAccessFalseShouldBlock');
    expect(src).toContain('partnerPortalBlockedShouldSignOut');
    expect(src).toContain('partnerPortalAccessFalseShouldBlock({ falseStreak, attempt })');
  });
});
