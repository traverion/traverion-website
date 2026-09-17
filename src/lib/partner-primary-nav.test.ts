import { describe, expect, it } from 'vitest';
import { partnerPrimaryNavIncludesMoney, PARTNER_PRIMARY_NAV_SECTION_IDS } from './partner-primary-nav';

describe('partner primary nav', () => {
  it('keeps Money (earnings) and Calendar (availability) in the primary set', () => {
    expect(partnerPrimaryNavIncludesMoney()).toBe(true);
    expect(PARTNER_PRIMARY_NAV_SECTION_IDS).toContain('earnings');
    expect(PARTNER_PRIMARY_NAV_SECTION_IDS).toContain('availability');
    expect(PARTNER_PRIMARY_NAV_SECTION_IDS).not.toContain('inbox');
  });
});
