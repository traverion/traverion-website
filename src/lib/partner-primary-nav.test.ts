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
      'calendar',
    ]);
    expect(PARTNER_PRIMARY_NAV_SECTION_IDS).not.toContain('earnings');
    expect(PARTNER_PRIMARY_NAV_SECTION_IDS).not.toContain('inbox');
    expect(PARTNER_PRIMARY_NAV_SECTION_IDS).not.toContain('availability');
  });

  it('highlights More for Income but not for Calendar or Bookings', () => {
    expect(partnerMoreNavIncludesSection('earnings')).toBe(true);
    expect(partnerMoreNavIncludesSection('calendar')).toBe(false);
    expect(partnerMoreNavIncludesSection('availability')).toBe(false);
    expect(PARTNER_MORE_NAV_SECTION_IDS).toContain('earnings');
    expect(PARTNER_MORE_NAV_SECTION_IDS).not.toContain('calendar');
    expect(PARTNER_MORE_NAV_SECTION_IDS).not.toContain('availability');
    expect(PARTNER_MORE_NAV_SECTION_IDS).not.toContain('bookings');
    expect(PARTNER_MORE_NAV_SECTION_IDS).not.toContain('pickup');
    expect(PARTNER_MORE_NAV_SECTION_IDS).not.toContain('reservations');
    expect(PARTNER_MORE_NAV_SECTION_IDS).not.toContain('rental-bookings');
  });
});
