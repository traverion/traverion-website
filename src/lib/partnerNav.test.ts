import { describe, expect, it } from 'vitest';
import {
  PARTNER_NAV_TODAY,
  PARTNER_NAV_MANAGE,
  PARTNER_NAV_LISTINGS,
  PARTNER_NAV_GROW,
  PARTNER_NAV_FINANCE,
  PARTNER_NAV_BUSINESS,
  PARTNER_SIDEBAR_GROUPS,
  PARTNER_MORE_GROUPS,
} from './partnerNav';

describe('partnerNav IA', () => {
  it('pins Today outside expandable groups', () => {
    expect(PARTNER_NAV_TODAY.id).toBe('dashboard');
    expect(PARTNER_SIDEBAR_GROUPS.every((g) => !g.items.some((i) => i.id === 'dashboard'))).toBe(true);
  });

  it('keeps bookings, inbox, and pickup visible under Manage', () => {
    expect(PARTNER_NAV_MANAGE.map((i) => i.id)).toEqual(['bookings', 'inbox', 'pickup']);
  });

  it('pairs listings with calendar', () => {
    expect(PARTNER_NAV_LISTINGS.map((i) => i.id)).toEqual(['listings', 'availability']);
  });

  it('exposes grow and finance surfaces', () => {
    expect(PARTNER_NAV_GROW.map((i) => i.id)).toEqual(['performance', 'reviews', 'discounts']);
    expect(PARTNER_NAV_FINANCE.map((i) => i.id)).toEqual(['earnings']);
  });

  it('keeps business identity separate from ops', () => {
    expect(PARTNER_NAV_BUSINESS.map((i) => i.id)).toEqual(['business-profile', 'account-settings']);
  });

  it('orders sidebar groups manage → listings → grow → finance → business', () => {
    expect(PARTNER_SIDEBAR_GROUPS.map((g) => g.id)).toEqual([
      'manage',
      'listings',
      'grow',
      'finance',
      'business',
    ]);
  });

  it('mirrors the same capabilities in the mobile More sheet', () => {
    const moreIds = PARTNER_MORE_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    expect(moreIds).toContain('inbox');
    expect(moreIds).toContain('pickup');
    expect(moreIds).toContain('earnings');
    expect(moreIds).toContain('business-profile');
  });
});
