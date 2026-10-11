import { describe, expect, it } from 'vitest';
import {
  partnerMoreNavIncludesSection,
  partnerPrimaryNavIncludesCalendar,
  partnerPrimaryNavIncludesMoney,
  PARTNER_MORE_NAV_SECTION_IDS,
  PARTNER_PRIMARY_NAV_SECTION_IDS,
} from './partner-primary-nav';

describe('partner primary nav', () => {
  it('keeps Calendar one tap away and puts Income in More / sidebar', () => {
    expect(partnerPrimaryNavIncludesCalendar()).toBe(true);
    expect(partnerPrimaryNavIncludesMoney()).toBe(false);
    expect(PARTNER_PRIMARY_NAV_SECTION_IDS).toEqual([
      'dashboard',
      'bookings',
      'listings',
      'availability',
    ]);
    expect(PARTNER_PRIMARY_NAV_SECTION_IDS).not.toContain('earnings');
    expect(PARTNER_PRIMARY_NAV_SECTION_IDS).not.toContain('inbox');
  });

  it('highlights More for Income but not for Calendar', () => {
    expect(partnerMoreNavIncludesSection('earnings')).toBe(true);
    expect(partnerMoreNavIncludesSection('availability')).toBe(false);
    expect(PARTNER_MORE_NAV_SECTION_IDS).toContain('earnings');
    expect(PARTNER_MORE_NAV_SECTION_IDS).not.toContain('availability');
    expect(PARTNER_MORE_NAV_SECTION_IDS).not.toContain('bookings');
  });
});
