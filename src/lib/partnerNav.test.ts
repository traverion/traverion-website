import { describe, expect, it } from 'vitest';
import {
  PARTNER_NAV_HOME,
  PARTNER_NAV_TOURS_CHILDREN,
  PARTNER_NAV_STAYS_CHILDREN,
  PARTNER_SIDEBAR_PRIMARY,
  PARTNER_SIDEBAR_FOOTER,
  PARTNER_MORE_GROUPS,
  PARTNER_NAV_OFFERS,
  isPartnerNavSoonItem,
  partnerSectionTitle,
  partnerSidebarGroupContaining,
  partnerSidebarNavigableIds,
} from './partnerNav';
import { PARTNER_PRIMARY_NAV_SECTION_IDS } from './partner-primary-nav';

describe('partnerNav IA', () => {
  it('starts with Overview leaves before product groups (Create lives on Listings/Home)', () => {
    expect(PARTNER_NAV_HOME.id).toBe('dashboard');
    expect(PARTNER_NAV_HOME.label).toBe('Home');
    expect(PARTNER_SIDEBAR_PRIMARY.map((e) => e.id)).toEqual([
      'overview',
      'dashboard',
      'listings',
      'inbox',
      'tours',
      'stays',
      'business',
      'earnings',
      'performance',
      'reviews',
      'discounts',
    ]);
    expect(PARTNER_SIDEBAR_PRIMARY.some((e) => e.kind === 'action' && e.id === 'create')).toBe(
      false
    );
  });

  it('nests tour ops under Tours & Activities', () => {
    expect(
      PARTNER_NAV_TOURS_CHILDREN.filter((c) => !isPartnerNavSoonItem(c)).map((i) => i.id)
    ).toEqual(['bookings', 'availability', 'pickup']);
    expect(partnerSidebarGroupContaining('bookings')?.id).toBe('tours');
    expect(partnerSidebarGroupContaining('availability')?.id).toBe('tours');
    expect(partnerSidebarGroupContaining('pickup')?.id).toBe('tours');
    expect(partnerSectionTitle('availability')).toBe('Departures & Availability');
  });

  it('nests Reservations and Stay Calendar under Stays as live routes', () => {
    expect(PARTNER_NAV_STAYS_CHILDREN.map((i) => i.id)).toEqual(['reservations', 'stay-calendar']);
    expect(PARTNER_NAV_STAYS_CHILDREN.some(isPartnerNavSoonItem)).toBe(false);
    expect(partnerSidebarGroupContaining('reservations')?.id).toBe('stays');
    expect(partnerSidebarGroupContaining('stay-calendar')?.id).toBe('stays');
    expect(partnerSidebarNavigableIds()).toContain('stay-calendar');
    expect(partnerSectionTitle('stay-calendar')).toBe('Stay Calendar');
  });

  it('does not duplicate Bookings and Reservations as top-level leaves', () => {
    const leaves = PARTNER_SIDEBAR_PRIMARY.filter((e) => e.kind === 'item').map((e) => e.id);
    expect(leaves).not.toContain('bookings');
    expect(leaves).not.toContain('reservations');
    expect(leaves).not.toContain('availability');
    expect(leaves).not.toContain('stay-calendar');
  });

  it('keeps Support and Settings in the footer, not mixed with ops', () => {
    expect(PARTNER_SIDEBAR_FOOTER.map((i) => i.id)).toEqual(['support', 'business-profile']);
  });

  it('keeps Offers discoverable and omits bottom-primary duplicates from More', () => {
    expect(PARTNER_NAV_OFFERS.id).toBe('discounts');
    expect(PARTNER_SIDEBAR_PRIMARY.some((e) => e.id === 'discounts')).toBe(true);
    const moreIds = PARTNER_MORE_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    expect(moreIds).toContain('discounts');
    expect(moreIds).toContain('inbox');
    expect(moreIds).toContain('pickup');
    expect(moreIds).toContain('reservations');
    expect(moreIds).toContain('stay-calendar');
    expect(moreIds).toContain('support');
    expect(moreIds).toContain('account-settings');
    expect(moreIds).toContain('earnings');
    for (const id of PARTNER_PRIMARY_NAV_SECTION_IDS) {
      expect(moreIds).not.toContain(id);
    }
  });

  it('aligns section titles with nav labels for Calendar and Income', () => {
    expect(partnerSectionTitle('availability')).toBe('Departures & Availability');
    expect(partnerSectionTitle('earnings')).toBe('Income & Payouts');
    expect(partnerSectionTitle('pickup')).toBe('Pickups');
  });
});
