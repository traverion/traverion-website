import { describe, expect, it } from 'vitest';
import {
  buildPurchaseSnapshot,
  displayListingTitleFromPurchase,
  displayMeetingPointFromPurchase,
  displayOptionLabelFromPurchase,
  isPurchaseSnapshot,
} from './purchase-snapshot';

describe('purchase-snapshot', () => {
  it('builds a trimmed commercial snapshot', () => {
    const snap = buildPurchaseSnapshot({
      listingTitle: '  Aurora walk  ',
      optionLabel: ' Evening ',
      meetingPoint: ' Dock A ',
      pickupInstructions: '  Be ready  ',
      startTimeHm: '20:00',
      capturedAt: '2026-09-22T00:00:00.000Z',
    });
    expect(snap).toEqual({
      listingTitle: 'Aurora walk',
      optionLabel: 'Evening',
      meetingPoint: 'Dock A',
      pickupInstructions: 'Be ready',
      startTimeHm: '20:00',
      capturedAt: '2026-09-22T00:00:00.000Z',
    });
    expect(isPurchaseSnapshot(snap)).toBe(true);
  });

  it('prefers snapshot over live listing rewrites', () => {
    const snap = buildPurchaseSnapshot({
      listingTitle: 'Purchased title',
      optionLabel: 'Morning',
      meetingPoint: 'Old dock',
      capturedAt: '2026-09-22T00:00:00.000Z',
    });
    expect(displayListingTitleFromPurchase(snap, 'Renamed listing')).toBe('Purchased title');
    expect(displayOptionLabelFromPurchase(snap, 'New option name')).toBe('Morning');
    expect(displayMeetingPointFromPurchase(snap, 'New dock')).toBe('Old dock');
  });

  it('falls back to live copy when snapshot missing', () => {
    expect(displayListingTitleFromPurchase(null, 'Live tour', 'Booking')).toBe('Live tour');
    expect(displayOptionLabelFromPurchase(undefined, 'Live option')).toBe('Live option');
    expect(displayMeetingPointFromPurchase({}, 'Live meet')).toBe('Live meet');
  });

  it('preserves Unicode titles and option labels', () => {
    const snap = buildPurchaseSnapshot({
      listingTitle: 'オーロラ · Rovaniemi — 北極光',
      optionLabel: '夕暮れ 20:00',
      meetingPoint: '駅前 · Café',
      capturedAt: '2026-09-22T00:00:00.000Z',
    });
    expect(displayListingTitleFromPurchase(snap, 'ASCII')).toContain('オーロラ');
    expect(displayOptionLabelFromPurchase(snap, '')).toContain('夕暮れ');
    expect(displayMeetingPointFromPurchase(snap, '')).toContain('Café');
  });
});
