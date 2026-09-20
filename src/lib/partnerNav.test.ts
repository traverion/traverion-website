import { describe, expect, it } from 'vitest';
import {
  PARTNER_NAV_HOME,
  PARTNER_NAV_BOOKINGS_CHILDREN,
  PARTNER_NAV_RESERVATIONS_CHILDREN,
  PARTNER_SIDEBAR_PRIMARY,
  PARTNER_SIDEBAR_FOOTER,
  PARTNER_MORE_GROUPS,
  PARTNER_NAV_OFFERS,
  partnerSidebarGroupContaining,
  partnerSidebarDefaultChild,
} from './partnerNav';

describe('partnerNav IA', () => {
  it('pins Home and Create before inventory and ops groups', () => {
    expect(PARTNER_NAV_HOME.id).toBe('dashboard');
    expect(PARTNER_NAV_HOME.label).toBe('Home');
    expect(PARTNER_SIDEBAR_PRIMARY.map((e) => e.id)).toEqual([
      'dashboard',
      'create',
      'listings',
      'bookings',
      'reservations',
      'inbox',
      'reviews',
      'earnings',
      'performance',
    ]);
  });

  it('keeps tour ops under Bookings without making listing type the sidebar axis', () => {
    expect(PARTNER_NAV_BOOKINGS_CHILDREN.map((i) => i.id)).toEqual([
      'bookings',
      'pickup',
      'availability',
    ]);
  });

  it('exposes a single real Reservations surface', () => {
    expect(PARTNER_NAV_RESERVATIONS_CHILDREN.map((i) => i.id)).toEqual(['reservations']);
    const group = partnerSidebarGroupContaining('reservations');
    expect(group?.id).toBe('reservations');
    expect(partnerSidebarDefaultChild(group!)).toBe('reservations');
  });

  it('keeps Help and Settings in the footer, not mixed with ops', () => {
    expect(PARTNER_SIDEBAR_FOOTER.map((i) => i.id)).toEqual(['help', 'business-profile']);
  });

  it('keeps Offers reachable without a top-level item', () => {
    expect(PARTNER_NAV_OFFERS.id).toBe('discounts');
    expect(PARTNER_SIDEBAR_PRIMARY.some((e) => e.id === 'discounts')).toBe(false);
    const moreIds = PARTNER_MORE_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    expect(moreIds).toContain('discounts');
    expect(moreIds).toContain('inbox');
    expect(moreIds).toContain('pickup');
    expect(moreIds).toContain('help');
    expect(moreIds).toContain('account-settings');
  });
});
