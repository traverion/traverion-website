import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Phase 1699 Help Inbox shortcut retired — Inbox remains in primary nav. */
describe('Phase 1699: Partner Help includes Inbox shortcut (superseded)', () => {
  it('Support page does not revive Help navigation cards', () => {
    const src = readFileSync(resolve(__dirname, 'PartnerSupportPage.tsx'), 'utf8');
    expect(src).not.toContain('navigateSupplierUrl');
    expect(src).toContain('Send request');
  });
});
