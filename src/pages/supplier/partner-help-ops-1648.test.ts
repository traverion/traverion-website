import { describe, expect, it } from 'vitest';
import { PARTNER_SIDEBAR_FOOTER } from '../../lib/partnerNav';

/** Phase 1648 Help ops shortcuts retired with the Support Center redesign. */
describe('Phase 1648: Partner Help ops shortcuts (superseded)', () => {
  it('exposes Support in the partner footer', () => {
    expect(PARTNER_SIDEBAR_FOOTER.some((i) => i.id === 'support' && i.label === 'Support')).toBe(true);
  });
});
