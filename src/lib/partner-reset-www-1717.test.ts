import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1717: partner recovery on www does not hop after establish', () => {
  it('ResetPasswordPage keeps partner portal on marketing host after establish', () => {
    const src = readFileSync(resolve(__dirname, '../pages/ResetPasswordPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1717');
    expect(src).toContain("setPortal('partner')");
    expect(src).not.toContain('partnerPortalAuthRedirectUrl(PARTNER_RESET_PASSWORD_PATH)');
    expect(src).not.toContain('PARTNER_RESET_PASSWORD_PATH');
    const partnerBlock = src.slice(
      src.indexOf('Phase 1717'),
      src.indexOf("setPortal(resolved)")
    );
    expect(partnerBlock).not.toContain('location.replace');
  });
});
