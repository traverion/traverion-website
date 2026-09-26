import { describe, expect, it } from 'vitest';
import type { ListingBookingOption } from '../types/listingExtras';
import type { TourPackage } from '../types/tour';
import {
  optionFulfillmentPlaceMeta,
  resolveTourPickupMeetingDisplay,
} from './tour-pickup-meeting';

function option(partial: Partial<ListingBookingOption> & Pick<ListingBookingOption, 'id' | 'name'>): ListingBookingOption {
  return {
    priceUsd: 100,
    startTime: '20:30',
    duration: '4 hours',
    pickupPlace: '',
    minPersons: 1,
    maxPersons: 8,
    maxSpotsPerSlot: 8,
    optionInfo: '',
    weekdays: [true, true, true, true, true, true, true],
    availabilityDateFrom: '',
    availabilityDateTo: '',
    ...partial,
  };
}

function tour(partial: Partial<TourPackage> = {}): TourPackage {
  return {
    id: 't1',
    title: 'Northern Lights',
    description: 'x'.repeat(120),
    city: 'Rovaniemi',
    country: 'Finland',
    images: [],
    highlights: [],
    includes: [],
    excludes: [],
    duration: '4 hours',
    ...partial,
  } as TourPackage;
}

describe('optionFulfillmentPlaceMeta', () => {
  it('labels pickup vs meet when fulfillment is set', () => {
    expect(optionFulfillmentPlaceMeta('pickup', 'Hotel lobby')).toBe('Pickup · Hotel lobby');
    expect(optionFulfillmentPlaceMeta('meeting_point', 'City square')).toBe('Meet · City square');
    expect(optionFulfillmentPlaceMeta(undefined, 'Legacy place')).toBe('Legacy place');
    expect(optionFulfillmentPlaceMeta('pickup', '  ')).toBeNull();
  });
});

describe('resolveTourPickupMeetingDisplay', () => {
  it('uses selected option fulfillment and place over listing denormalization', () => {
    const pickupOpt = option({
      id: 'a',
      name: 'Hotel pickup',
      fulfillment: 'pickup',
      pickupPlace: 'Santa Claus Village hotel zone',
      optionInfo: 'Be ready 15 minutes early',
    });
    const meetOpt = option({
      id: 'b',
      name: 'Meeting point',
      fulfillment: 'meeting_point',
      pickupPlace: 'Rovaniemi railway station main entrance',
    });
    const pkg = tour({
      meetingPoint: 'First option denormalized place',
      pickupInstructions: 'First option denormalized note',
      experienceStartStyle: 'either_available',
      listingExtras: { bookingOptions: [pickupOpt, meetOpt] },
    });

    const selected = resolveTourPickupMeetingDisplay(pkg, meetOpt);
    expect(selected.optionScoped).toBe(true);
    expect(selected.optionName).toBe('Meeting point');
    expect(selected.placeLabel).toBe('Meeting point');
    expect(selected.place).toBe('Rovaniemi railway station main entrance');
    expect(selected.modeIntro).toMatch(/meeting point/i);
    expect(selected.place).not.toBe(pkg.meetingPoint);

    const selectedPickup = resolveTourPickupMeetingDisplay(pkg, pickupOpt);
    expect(selectedPickup.placeLabel).toBe('Pickup area');
    expect(selectedPickup.place).toBe('Santa Claus Village hotel zone');
    expect(selectedPickup.instructions).toBe('Be ready 15 minutes early');
  });

  it('hints when multiple options differ and none is selected', () => {
    const pkg = tour({
      meetingPoint: 'Default meet',
      experienceStartStyle: 'either_available',
      listingExtras: {
        bookingOptions: [
          option({
            id: 'a',
            name: 'Pickup',
            fulfillment: 'pickup',
            pickupPlace: 'Hotel A',
          }),
          option({
            id: 'b',
            name: 'Meet',
            fulfillment: 'meeting_point',
            pickupPlace: 'Square B',
          }),
        ],
      },
    });
    const d = resolveTourPickupMeetingDisplay(pkg, null);
    expect(d.optionScoped).toBe(false);
    expect(d.multiOptionHint).toMatch(/depend on the option/i);
    expect(d.place).toBe('Default meet');
  });
});
