import { describe, expect, it } from 'vitest';
import { tourQuickFacts } from './tour-quick-facts';
import type { TourPackage } from '../types/tour';

function tour(partial: Partial<TourPackage>): TourPackage {
  return {
    id: 't1',
    title: 'Aurora',
    destination: 'Rovaniemi',
    duration: '3 hours',
    style: '',
    startLocation: '',
    endLocation: '',
    price: {
      startingFrom: 100,
      currency: 'EUR',
      perPerson: true,
      twinOccupancy: false,
      customQuote: false,
      singleSupplement: 0,
      validity: '',
    },
    category: '4*',
    tourType: 'adventure',
    validity: '',
    image: '',
    description: '',
    highlights: [],
    itinerary: [],
    includes: [],
    excludes: [],
    hotels: [],
    difficulty: 'Easy',
    groupSize: '',
    bestTime: '',
    rating: 0,
    reviews: 0,
    isPopular: false,
    ...partial,
  };
}

describe('tourQuickFacts', () => {
  it('omits empty attributes and does not invent pickup or free cancellation', () => {
    const facts = tourQuickFacts(tour({ duration: '2 hours', groupSize: '' }));
    expect(facts.map((f) => f.label)).toEqual(['Duration']);
  });

  it('shows free cancellation only when policy or tag proves it', () => {
    const facts = tourQuickFacts(
      tour({
        duration: '2 hours',
        tags: ['free-cancellation'],
      })
    );
    expect(facts.map((f) => f.label)).toEqual(['Duration', 'Cancellation']);
  });

  it('shows real pickup and language when present', () => {
    const facts = tourQuickFacts(
      tour({
        experienceLanguage: 'en',
        experienceStartStyle: 'operator_pickup',
        groupSize: '2–8',
      })
    );
    expect(facts).toEqual(
      expect.arrayContaining([
        { label: 'Language', value: 'English' },
        { label: 'Start', value: 'Pickup included' },
        { label: 'Group size', value: '2–8' },
      ])
    );
  });

  it('derives Start from option fulfillment when listing style is unspecified', () => {
    const pickupOnly = tourQuickFacts(
      tour({
        experienceStartStyle: 'unspecified',
        meetingPoint: 'Your Rovaniemi hotel',
        listingExtras: {
          bookingOptions: [
            {
              id: 'o1',
              name: 'Small group',
              priceUsd: 119,
              duration: '4 hours',
              fulfillment: 'pickup',
              pickupPlace: 'Your Rovaniemi hotel',
              optionInfo: 'Hotel pickup',
              minPersons: 1,
              maxPersons: 8,
              maxSpotsPerSlot: 8,
              schedules: [],
            },
          ],
        },
      })
    );
    expect(pickupOnly.find((f) => f.label === 'Start')?.value).toBe('Pickup included');

    const mixed = tourQuickFacts(
      tour({
        experienceStartStyle: undefined,
        listingExtras: {
          bookingOptions: [
            {
              id: 'a',
              name: 'Pickup',
              priceUsd: 100,
              duration: '3 hours',
              fulfillment: 'pickup',
              pickupPlace: 'Hotel zone',
              optionInfo: 'Pickup',
              minPersons: 1,
              maxPersons: 8,
              maxSpotsPerSlot: 8,
              schedules: [],
            },
            {
              id: 'b',
              name: 'Meet',
              priceUsd: 90,
              duration: '3 hours',
              fulfillment: 'meeting_point',
              pickupPlace: 'City square',
              optionInfo: 'Meet',
              minPersons: 1,
              maxPersons: 12,
              maxSpotsPerSlot: 12,
              schedules: [],
            },
          ],
        },
      })
    );
    expect(mixed.find((f) => f.label === 'Start')?.value).toBe('Pickup or meet');
  });
});
