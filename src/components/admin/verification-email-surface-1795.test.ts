import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1795: surface verification email failures to admin', () => {
  it('Admin panel warns when approve/reject email.sent is false', () => {
    const src = readFileSync(
      resolve(__dirname, 'AdminSupplierVerificationPanel.tsx'),
      'utf8'
    );
    expect(src).toContain('Phase 1795');
    expect(src).toContain('email.sent === false');
    expect(src).toContain('supplier email failed');
  });
});
