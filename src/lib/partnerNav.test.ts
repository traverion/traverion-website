import { describe, expect, it } from 'vitest';
import {
  PARTNER_NAV_HOME,
  PARTNER_NAV_TOURS_CHILDREN,
  PARTNER_NAV_STAYS_CHILDREN,
  PARTNER_NAV_RENTALS_CHILDREN,
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
  it('uses a flat workspace sidebar with Bookings as a top-level leaf', () => {
    expect(PARTNER_NAV_HOME.id).toBe('dashboard');
    expect(PARTNER_NAV_HOME.label).toBe('Home');
    expect(PARTNER_SIDEBAR_PRIMARY.map((e) => e.id)).toEqual([
      'dashboard',
      'calendar',
      'bookings',
      'listings',
      'inbox',
      'earnings',
      'performance',
    ]);
    expect(PARTNER_SIDEBAR_PRIMARY.every((e) => e.kind === 'item')).toBe(true);
    expect(PARTNER_SIDEBAR_PRIMARY.some((e) => e.kind === 'group')).toBe(false);
    expect(PARTNER_SIDEBAR_PRIMARY.some((e) => e.kind === 'action' && e.id === 'create')).toBe(
      false
    );
  });

  it('keeps legacy tour/stay/rental children for deep links only', () => {
    expect(
      PARTNER_NAV_TOURS_CHILDREN.filter((c) => !isPartnerNavSoonItem(c)).map((i) => i.id)
    ).toEqual(['bookings', 'pickup']);
    expect(PARTNER_NAV_STAYS_CHILDREN.map((i) => i.id)).toEqual(['reservations']);
    expect(PARTNER_NAV_RENTALS_CHILDREN.map((i) => i.id)).toEqual(['rental-bookings']);
    expect(partnerSidebarGroupContaining('bookings')).toBeNull();
    expect(partnerSidebarGroupContaining('pickup')).toBeNull();
    expect(partnerSidebarGroupContaining('reservations')).toBeNull();
    expect(partnerSidebarGroupContaining('rental-bookings')).toBeNull();
  });

  it('uses unified Calendar and Bookings without category groups', () => {
    expect(partnerSidebarNavigableIds()).toEqual([
      'dashboard',
      'calendar',
      'bookings',
      'listings',
      'inbox',
      'earnings',
      'performance',
    ]);
    expect(partnerSidebarNavigableIds()).not.toContain('availability');
    expect(partnerSidebarNavigableIds()).not.toContain('stay-calendar');
    expect(partnerSidebarNavigableIds()).not.toContain('rental-calendar');
    expect(partnerSidebarNavigableIds()).not.toContain('pickup');
    expect(partnerSidebarNavigableIds()).not.toContain('reservations');
    expect(partnerSidebarNavigableIds()).not.toContain('rental-bookings');
  });

  it('does not nest Bookings under Tours or duplicate family desks in the sidebar', () => {
    const leaves = PARTNER_SIDEBAR_PRIMARY.filter((e) => e.kind === 'item').map((e) => e.id);
    expect(leaves).toContain('bookings');
    expect(leaves).toContain('calendar');
    expect(leaves).not.toContain('reservations');
    expect(leaves).not.toContain('rental-bookings');
    expect(leaves).not.toContain('pickup');
  });

  it('keeps Support and Settings in the footer, not mixed with ops', () => {
    expect(PARTNER_SIDEBAR_FOOTER.map((i) => i.id)).toEqual(['support', 'business-profile']);
  });

  it('keeps Offers discoverable in More without category booking desks', () => {
    expect(PARTNER_NAV_OFFERS.id).toBe('discounts');
    expect(PARTNER_SIDEBAR_PRIMARY.some((e) => e.id === 'discounts')).toBe(false);
    const moreIds = PARTNER_MORE_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    expect(moreIds).toContain('discounts');
    expect(moreIds).not.toContain('calendar');
    expect(moreIds).toContain('inbox');
    expect(moreIds).not.toContain('pickup');
    expect(moreIds).not.toContain('reservations');
    expect(moreIds).not.toContain('rental-bookings');
    expect(moreIds).not.toContain('bookings');
    expect(moreIds).toContain('support');
    expect(moreIds).toContain('account-settings');
    expect(moreIds).toContain('earnings');
    for (const id of PARTNER_PRIMARY_NAV_SECTION_IDS) {
      expect(moreIds).not.toContain(id);
    }
  });

  it('aligns section titles with nav labels for Calendar and Income', () => {
    expect(partnerSectionTitle('calendar')).toBe('Calendar');
    expect(partnerSectionTitle('bookings')).toBe('Bookings');
    expect(partnerSectionTitle('availability')).toBe('Departures & Availability');
    expect(partnerSectionTitle('earnings')).toBe('Income & Payouts');
    expect(partnerSectionTitle('pickup')).toBe('Pickups');
  });
});
