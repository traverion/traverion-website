import { describe, expect, it } from 'vitest';
import {
  buildPurchaseSnapshot,
  displayListingTitleFromPurchase,
  displayMeetingPointFromPurchase,
  displayOptionLabelFromPurchase,
  displayStartTimeFromPurchase,
  displayDurationFromPurchase,
  displayCancellationPolicyFromPurchase,
  displayFulfillmentFromPurchase,
  isPurchaseSnapshot,
  partnerOpsDepartureDisplay,
} from './purchase-snapshot';
import {
  resolveOptionFieldsForSnapshot,
  resolvePickupInstructionsForSnapshot,
} from '../../supabase/functions/_shared/purchase-snapshot.ts';

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

  it('freezes duration, fulfillment, cancellation, and money fields', () => {
    const snap = buildPurchaseSnapshot({
      listingTitle: 'NL tour',
      duration: ' 4 hours ',
      fulfillment: 'pickup',
      cancellationPolicy: 'Free cancel 24h before start.',
      optionId: 'opt-a',
      scheduleId: 'sch-1',
      currency: 'eur',
      totalAmount: 178.5,
      capturedAt: '2026-09-27T00:00:00.000Z',
    });
    expect(snap.duration).toBe('4 hours');
    expect(snap.fulfillment).toBe('pickup');
    expect(snap.cancellationPolicy).toMatch(/Free cancel/);
    expect(snap.optionId).toBe('opt-a');
    expect(snap.scheduleId).toBe('sch-1');
    expect(snap.currency).toBe('EUR');
    expect(snap.totalAmount).toBe(178.5);
    expect(displayDurationFromPurchase(snap, 'edited live')).toBe('4 hours');
    expect(displayCancellationPolicyFromPurchase(snap, 'new policy')).toMatch(/Free cancel/);
    expect(displayFulfillmentFromPurchase(snap)).toBe('pickup');
  });

  it('freezes stay check-in/out, nights, and property type', () => {
    const snap = buildPurchaseSnapshot({
      listingTitle: 'Lapland cabin',
      checkIn: '2026-12-01',
      checkOut: '2026-12-04',
      nights: 3,
      propertyType: 'Cabin',
      capturedAt: '2026-09-27T00:00:00.000Z',
    });
    expect(snap.checkIn).toBe('2026-12-01');
    expect(snap.checkOut).toBe('2026-12-04');
    expect(snap.nights).toBe(3);
    expect(snap.propertyType).toBe('Cabin');
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

  it('prefers purchased start time over a later ops edit', () => {
    const snap = buildPurchaseSnapshot({
      listingTitle: 'Tour',
      startTimeHm: '08:00',
      capturedAt: '2026-09-22T00:00:00.000Z',
    });
    expect(displayStartTimeFromPurchase(snap, '09:30')).toBe('08:00');
    expect(displayStartTimeFromPurchase(null, '09:30')).toBe('09:30');
  });

  it('partner ops display prefers live start and notes purchased when different', () => {
    const snap = buildPurchaseSnapshot({
      listingTitle: 'Tour',
      startTimeHm: '08:00',
      capturedAt: '2026-09-22T00:00:00.000Z',
    });
    expect(partnerOpsDepartureDisplay(snap, '09:30')).toEqual({
      displayHm: '09:30',
      purchasedNote: 'Purchased 08:00',
    });
    expect(partnerOpsDepartureDisplay(snap, '08:00')).toEqual({
      displayHm: '08:00',
      purchasedNote: null,
    });
    expect(partnerOpsDepartureDisplay(snap, null)).toEqual({
      displayHm: '08:00',
      purchasedNote: null,
    });
  });
});

describe('resolveOptionFieldsForSnapshot (checkout freeze helpers)', () => {
  it('prefers option note and resolves schedule id for the date/time', () => {
    const fields = resolveOptionFieldsForSnapshot({
      listingExtras: {
        bookingOptions: [
          {
            id: 'opt-a',
            pickupPlace: 'Hotel zone',
            optionInfo: 'Van B — look for Traverion',
            duration: '4 hours',
            fulfillment: 'pickup',
            schedules: [
              {
                id: 'sch-sep',
                status: 'ready',
                availabilityDateFrom: '2026-09-01',
                availabilityDateTo: '2026-09-30',
                startTime: '20:30',
              },
            ],
          },
        ],
      },
      optionId: 'opt-a',
      bookingDate: '2026-09-15',
      startTimeHm: '20:30',
    });
    expect(fields.duration).toBe('4 hours');
    expect(fields.fulfillment).toBe('pickup');
    expect(fields.scheduleId).toBe('sch-sep');
    expect(resolvePickupInstructionsForSnapshot({
      optionInfo: fields.optionInfo,
      listingPickupInstructions: 'Listing-level note',
    })).toBe('Van B — look for Traverion');
  });
});
