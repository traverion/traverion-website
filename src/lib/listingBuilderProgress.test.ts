import { describe, expect, it } from 'vitest';
import { listingBuilderReadyToPublish, listingBuilderSections } from './listingBuilderProgress';
import type { ListingBookingOption } from '../types/listingExtras';
import { defaultAgeDependentCategories } from './price-categories';

function sampleOption(partial?: Partial<ListingBookingOption>): ListingBookingOption {
  return {
    id: 'opt-1',
    name: 'Hotel Pickup',
    priceUsd: 189,
    startTime: '20:00',
    duration: '5 hours',
    pickupPlace: 'Hotel lobby pickup in Rovaniemi city center',
    minPersons: 1,
    maxPersons: 8,
    maxSpotsPerSlot: 8,
    optionInfo: '',
    weekdays: [true, true, true, true, true, true, true],
    availabilityDateFrom: '',
    availabilityDateTo: '',
    pricingMode: 'age_dependent',
    isPrivate: false,
    privatePricing: 'per_person',
    priceCategories: defaultAgeDependentCategories(189, 149),
    ...partial,
  };
}

describe('listingBuilderSections', () => {
  it('returns empty for stays', () => {
    expect(listingBuilderSections({ inventoryFamily: 'stay' })).toEqual([]);
  });

  it('flags incomplete basics and options', () => {
    const sections = listingBuilderSections({
      inventoryFamily: 'tour',
      title: 'Short',
      subtitle: '',
      experienceLanguage: '',
      experienceKind: '',
      description: 'Too short',
      highlights: [],
      includes: [],
      excludes: [],
      city: '',
      country: '',
      duration: '',
      bookingOptions: [],
      photoSlots: [],
    });
    expect(sections.find((s) => s.id === 'basics')?.status).toBe('incomplete');
    expect(sections.find((s) => s.id === 'options')?.status).toBe('empty');
  });

  it('marks ready when tour sections are complete', () => {
    const form = {
      inventoryFamily: 'tour',
      title: 'Guaranteed Northern Lights Photography Tour',
      subtitle: 'Chase the aurora with a local guide',
      experienceLanguage: 'English',
      experienceKind: 'tour',
      description: 'A'.repeat(120),
      highlights: ['Aurora chase'],
      includes: ['Guide', 'Hot drinks'],
      excludes: ['Personal gear'],
      city: 'Rovaniemi',
      country: 'Finland',
      duration: '5 hours',
      bookingOptions: [sampleOption()],
      photoSlots: [
        'https://images.example.com/a.jpg',
        'https://images.example.com/b.jpg',
        'https://images.example.com/c.jpg',
        'https://images.example.com/d.jpg',
      ],
    };
    const sections = listingBuilderSections(form);
    const incomplete = sections.filter((s) => s.status !== 'complete');
    expect(incomplete).toEqual([]);
    expect(listingBuilderReadyToPublish(form)).toBe(true);
  });
});
