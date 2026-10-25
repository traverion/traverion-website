import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  filterTourAvailabilityListings,
  listingIsStayForCalendarDesk,
  partnerCalendarDeskPath,
  PARTNER_STAY_CALENDAR_PATH,
} from '../../lib/partner-calendar-desk-path';

describe('Tour availability vs Stay Calendar separation', () => {
  it('keeps Stay products out of the tour Product dropdown', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierAvailability.tsx'), 'utf8');
    expect(src).toContain('filterTourAvailabilityListings');
    expect(src).toContain('tourListings.map');
    expect(src).toContain('openSupplierStayCalendar');
    expect(src).toContain('selectedListingIsStay');
    expect(src).toContain('const stayCalendar = false');
    expect(src).toContain('No tour products yet');
    // Must not auto-select a sole Stay as the tour product.
    expect(src).toContain('tours.length === 1');
    expect(src).not.toMatch(/mine\.length === 1\) return mine\[0\]/);
  });

  it('routes owned Stay listing deep-links to Stay Calendar', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierAvailability.tsx'), 'utf8');
    expect(src).toContain('listingIsStayForCalendarDesk(hit)');
    expect(src).toContain('openSupplierStayCalendar(listingId');
    expect(
      partnerCalendarDeskPath({ isStay: true, listingId: 'stay-abc', from: '2026-10-21' })
    ).toBe(`${PARTNER_STAY_CALENDAR_PATH}?listing=stay-abc&from=2026-10-21`);
  });

  it('filters by inventory family, not product title', () => {
    const arcticStay = {
      id: '1',
      title: 'Arctic Aurora Apartment',
      listingExtras: { inventoryFamily: 'stay' as const },
    };
    const lightsTour = {
      id: '2',
      title: 'Rovaniemi: Northern Lights Guarantee',
      experienceKind: 'tour' as const,
    };
    const thermalRental = {
      id: '3',
      title: 'Thermal Overall Rental',
      listingExtras: { inventoryFamily: 'rental' as const },
    };
    expect(listingIsStayForCalendarDesk(arcticStay)).toBe(true);
    expect(listingIsStayForCalendarDesk(lightsTour)).toBe(false);
    expect(
      filterTourAvailabilityListings([arcticStay, lightsTour, thermalRental]).map((l) => l.id)
    ).toEqual(['2']);
  });

  it('opens the correct calendar desk from Listings actions', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierListings.tsx'), 'utf8');
    expect(src).toContain('openSupplierStayCalendar');
    expect(src).toContain('openSupplierRentalCalendar');
    expect(src).toContain("family === 'stay'");
    expect(src).toContain("family === 'rental'");
  });
});
