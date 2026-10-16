import { describe, expect, it } from 'vitest';
import { optionLogisticsLines } from './option-logistics';
import { bookingOptionMeetingIssues } from './listing-option-validation';
import { normalizeListingBookingOption } from '../types/listingExtras';
import { buildPurchaseSnapshot } from './purchase-snapshot';

describe('option logistics', () => {
  it('describes a pickup window without inventing a clock time', () => {
    expect(
      optionLogisticsLines({
        fulfillment: 'pickup',
        pickupTiming: 'before_start',
        pickupWindowMinutes: 30,
        pickupTimeConfirmation: 'day_before',
        dropoffMode: 'none',
        transportMode: 'minivan',
      })
    ).toEqual([
      'Pickup window: up to 30 minutes before departure.',
      'The exact pickup time is confirmed the day before the activity.',
      'Transport: Minivan',
    ]);
  });

  it('states drop-off only when the option has one', () => {
    expect(optionLogisticsLines({ dropoffMode: 'none' })).toEqual([]);
    expect(optionLogisticsLines({ dropoffMode: 'same' })).toEqual(['Drop-off is at the same place.']);
    expect(optionLogisticsLines({ dropoffMode: 'different', dropoffPlace: 'Santa Claus Village' })).toEqual([
      'Drop-off: Santa Claus Village',
    ]);
  });

  it('keeps a legacy name-only pickup valid and requires a radius once a center exists', () => {
    const legacy = normalizeListingBookingOption(
      {
        id: 'legacy',
        name: 'Small group',
        priceUsd: 119,
        startTime: '18:30',
        duration: '4 hours',
        pickupPlace: 'Arctic city',
        travelerStartInstructions: 'Meet us 15 min before the departure time',
        fulfillment: 'pickup',
        minPersons: 1,
        maxPersons: 16,
        maxSpotsPerSlot: 16,
        weekdays: [true, true, true, true, true, true, true],
      },
      'legacy'
    );
    expect(bookingOptionMeetingIssues(legacy)).toEqual([]);
    const centered = {
      ...legacy,
      pickupPlaceId: 'place-1',
      pickupCenterLat: 66.5,
      pickupCenterLng: 25.7,
    };
    expect(bookingOptionMeetingIssues(centered)).toEqual(['Set the pickup radius.']);
  });

  it('freezes timing and drop-off onto the purchase snapshot', () => {
    const snap = buildPurchaseSnapshot({
      listingTitle: 'Northern lights',
      fulfillment: 'pickup',
      pickupTiming: 'at_start',
      dropoffMode: 'different',
      dropoffPlace: 'Airport',
      transportMode: 'car',
    });
    expect(snap.pickupTiming).toBe('at_start');
    expect(snap.dropoffMode).toBe('different');
    expect(snap.dropoffPlace).toBe('Airport');
    expect(snap.transportMode).toBe('car');
    expect(optionLogisticsLines(snap)).toEqual([
      'Pickup is at the departure time.',
      'Drop-off: Airport',
      'Transport: Car',
    ]);
  });
});
