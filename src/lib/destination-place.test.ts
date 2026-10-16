import { describe, expect, it } from 'vitest';
import type { ListingBookingOption } from '../types/listingExtras';
import { pickupAreaFromOption, travelerPickupAllowed } from './pickup-area';
import {
  customPickupCenterPatch,
  pickupFulfillmentPatch,
  syncLinkedPickupCenters,
  travelerDestinationLabel,
  verifiedDestination,
  type VerifiedDestination,
} from './destination-place';

const rovaniemi: VerifiedDestination = {
  placeId: 'place-rovaniemi',
  city: 'Rovaniemi',
  country: 'Finland',
  countryCode: 'FI',
  formatted: 'Rovaniemi, Finland',
  lat: 66.5039,
  lng: 25.7294,
};

const helsinki: VerifiedDestination = {
  ...rovaniemi,
  placeId: 'place-helsinki',
  city: 'Helsinki',
  formatted: 'Helsinki, Finland',
  lat: 60.1699,
  lng: 24.9384,
};

function option(patch: Partial<ListingBookingOption> = {}): ListingBookingOption {
  return {
    id: 'opt-1',
    name: 'Small group',
    priceUsd: 119,
    startTime: '18:30',
    duration: '5 hours',
    pickupPlace: 'Arctic city',
    minPersons: 1,
    maxPersons: 16,
    maxSpotsPerSlot: 16,
    optionInfo: '',
    weekdays: [true, true, true, true, true, true, true],
    availabilityDateFrom: '',
    availabilityDateTo: '',
    fulfillment: 'pickup',
    ...patch,
  };
}

describe('destination place', () => {
  it('formats the traveler destination as City, Country', () => {
    expect(travelerDestinationLabel('Rovaniemi', 'Finland')).toBe('Rovaniemi, Finland');
    expect(verifiedDestination({ ...rovaniemi, formatted: 'ignored' })?.formatted).toBe('Rovaniemi, Finland');
    expect(verifiedDestination({ city: 'Rovaniemi', country: 'Finland' })).toBeNull();
  });

  it('initializes a new pickup option from the destination and does not invent a radius', () => {
    const patch = pickupFulfillmentPatch(option({ fulfillment: undefined, pickupPlace: '' }), rovaniemi);
    expect(patch.pickupPlace).toBe('Rovaniemi, Finland');
    expect(patch.pickupCenterLat).toBe(rovaniemi.lat);
    expect(patch.pickupCenterSource).toBe('destination');
    expect(patch.pickupRadiusKm).toBeUndefined();
    expect(pickupFulfillmentPatch(option(), rovaniemi)).toEqual({ fulfillment: 'pickup' });
  });

  it('keeps a manual center when the destination changes', () => {
    const linked = option({
      ...pickupFulfillmentPatch(option({ fulfillment: undefined, pickupPlace: '' }), rovaniemi),
      pickupRadiusKm: 15,
    });
    const custom = option({
      id: 'opt-2',
      ...customPickupCenterPatch(
        {
          placeId: 'place-apukka',
          name: 'Apukka Resort',
          formattedAddress: 'Tutkijantie 28, Rovaniemi',
          lat: 66.57836,
          lng: 26.0154,
        },
        rovaniemi
      ),
      pickupRadiusKm: 12,
    });
    const legacy = option({ id: 'opt-3', pickupPlace: 'Arctic city' });
    const next = syncLinkedPickupCenters([linked, custom, legacy], rovaniemi.placeId, helsinki);
    expect(next[0].pickupPlace).toBe('Helsinki, Finland');
    expect(next[0].pickupCenterLinkedPlaceId).toBe(helsinki.placeId);
    expect(next[0].pickupRadiusKm).toBe(15);
    expect(next[1].pickupPlaceId).toBe('place-apukka');
    expect(next[1].pickupCenterSource).toBe('custom');
    expect(next[2].pickupPlace).toBe('Arctic city');
    expect(next[2].pickupCenterLat).toBeUndefined();
  });

  it('accepts a customer point inside a center inherited from the destination', () => {
    const inherited = option({
      ...pickupFulfillmentPatch(option({ fulfillment: undefined, pickupPlace: '' }), rovaniemi),
      pickupRadiusKm: 20,
    });
    const area = pickupAreaFromOption(inherited);
    const decision = travelerPickupAllowed({
      fulfillment: 'pickup',
      area,
      point: {
        lat: 66.51,
        lng: 25.74,
        placeId: 'hotel-1',
        formattedAddress: 'Hotel in Rovaniemi',
        name: 'Hotel',
      },
    });
    expect(decision.ok).toBe(true);
  });
});
