import { describe, expect, it } from 'vitest';
import { partnerPrimaryNavIncludesMoney, PARTNER_PRIMARY_NAV_SECTION_IDS } from './partner-primary-nav';

describe('partner primary nav', () => {
  it('keeps Money (earnings) in the primary set, not only under More', () => {
    expect(partnerPrimaryNavIncludesMoney()).toBe(true);
    expect(PARTNER_PRIMARY_NAV_SECTION_IDS).toContain('earnings');
    expect(PARTNER_PRIMARY_NAV_SECTION_IDS).not.toContain('availability');
  });
});
