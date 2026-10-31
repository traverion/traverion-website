import { describe, expect, it } from 'vitest';
import {
  partnerUnifiedDayBoundsUtc,
  partnerUnifiedTourDayIsClosed,
  partnerUnifiedRentalDayVariants,
  PARTNER_UNIFIED_UNSUPPORTED_ACTIONS,
} from './partner-unified-day-edits';
import type { TourPackage } from '../types/tour';

describe('partner-unified-day-edits', () => {
  it('builds half-open UTC day bounds for rental blocks', () => {
    const b = partnerUnifiedDayBoundsUtc('2026-10-15');
    expect(b.startIso).toBe('2026-10-15T00:00:00.000Z');
    expect(b.endIso).toBe('2026-10-16T00:00:00.000Z');
    expect(b.endMs).toBeGreaterThan(b.startMs);
  });

  it('detects closed tour days from capacity 0 rows', () => {
    expect(
      partnerUnifiedTourDayIsClosed(
        [{ available_date: '2026-10-15', capacity: 0 }],
        '2026-10-15'
      )
    ).toBe(true);
    expect(
      partnerUnifiedTourDayIsClosed(
        [{ available_date: '2026-10-15', capacity: 8 }],
        '2026-10-15'
      )
    ).toBe(false);
    expect(partnerUnifiedTourDayIsClosed([], '2026-10-15')).toBe(false);
  });

  it('marks exact single-day rental blocks as deletable and multi-day as unsupported', () => {
    const listing = {
      id: 'r1',
      title: 'Camera',
      listingExtras: {
        inventoryFamily: 'rental',
        rental: {
          variants: [{ id: 'v1', name: 'A7 IV', quantity: 1 }],
          bufferMinutes: 0,
        },
      },
    } as unknown as TourPackage;

    const exact = partnerUnifiedRentalDayVariants({
      listing,
      iso: '2026-10-15',
      blocks: [
        {
          id: 'b-exact',
          listing_id: 'r1',
          variant_id: 'v1',
          starts_at: '2026-10-15T00:00:00.000Z',
          ends_at: '2026-10-16T00:00:00.000Z',
          note: null,
          created_by: null,
          created_at: '',
        },
      ],
      holds: [],
    });
    expect(exact[0]?.exactBlockIds).toEqual(['b-exact']);
    expect(exact[0]?.multiDayBlock).toBe(false);
    expect(exact[0]?.blocked).toBe(true);

    const multi = partnerUnifiedRentalDayVariants({
      listing,
      iso: '2026-10-15',
      blocks: [
        {
          id: 'b-multi',
          listing_id: 'r1',
          variant_id: 'v1',
          starts_at: '2026-10-14T00:00:00.000Z',
          ends_at: '2026-10-17T00:00:00.000Z',
          note: null,
          created_by: null,
          created_at: '',
        },
      ],
      holds: [],
    });
    expect(multi[0]?.exactBlockIds).toEqual([]);
    expect(multi[0]?.multiDayBlock).toBe(true);
    expect(PARTNER_UNIFIED_UNSUPPORTED_ACTIONS.rentalMultiDayUnblockSplit).toMatch(/multi-day/i);
  });
});
