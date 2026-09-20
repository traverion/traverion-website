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
  it('omits empty attributes and does not invent pickup', () => {
    const facts = tourQuickFacts(tour({ duration: '2 hours', groupSize: '' }));
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
});
