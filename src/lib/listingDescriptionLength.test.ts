import { describe, expect, it } from 'vitest';
import { getListingPublishBlockers } from './listingPublishGate';
import { TOUR_BASICS_DESCRIPTION_MAX } from './listing-creation-scenes';
import {
  MAX_LISTING_DESCRIPTION_LENGTH,
  MIN_LISTING_DESCRIPTION_LENGTH,
  clampListingDescriptionInput,
  isListingDescriptionLengthValid,
} from './listingQualityScore';
import type { TourPackage } from '../types/tour';

describe('listing description length bounds', () => {
  const at = (n: number) => 'x'.repeat(n);

  it('keeps the publish minimum and raises the ceiling to 3,500', () => {
    expect(MIN_LISTING_DESCRIPTION_LENGTH).toBe(100);
    expect(MAX_LISTING_DESCRIPTION_LENGTH).toBe(3500);
    expect(TOUR_BASICS_DESCRIPTION_MAX).toBe(3500);
  });

  it('accepts boundary lengths at 1,999, 2,000, 3,499 and 3,500', () => {
    for (const n of [1999, 2000, 3499, 3500]) {
      expect(isListingDescriptionLengthValid(at(n))).toBe(true);
    }
  });

  it('rejects under-min and over-max (including 3,501)', () => {
    expect(isListingDescriptionLengthValid(at(99))).toBe(false);
    expect(isListingDescriptionLengthValid(at(3501))).toBe(false);
  });

  it('clamps paste at 3,501 without truncating legacy over-max values on edit', () => {
    expect(clampListingDescriptionInput(at(3501), at(100))).toBe(at(3500));
    const legacy = at(3600);
    expect(clampListingDescriptionInput(legacy, legacy)).toBe(legacy);
    expect(clampListingDescriptionInput(at(3550), legacy)).toBe(at(3550));
  });

  it('blocks publish over 3,500 without mutating the saved description', () => {
    const long = at(3501);
    const tour = {
      id: 't1',
      title: 'Guaranteed Northern Lights Tour',
      subtitle: 'Small-group evening hunt',
      description: long,
      city: 'Rovaniemi',
      country: 'Finland',
      image: 'https://cdn.example.com/hero.jpg',
      groupSize: '1-8 People',
      includes: ['Guide', 'Transfers'],
      excludes: [],
      meetingPoint: 'City center meeting point',
      experienceStartStyle: 'fixed_meeting_place',
      listingExtras: {
        galleryImageUrls: ['a', 'b', 'c'],
        experienceLanguage: 'en',
        bookingOptions: [],
      },
    } as TourPackage;
    const blockers = getListingPublishBlockers(tour);
    expect(blockers.some((b) => /3,500|3500/i.test(b))).toBe(true);
    expect(tour.description).toBe(long);
  });
});
