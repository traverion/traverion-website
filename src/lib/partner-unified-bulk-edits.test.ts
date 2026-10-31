import { describe, expect, it } from 'vitest';
import {
  classifyRentalBlocksForUnblock,
  partnerUnifiedBulkActionsForFamily,
  previewPartnerUnifiedBulk,
} from './partner-unified-bulk-edits';
import type { TourPackage } from '../types/tour';

function tourListing(): TourPackage {
  return {
    id: 'tour-1',
    title: 'Aurora Tour',
    listingExtras: {
      bookingOptions: [
        {
          id: 'opt-a',
          name: 'Morning',
          availabilityDateFrom: '2026-10-01',
          availabilityDateTo: '2026-10-31',
          weekdays: [true, true, true, true, true, true, true],
          startTime: '09:00',
          maxSpotsPerSlot: 8,
        },
        {
          id: 'opt-b',
          name: 'Evening',
          availabilityDateFrom: '2026-10-01',
          availabilityDateTo: '2026-10-31',
          weekdays: [true, true, true, true, true, true, true],
          startTime: '20:00',
          maxSpotsPerSlot: 8,
        },
      ],
    },
  } as unknown as TourPackage;
}

function stayListing(): TourPackage {
  return {
    id: 'stay-1',
    title: 'Cabin',
    listingExtras: { inventoryFamily: 'stay' },
  } as unknown as TourPackage;
}

describe('partner-unified-bulk-edits', () => {
  it('lists category-specific actions', () => {
    expect(partnerUnifiedBulkActionsForFamily('tour').map((a) => a.value)).toEqual([
      'close',
      'reopen',
      'change_capacity',
      'change_cutoff',
    ]);
    expect(partnerUnifiedBulkActionsForFamily('stay').map((a) => a.value)).toEqual([
      'block',
      'unblock',
    ]);
    expect(partnerUnifiedBulkActionsForFamily('rental').map((a) => a.value)).toContain(
      'adjust_stock'
    );
  });

  it('refuses tour day close when a single option is selected', () => {
    const preview = previewPartnerUnifiedBulk({
      listing: tourListing(),
      action: 'close',
      fromIso: '2026-10-10',
      toIso: '2026-10-12',
      optionId: 'opt-a',
      bookings: [],
    });
    expect(preview.canApply).toBe(false);
    expect(preview.blockReason).toMatch(/whole listing day/i);
  });

  it('previews capacity changes only for the selected option departures', () => {
    const all = previewPartnerUnifiedBulk({
      listing: tourListing(),
      action: 'change_capacity',
      fromIso: '2026-10-10',
      toIso: '2026-10-11',
      optionId: null,
      capacity: 6,
      bookings: [],
    });
    expect(all.canApply).toBe(true);
    expect(all.departureTouchCount).toBe(4); // 2 days × 2 options

    const one = previewPartnerUnifiedBulk({
      listing: tourListing(),
      action: 'change_capacity',
      fromIso: '2026-10-10',
      toIso: '2026-10-11',
      optionId: 'opt-a',
      capacity: 6,
      bookings: [],
    });
    expect(one.departureTouchCount).toBe(2);
    expect(one.summary).toMatch(/capacity 6/);
  });

  it('skips occupied stay nights when previewing block', () => {
    const preview = previewPartnerUnifiedBulk({
      listing: stayListing(),
      action: 'block',
      fromIso: '2026-10-10',
      toIso: '2026-10-12',
      optionId: null,
      bookings: [
        {
          id: 'b1',
          listing_id: 'stay-1',
          status: 'confirmed',
          payment_status: 'paid',
          booking_date: '2026-10-10',
          check_out: '2026-10-12',
          guests: 2,
        },
      ],
      caps: [],
      nowMs: Date.parse('2026-10-01T12:00:00Z'),
    });
    expect(preview.skipped.some((s) => s.iso === '2026-10-10')).toBe(true);
    expect(preview.skipped.some((s) => s.iso === '2026-10-11')).toBe(true);
    expect(preview.applyDates).toContain('2026-10-12');
  });

  it('classifies exact rental day blocks as deletable and multi-day as skipped', () => {
    const result = classifyRentalBlocksForUnblock({
      fromIso: '2026-10-15',
      toIso: '2026-10-16',
      optionId: 'v1',
      blocks: [
        {
          id: 'exact',
          listing_id: 'r1',
          variant_id: 'v1',
          starts_at: '2026-10-15T00:00:00.000Z',
          ends_at: '2026-10-16T00:00:00.000Z',
          note: null,
          created_at: '',
        },
        {
          id: 'multi',
          listing_id: 'r1',
          variant_id: 'v1',
          starts_at: '2026-10-14T00:00:00.000Z',
          ends_at: '2026-10-20T00:00:00.000Z',
          note: null,
          created_at: '',
        },
      ],
    });
    expect(result.deletableIds).toContain('exact');
    expect(result.deletableIds).not.toContain('multi');
    expect(result.skippedDates).toContain('2026-10-16');
  });
});
