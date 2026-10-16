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
    expect(optionLogisticsLines({ dropoffMode: 'none', transportMode: 'none' })).toEqual([]);
    expect(optionLogisticsLines({ dropoffMode: 'same' })).toEqual(['Drop-off is at the same place.']);
    expect(optionLogisticsLines({ dropoffMode: 'different', dropoffPlace: 'Santa Claus Village' })).toEqual([
      'Drop-off: Santa Claus Village',
    ]);
    expect(optionLogisticsLines({ transportMode: 'other', transportOther: 'Snowmobile' })).toEqual([
      'Transport: Snowmobile',
    ]);
  });

  it('keeps a saved vehicle and does not require one for a meeting point', () => {
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
    expect(bookingOptionMeetingIssues(legacy)).toContain('Choose the transport vehicle.');
    expect(bookingOptionMeetingIssues({ ...legacy, transportMode: 'bus' })).toEqual([]);
    expect(normalizeListingBookingOption({ ...legacy, transportMode: 'bus' }, 'legacy').transportMode).toBe('bus');
    const meeting = normalizeListingBookingOption(
      {
        ...legacy,
        fulfillment: 'meeting_point',
        pickupPlace: 'Maakuntakatu 29, Rovaniemi',
        transportMode: undefined,
      },
      'legacy'
    );
    expect(meeting.transportMode).toBeUndefined();
    expect(bookingOptionMeetingIssues(meeting)).toEqual([]);
    expect(bookingOptionMeetingIssues({ ...meeting, transportMode: 'none' })).toEqual([]);
    expect(bookingOptionMeetingIssues({ ...legacy, transportMode: 'other' })).toEqual(['Describe the vehicle.']);
    expect(
      bookingOptionMeetingIssues({ ...legacy, transportMode: 'other', transportOther: 'Snowmobile' })
    ).toEqual([]);
    const centered = {
      ...legacy,
      transportMode: 'car' as const,
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
