import { describe, expect, it } from 'vitest';
import { partnerPrimaryNavIncludesMoney, PARTNER_PRIMARY_NAV_SECTION_IDS } from './partner-primary-nav';

describe('partner primary nav', () => {
  it('keeps Income (earnings) one tap away and drops Calendar from the thumb bar', () => {
    expect(partnerPrimaryNavIncludesMoney()).toBe(true);
    expect(PARTNER_PRIMARY_NAV_SECTION_IDS).toEqual(['dashboard', 'bookings', 'listings', 'earnings']);
    expect(PARTNER_PRIMARY_NAV_SECTION_IDS).not.toContain('availability');
    expect(PARTNER_PRIMARY_NAV_SECTION_IDS).not.toContain('inbox');
  });
});
