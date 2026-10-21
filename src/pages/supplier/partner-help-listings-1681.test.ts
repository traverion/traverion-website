import { describe, expect, it } from 'vitest';
import { PARTNER_SUPPORT_PATH } from '../../lib/partnerPortalPaths';

/** Phase 1681 Help listings shortcut retired — Support Center replaces Help cards. */
describe('Phase 1681: Partner Help listings shortcut (superseded)', () => {
  it('routes partners to Support instead of Help navigation cards', () => {
    expect(PARTNER_SUPPORT_PATH).toBe('/partner/support');
  });
});
