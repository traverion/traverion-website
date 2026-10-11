import { describe, expect, it } from 'vitest';
import {
  PARTNER_NAV_HOME,
  PARTNER_NAV_BOOKINGS_CHILDREN,
  PARTNER_NAV_RESERVATIONS_CHILDREN,
  PARTNER_SIDEBAR_PRIMARY,
  PARTNER_SIDEBAR_FOOTER,
  PARTNER_MORE_GROUPS,
  PARTNER_NAV_OFFERS,
  partnerSectionTitle,
  partnerSidebarGroupContaining,
} from './partnerNav';
import { PARTNER_PRIMARY_NAV_SECTION_IDS } from './partner-primary-nav';

describe('partnerNav IA', () => {
  it('pins Create first, then Home, before inventory and daily ops', () => {
    expect(PARTNER_NAV_HOME.id).toBe('dashboard');
    expect(PARTNER_NAV_HOME.label).toBe('Home');
    expect(PARTNER_SIDEBAR_PRIMARY.map((e) => e.id)).toEqual([
      'create',
      'dashboard',
      'listings',
      'bookings',
      'availability',
      'reservations',
      'inbox',
      'reviews',
      'discounts',
      'earnings',
      'performance',
    ]);
  });

  it('keeps Bookings group for guest ops and Calendar as a primary leaf', () => {
    expect(PARTNER_NAV_BOOKINGS_CHILDREN.map((i) => i.id)).toEqual(['bookings', 'pickup']);
    expect(PARTNER_NAV_BOOKINGS_CHILDREN.map((i) => i.label)).toEqual(['Bookings', 'Pickups']);
    const calendar = PARTNER_SIDEBAR_PRIMARY.find((e) => e.id === 'availability');
    expect(calendar?.kind).toBe('item');
    expect(calendar && 'label' in calendar ? calendar.label : null).toBe('Calendar');
    expect(partnerSidebarGroupContaining('availability')).toBeNull();
    expect(partnerSidebarGroupContaining('pickup')?.id).toBe('bookings');
  });

  it('exposes a single real Reservations surface as a leaf, not a one-item accordion', () => {
    expect(PARTNER_NAV_RESERVATIONS_CHILDREN.map((i) => i.id)).toEqual(['reservations']);
    const entry = PARTNER_SIDEBAR_PRIMARY.find((e) => e.id === 'reservations');
    expect(entry?.kind).toBe('item');
    expect(partnerSidebarGroupContaining('reservations')).toBeNull();
  });

  it('keeps Help and Settings in the footer, not mixed with ops', () => {
    expect(PARTNER_SIDEBAR_FOOTER.map((i) => i.id)).toEqual(['help', 'business-profile']);
  });

  it('keeps Offers discoverable and omits bottom-primary duplicates from More', () => {
    expect(PARTNER_NAV_OFFERS.id).toBe('discounts');
    expect(PARTNER_SIDEBAR_PRIMARY.some((e) => e.id === 'discounts')).toBe(true);
    const moreIds = PARTNER_MORE_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    expect(moreIds).toContain('discounts');
    expect(moreIds).toContain('inbox');
    expect(moreIds).toContain('pickup');
    expect(moreIds).toContain('help');
    expect(moreIds).toContain('account-settings');
    expect(moreIds).toContain('earnings');
    // Bottom primary destinations stay off the More list to avoid dual paths.
    for (const id of PARTNER_PRIMARY_NAV_SECTION_IDS) {
      expect(moreIds).not.toContain(id);
    }
  });

  it('aligns section titles with nav labels for Calendar and Income', () => {
    expect(partnerSectionTitle('availability')).toBe('Calendar');
    expect(partnerSectionTitle('earnings')).toBe('Income');
    expect(partnerSectionTitle('pickup')).toBe('Pickups');
  });
});
