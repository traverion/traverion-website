import { describe, expect, it } from 'vitest';
import {
  resolveOptionFieldsForSnapshot,
  resolvePickupInstructionsForSnapshot,
  resolveCancellationPolicyForSnapshot,
  resolveStayFieldsForSnapshot,
  TRAVERION_STANDARD_CANCELLATION_POLICY,
} from '../../supabase/functions/_shared/purchase-snapshot.ts';
import {
  buildPurchaseSnapshot,
  displayListingTitleFromPurchase,
  displayMeetingPointFromPurchase,
  displayPickupInstructionsFromPurchase,
  displayOptionLabelFromPurchase,
  displayStartTimeFromPurchase,
  displayDepartureTimezoneFromPurchase,
  formatTripDepartureWithTimezone,
  displayCheckInAddressFromPurchase,
  displayDurationFromPurchase,
  displayCancellationPolicyFromPurchase,
  displayFulfillmentFromPurchase,
  displayStayCheckInTimeFromPurchase,
  displayStayCheckOutTimeFromPurchase,
  displayStayHouseRulesFromPurchase,
  displayIncludesFromPurchase,
  displayExcludesFromPurchase,
  isPurchaseSnapshot,
  partnerOpsDepartureDisplay,
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

  it('does not resurrect live meeting/pickup when snapshot exists but fields are empty', () => {
    const snap = buildPurchaseSnapshot({
      listingTitle: 'Purchased title',
      capturedAt: '2026-09-22T00:00:00.000Z',
    });
    expect(displayMeetingPointFromPurchase(snap, 'LIVE EDITED DOCK')).toBe('');
    expect(displayPickupInstructionsFromPurchase(snap, 'LIVE EDITED INSTRUCTIONS')).toBe('');
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
    expect(
      displayStartTimeFromPurchase(
        { listingTitle: 'Tour', capturedAt: 't', startTimeHm: '' },
        '09:30'
      )
    ).toBe('');
    expect(
      displayDurationFromPurchase({ listingTitle: 'Tour', capturedAt: 't' }, 'edited live')
    ).toBe('');
    expect(
      displayOptionLabelFromPurchase({ listingTitle: 'Tour', capturedAt: 't' }, 'Live option')
    ).toBe('');
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

  it('records termsAcceptedAt when provided at checkout', () => {
    const snap = buildPurchaseSnapshot({
      listingTitle: 'Tour',
      termsAcceptedAt: '2026-09-27T12:00:00.000Z',
      capturedAt: '2026-09-27T12:00:00.000Z',
    });
    expect(snap.termsAcceptedAt).toBe('2026-09-27T12:00:00.000Z');
  });
});

describe('resolveOptionFieldsForSnapshot (checkout freeze helpers)', () => {
  it('prefers traveler start instructions over option blurb for the freeze', () => {
    const fields = resolveOptionFieldsForSnapshot({
      listingExtras: {
        bookingOptions: [
          {
            id: 'opt-a',
            pickupPlace: 'Hotel zone',
            optionInfo: 'Small group · English guide',
            travelerStartInstructions: 'Wait outside the lobby 10 minutes early. Look for Van B.',
            duration: '4 hours',
            fulfillment: 'pickup',
            schedules: [
              {
                id: 'sch-sep',
                status: 'ready',
                availabilityDateFrom: '2026-09-01',
                availabilityDateTo: '2026-09-30',
                startTime: '20:30',
                weekdays: [true, true, true, true, true, true, true],
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
    expect(fields.travelerStartInstructions).toBe(
      'Wait outside the lobby 10 minutes early. Look for Van B.'
    );

    // Phase 1287: empty availabilityDateFrom must not freeze a scheduleId.
    expect(
      resolveOptionFieldsForSnapshot({
        listingExtras: {
          bookingOptions: [
            {
              id: 'opt-a',
              schedules: [
                {
                  id: 'sch-open',
                  status: 'ready',
                  availabilityDateFrom: '',
                  availabilityDateTo: '2026-12-31',
                  startTime: '20:30',
                },
              ],
            },
          ],
        },
        optionId: 'opt-a',
        bookingDate: '2026-09-15',
        startTimeHm: '20:30',
      }).scheduleId
    ).toBeNull();
    expect(
      resolvePickupInstructionsForSnapshot({
        travelerStartInstructions: fields.travelerStartInstructions,
        optionInfo: fields.optionInfo,
        listingPickupInstructions: 'Listing-level note',
      })
    ).toBe('Wait outside the lobby 10 minutes early. Look for Van B.');
  });

  it('falls back to legacy optionInfo when travelerStartInstructions is absent', () => {
    expect(
      resolvePickupInstructionsForSnapshot({
        optionInfo: 'Van B — look for Traverion',
        listingPickupInstructions: 'Listing-level note',
      })
    ).toBe('Van B — look for Traverion');
  });

  it('freezes STANDARD cancellation when listing column is blank', () => {
    expect(resolveCancellationPolicyForSnapshot(null)).toBe(TRAVERION_STANDARD_CANCELLATION_POLICY);
    expect(resolveCancellationPolicyForSnapshot('  ')).toBe(TRAVERION_STANDARD_CANCELLATION_POLICY);
    expect(resolveCancellationPolicyForSnapshot('Custom non-refundable.')).toBe('Custom non-refundable.');
  });

  it('surfaces snapshotted departure timezone for Trips clock copy', () => {
    const snap = buildPurchaseSnapshot({
      listingTitle: 'Aurora',
      startTimeHm: '20:00',
      departureTimezone: 'Europe/Helsinki',
      capturedAt: '2026-09-22T00:00:00.000Z',
    });
    expect(displayDepartureTimezoneFromPurchase(snap)).toBe('Europe/Helsinki');
    expect(formatTripDepartureWithTimezone('20:00', 'Europe/Helsinki')).toBe(
      '20:00 · Europe/Helsinki local'
    );
    expect(formatTripDepartureWithTimezone('20:00', null)).toBe('20:00');
    expect(displayDepartureTimezoneFromPurchase({ listingTitle: 'x', capturedAt: 't' })).toBeNull();
  });

  it('freezes stay check-in address onto the purchase snapshot for Trips', () => {
    const snap = buildPurchaseSnapshot({
      listingTitle: 'Riverside loft',
      checkIn: '2026-11-01',
      checkOut: '2026-11-03',
      nights: 2,
      checkInAddress: '  Kauppakatu 12 A 4, 96200 Rovaniemi  ',
      capturedAt: '2026-09-22T00:00:00.000Z',
    });
    expect(snap.checkInAddress).toBe('Kauppakatu 12 A 4, 96200 Rovaniemi');
    expect(displayCheckInAddressFromPurchase(snap)).toBe('Kauppakatu 12 A 4, 96200 Rovaniemi');
  });

  it('freezes stay house check-in/out times onto the purchase snapshot', () => {
    const fields = resolveStayFieldsForSnapshot({
      listingExtras: {
        stay: {
          checkInTime: '16:00',
          checkOutTime: '11:00',
          checkInAddress: 'Kauppakatu 1',
          houseRules: 'No parties after 22:00. Quiet hours apply.',
        },
      },
      checkIn: '2026-12-01',
      checkOut: '2026-12-03',
      nights: 2,
    });
    expect(fields.checkInTime).toBe('16:00');
    expect(fields.checkOutTime).toBe('11:00');
    expect(fields.houseRules).toMatch(/No parties/);
    const snap = buildPurchaseSnapshot({
      listingTitle: 'Cabin',
      checkIn: fields.checkIn,
      checkOut: fields.checkOut,
      checkInTime: fields.checkInTime,
      checkOutTime: fields.checkOutTime,
      houseRules: fields.houseRules,
      capturedAt: '2026-09-22T00:00:00.000Z',
    });
    expect(displayStayCheckInTimeFromPurchase(snap, '18:00')).toBe('16:00');
    expect(displayStayCheckOutTimeFromPurchase(snap, '10:00')).toBe('11:00');
    expect(displayStayHouseRulesFromPurchase(snap)).toMatch(/No parties/);
  });

  it('freezes includes and excludes so listing edits cannot rewrite Trips', () => {
    const snap = buildPurchaseSnapshot({
      listingTitle: 'Aurora',
      includes: ['  Hot drink  ', '', 'Guide'],
      excludes: ['Hotel pickup'],
      capturedAt: '2026-09-22T00:00:00.000Z',
    });
    expect(snap.includes).toEqual(['Hot drink', 'Guide']);
    expect(snap.excludes).toEqual(['Hotel pickup']);
    expect(displayIncludesFromPurchase(snap)).toEqual(['Hot drink', 'Guide']);
    expect(displayExcludesFromPurchase(snap)).toEqual(['Hotel pickup']);
    expect(displayIncludesFromPurchase({ listingTitle: 'x', capturedAt: 't' })).toEqual([]);
  });
});
