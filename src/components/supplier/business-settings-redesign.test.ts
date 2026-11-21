import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Business settings redesign', () => {
  it('locks verified brand name and routes changes to Support', () => {
    const src = readFileSync(resolve(__dirname, 'BusinessProfilePage.tsx'), 'utf8');
    expect(src).toContain('Business settings');
    expect(src).toContain('Legal & documents');
    expect(src).toContain("handleNavigate('support')");
    expect(src).toContain('onSupport');
    expect(src).toContain('BUSINESS_SETTINGS_CONTENT_CLASS');
    expect(src).toContain('sansTitle');
    expect(src).toContain('isSupplierBusinessIdentityLocked');
    expect(src).toContain('Save changes');
    expect(src).toContain('PartnerConfirmModal');
    expect(src).not.toContain('window.confirm');
    const ui = readFileSync(resolve(__dirname, 'businessProfileUi.tsx'), 'utf8');
    expect(ui).toContain('max-w-[1000px]');
  });

  it('Team tab shows real members and does not offer a placeholder invite', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierTeamPanel.tsx'), 'utf8');
    expect(src).toContain('Primary account');
    expect(src).toContain('Remove access');
    expect(src).toContain('removeSupplierTeamMember');
    expect(src).not.toContain('Coming soon');
    expect(src).not.toContain('addUserId');
    expect(src).not.toContain('Enter the teammate');
    expect(src).not.toContain('User ID');
  });
});
