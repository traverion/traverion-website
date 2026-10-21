import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Business settings redesign', () => {
  it('locks verified brand name and routes changes to Support', () => {
    const src = readFileSync(resolve(__dirname, 'BusinessProfilePage.tsx'), 'utf8');
    expect(src).toContain('Business settings');
    expect(src).toContain('Legal & documents');
    expect(src).toContain('Your verified business name');
    expect(src).toContain("handleNavigate('support')");
    expect(src).toContain('Manage payouts');
    expect(src).toContain('w-[min(94vw,1100px)]');
    expect(src).toContain('Save changes');
    expect(src).not.toContain('Done');
  });

  it('Team tab uses Coming Soon without UUID invite form', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierTeamPanel.tsx'), 'utf8');
    expect(src).toContain('Coming soon');
    expect(src).toContain('Primary account');
    expect(src).not.toContain('addUserId');
    expect(src).not.toContain('Enter the teammate');
    expect(src).not.toContain('User ID');
  });
});
