import { describe, expect, it } from 'vitest';
import {
  filterTourAvailabilityListings,
  listingIsStayForCalendarDesk,
  partnerCalendarDeskPath,
  PARTNER_STAY_CALENDAR_PATH,
  PARTNER_TOUR_AVAILABILITY_PATH,
} from './partner-calendar-desk-path';

describe('partner-calendar-desk-path', () => {
  it('classifies stay vs tour from inventory family', () => {
    expect(listingIsStayForCalendarDesk({ listingExtras: { inventoryFamily: 'stay' } })).toBe(true);
    expect(listingIsStayForCalendarDesk({ experienceKind: 'ticket' })).toBe(false);
    expect(listingIsStayForCalendarDesk({})).toBe(false);
  });

  it('filters stay listings out of tour availability products', () => {
    const rows = [
      { id: 't1', experienceKind: 'tour' as const },
      { id: 's1', listingExtras: { inventoryFamily: 'stay' as const } },
      { id: 't2', experienceKind: 'ticket' as const },
    ];
    expect(filterTourAvailabilityListings(rows).map((r) => r.id)).toEqual(['t1', 't2']);
  });

  it('builds stay and tour desk URLs with listing and dates', () => {
    expect(partnerCalendarDeskPath({ isStay: false })).toBe(PARTNER_TOUR_AVAILABILITY_PATH);
    expect(
      partnerCalendarDeskPath({
        isStay: true,
        listingId: 'stay-1',
        from: '2026-10-21',
        to: '2026-10-28',
      })
    ).toBe(`${PARTNER_STAY_CALENDAR_PATH}?listing=stay-1&from=2026-10-21&to=2026-10-28`);
    expect(
      partnerCalendarDeskPath({ isStay: false, listingId: 'tour-1', view: 'week' })
    ).toBe(`${PARTNER_TOUR_AVAILABILITY_PATH}?listing=tour-1&view=week`);
  });
});
