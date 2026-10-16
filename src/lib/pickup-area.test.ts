import { describe, expect, it } from 'vitest';
import {
  checkoutSummaryPickupAddress,
  haversineKm,
  notesWithVerifiedPickup,
  pickupAreaFromOption,
  restoredPickupForOption,
  travelerPickupAllowed,
  PICKUP_OUTSIDE_AREA_MESSAGE,
} from './pickup-area';

const rovaniemi = { lat: 66.5039, lng: 25.7294 };

describe('pickup area', () => {
  it('measures a short distance inside Rovaniemi', () => {
    const km = haversineKm(rovaniemi, { lat: 66.51, lng: 25.74 });
    expect(km).toBeGreaterThan(0.4);
    expect(km).toBeLessThan(2);
  });

  it('does not treat a name-only pickup place as a center', () => {
    expect(
      pickupAreaFromOption({
        fulfillment: 'pickup',
        pickupPlace: 'Arctic City',
      })
    ).toBeNull();
  });

  it('accepts a point inside the radius and rejects one outside', () => {
    const area = pickupAreaFromOption({
      fulfillment: 'pickup',
      pickupPlace: 'Rovaniemi city center',
      pickupCenterLat: rovaniemi.lat,
      pickupCenterLng: rovaniemi.lng,
      pickupRadiusKm: 15,
      pickupPlaceId: 'center-1',
    });
    expect(area).not.toBeNull();
    const inside = travelerPickupAllowed({
      fulfillment: 'pickup',
      area,
      point: {
        ...{ lat: 66.51, lng: 25.74 },
        placeId: 'hotel-1',
        formattedAddress: 'Apukka Resort, Rovaniemi',
        name: 'Apukka Resort',
      },
    });
    expect(inside.ok).toBe(true);
    const outside = travelerPickupAllowed({
      fulfillment: 'pickup',
      area,
      point: {
        lat: 60.17,
        lng: 24.94,
        placeId: 'helsinki',
        formattedAddress: 'Helsinki',
        name: 'Helsinki',
      },
    });
    expect(outside.ok).toBe(false);
    if (!outside.ok) expect(outside.error).toBe(PICKUP_OUTSIDE_AREA_MESSAGE);
  });

  it('replaces a typed place of stay with the verified address', () => {
    expect(notesWithVerifiedPickup('Place of stay: Arctic city\n\nWindow seat', 'Apukka Resort, Rovaniemi')).toBe(
      'Place of stay: Apukka Resort, Rovaniemi\n\nWindow seat'
    );
  });

  it('does not accept free text without a place id', () => {
    const area = pickupAreaFromOption({
      fulfillment: 'pickup',
      pickupCenterLat: rovaniemi.lat,
      pickupCenterLng: rovaniemi.lng,
      pickupRadiusKm: 15,
    });
    const result = travelerPickupAllowed({
      fulfillment: 'pickup',
      area,
      point: { lat: rovaniemi.lat, lng: rovaniemi.lng, placeId: '', formattedAddress: 'Arctic City', name: '' },
    });
    expect(result.ok).toBe(false);
  });

  it('hides a leftover pickup address when the option has no area', () => {
    const leftover = {
      lat: 66.5783616,
      lng: 26.0153995,
      placeId: 'ChIJ-example',
      formattedAddress: 'Apukka Resort, Tutkijantie 28, Rovaniemi',
      name: 'Apukka Resort',
    };
    expect(
      checkoutSummaryPickupAddress({
        fulfillment: 'pickup',
        area: pickupAreaFromOption({ fulfillment: 'pickup', pickupPlace: 'Arctic city' }),
        point: leftover,
      })
    ).toBe('');
    expect(
      checkoutSummaryPickupAddress({
        fulfillment: 'pickup',
        area: pickupAreaFromOption({
          fulfillment: 'pickup',
          pickupPlace: 'Rovaniemi city center',
          pickupCenterLat: rovaniemi.lat,
          pickupCenterLng: rovaniemi.lng,
          pickupRadiusKm: 25,
        }),
        point: leftover,
      })
    ).toBe(leftover.formattedAddress);
    expect(
      checkoutSummaryPickupAddress({
        fulfillment: 'pickup',
        area: pickupAreaFromOption({
          fulfillment: 'pickup',
          pickupCenterLat: rovaniemi.lat,
          pickupCenterLng: rovaniemi.lng,
          pickupRadiusKm: 25,
        }),
        point: null,
      })
    ).toBe('');
  });

  it('drops a saved address that the current option cannot accept', () => {
    const draft = {
      placeOfStay: 'Apukka Resort, Tutkijantie 28, Rovaniemi',
      travelerPickup: {
        lat: 66.5783616,
        lng: 26.0153995,
        placeId: 'ChIJ-example',
        formattedAddress: 'Apukka Resort, Tutkijantie 28, Rovaniemi',
        name: 'Apukka Resort',
      },
    };
    expect(
      restoredPickupForOption({ fulfillment: 'pickup', pickupPlace: 'Arctic city' }, draft)
    ).toEqual({ address: '', point: null });
    expect(restoredPickupForOption(null, draft).address).toBe(draft.placeOfStay);
  });
});
