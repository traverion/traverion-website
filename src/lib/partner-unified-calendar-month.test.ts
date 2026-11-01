import { describe, expect, it } from 'vitest';
import type { PartnerUnifiedCalendarEvent } from './partner-unified-calendar';
import {
  PARTNER_UNIFIED_MONTH_CELL_MAX,
  monthChipLabel,
  monthChipTitle,
  sortMonthCellEvents,
} from './partner-unified-calendar-month';

function ev(
  partial: Partial<PartnerUnifiedCalendarEvent> &
    Pick<PartnerUnifiedCalendarEvent, 'key' | 'kind' | 'category'>
): PartnerUnifiedCalendarEvent {
  return {
    ymd: '2026-11-12',
    listingId: 'l1',
    listingTitle: 'Listing',
    ...partial,
  } as PartnerUnifiedCalendarEvent;
}

describe('partner-unified-calendar-month', () => {
  it('labels rentals with listing name, not option-only Standard', () => {
    const label = monthChipLabel(
      ev({
        key: 'r1',
        kind: 'rental_listing',
        category: 'rental',
        listingTitle: 'Aurora Fatbike',
        optionLabel: 'Standard',
        quantityLabel: '2 free',
      })
    );
    expect(label).toBe('Aurora Fatbike · 2 free');
    expect(label).not.toMatch(/^Standard/);
  });

  it('labels stays with listing + availability', () => {
    expect(
      monthChipLabel(
        ev({
          key: 's1',
          kind: 'stay_listing',
          category: 'stay',
          listingTitle: 'Riverside Apartment',
          quantityLabel: 'Available',
        })
      )
    ).toBe('Riverside Apart… · Available');
  });

  it('labels tours with time, listing, and capacity', () => {
    expect(
      monthChipLabel(
        ev({
          key: 't1',
          kind: 'tour_departure',
          category: 'tour',
          listingTitle: 'Northern Lights',
          timeHm: '20:00',
          bookedCount: 2,
          capacityCount: 8,
        })
      )
    ).toBe('20:00 Northern Lights · 2/8');
  });

  it('hover title keeps option and guest details', () => {
    const title = monthChipTitle(
      ev({
        key: 'r2',
        kind: 'rental_collection',
        category: 'rental',
        listingTitle: 'Aurora Fatbike',
        optionLabel: 'Standard',
        timeHm: '10:00',
        guestName: 'Anna',
        reference: 'TRV-1',
      })
    );
    expect(title).toContain('Aurora Fatbike');
    expect(title).toContain('Standard');
    expect(title).toContain('Anna');
  });

  it('prioritizes bookings/blocked over available presence so stays are not buried', () => {
    const sorted = sortMonthCellEvents([
      ev({
        key: 'avail-stay',
        kind: 'stay_listing',
        category: 'stay',
        listingTitle: 'Cabin',
        quantityLabel: 'Available',
      }),
      ev({
        key: 'avail-rental',
        kind: 'rental_listing',
        category: 'rental',
        listingTitle: 'Bike',
        quantityLabel: '3 free',
      }),
      ev({
        key: 'tour',
        kind: 'tour_departure',
        category: 'tour',
        listingTitle: 'NL Tour',
        timeHm: '20:00',
        bookedCount: 1,
        capacityCount: 8,
      }),
      ev({
        key: 'blocked-stay',
        kind: 'stay_blocked',
        category: 'stay',
        listingTitle: 'Loft',
        quantityLabel: 'Blocked',
      }),
    ]);
    const shown = sorted.slice(0, PARTNER_UNIFIED_MONTH_CELL_MAX).map((e) => e.key);
    expect(shown).toEqual(['tour', 'blocked-stay', 'avail-rental']);
    expect(shown).not.toContain('avail-stay');
    expect(sorted.length - shown.length).toBe(1);
  });
});
