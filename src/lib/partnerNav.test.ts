import { describe, expect, it } from 'vitest';
import {
  PARTNER_NAV_OPERATE,
  PARTNER_NAV_OPERATIONS,
  PARTNER_NAV_INSIGHTS,
  PARTNER_NAV_BUSINESS,
  PARTNER_SIDEBAR_GROUPS,
} from './partnerNav';

describe('partnerNav IA', () => {
  it('keeps high-frequency operate surfaces first and explicit', () => {
    expect(PARTNER_NAV_OPERATE.map((i) => i.id)).toEqual([
      'dashboard',
      'availability',
      'bookings',
      'inbox',
      'listings',
    ]);
  });

  it('promotes pickup, reviews, and offers out of avatar-only menus', () => {
    expect(PARTNER_NAV_OPERATIONS.map((i) => i.id)).toEqual(['pickup', 'reviews', 'discounts']);
  });

  it('separates insights and business from day-to-day ops', () => {
    expect(PARTNER_NAV_INSIGHTS.map((i) => i.id)).toEqual(['performance', 'earnings']);
    expect(PARTNER_NAV_BUSINESS.map((i) => i.id)).toEqual(['business-profile', 'account-settings']);
  });

  it('exposes four sidebar groups in operate → business order', () => {
    expect(PARTNER_SIDEBAR_GROUPS.map((g) => g.id)).toEqual([
      'operate',
      'operations',
      'insights',
      'business',
    ]);
  });
});
