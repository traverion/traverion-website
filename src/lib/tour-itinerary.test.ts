import { describe, expect, it } from 'vitest';
import type { TourPackage } from '../types/tour';
import { itineraryForListingPersist, travelerItinerary } from './tour-itinerary';

function tour(partial: Partial<TourPackage> = {}): TourPackage {
  return {
    id: 't1',
    title: 'Northern Lights Tour',
    description: 'Hunt the aurora with a local guide under arctic skies.'.repeat(2),
    itinerary: [],
    highlights: [],
    includes: [],
    excludes: [],
    ...partial,
  } as TourPackage;
}

describe('travelerItinerary', () => {
  it('hides the generic title/description DayPlan stub', () => {
    const desc = 'Hunt the aurora with a local guide under arctic skies.'.repeat(2);
    const result = travelerItinerary(
      tour({
        description: desc,
        itinerary: [
          {
            day: 1,
            title: 'Northern Lights Tour',
            description: desc,
            meals: 'None',
            location: 'Rovaniemi',
            activities: ['Tour'],
          },
        ],
      })
    );
    expect(result.kind).toBe('none');
  });

  it('shows partner typical flow notes when steps are empty or stub-only', () => {
    const result = travelerItinerary(
      tour({
        listingExtras: {
          typicalTimelineNotes: 'Meet → brief → viewing area → return',
        },
        itinerary: [
          {
            day: 1,
            title: 'Northern Lights Tour',
            description: 'Hunt the aurora with a local guide under arctic skies.'.repeat(2),
            meals: 'None',
            location: 'Rovaniemi',
            activities: ['Tour'],
          },
        ],
      })
    );
    expect(result).toEqual({
      kind: 'notes',
      notes: 'Meet → brief → viewing area → return',
    });
  });

  it('prefers real multi-step itinerary over notes', () => {
    const result = travelerItinerary(
      tour({
        listingExtras: { typicalTimelineNotes: 'Should not show' },
        itinerary: [
          {
            day: 1,
            title: 'Pickup',
            description: 'Hotel collection',
            meals: '',
            location: '',
            activities: [],
          },
          {
            day: 2,
            title: 'Hunt',
            description: 'Search for aurora',
            meals: '',
            location: '',
            activities: [],
          },
        ],
      })
    );
    expect(result.kind).toBe('steps');
    if (result.kind === 'steps') expect(result.steps).toHaveLength(2);
  });
});

describe('itineraryForListingPersist', () => {
  it('writes notes as a Typical flow step and skips empty stubs', () => {
    expect(
      itineraryForListingPersist({
        title: 'Tour',
        description: 'Long desc',
        city: 'Rovaniemi',
        destination: 'Lapland',
        typicalTimelineNotes: '',
      })
    ).toEqual([]);
    const withNotes = itineraryForListingPersist({
      title: 'Tour',
      description: 'Long desc',
      city: 'Rovaniemi',
      destination: 'Lapland',
      typicalTimelineNotes: 'Meet → hunt → return',
    });
    expect(withNotes[0]?.title).toBe('Typical flow');
    expect(withNotes[0]?.description).toBe('Meet → hunt → return');
  });
});
