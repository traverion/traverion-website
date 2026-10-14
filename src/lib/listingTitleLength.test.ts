import { describe, expect, it } from 'vitest';
import { getListingPublishBlockers } from './listingPublishGate';
import { isTourIdentitySatisfied } from './listing-creation-scenes';
import {
  LISTING_TITLE_NEAR_LIMIT_LENGTH,
  MAX_LISTING_TITLE_LENGTH,
  MIN_LISTING_TITLE_LENGTH,
  clampListingTitleInput,
  isListingTitleLengthValid,
} from './listingQualityScore';
import type { TourPackage } from '../types/tour';

describe('listing title length bounds', () => {
  const at = (n: number) => 'x'.repeat(n);

  it('rejects 9 characters and accepts 10', () => {
    expect(isListingTitleLengthValid(at(9))).toBe(false);
    expect(isListingTitleLengthValid(at(MIN_LISTING_TITLE_LENGTH))).toBe(true);
    expect(isTourIdentitySatisfied({ title: at(9), subtitle: 'A short line' })).toBe(false);
    expect(isTourIdentitySatisfied({ title: at(10), subtitle: 'A short line' })).toBe(true);
  });

  it('treats 65 as the hard max (near-limit constant unused by UI)', () => {
    expect(LISTING_TITLE_NEAR_LIMIT_LENGTH).toBe(55);
    expect(MAX_LISTING_TITLE_LENGTH).toBe(65);
    expect(isListingTitleLengthValid(at(55))).toBe(true);
    expect(isListingTitleLengthValid(at(65))).toBe(true);
    expect(isListingTitleLengthValid(at(66))).toBe(false);
    expect(isTourIdentitySatisfied({ title: at(65), subtitle: 'A short line' })).toBe(true);
    expect(isTourIdentitySatisfied({ title: at(66), subtitle: 'A short line' })).toBe(false);
  });

  it('clamps paste/typing at 66 while preserving legacy over-max titles until shortened', () => {
    expect(clampListingTitleInput(at(66), at(10))).toBe(at(65));
    expect(clampListingTitleInput(at(65), at(10))).toBe(at(65));
    expect(clampListingTitleInput(at(55), at(10))).toBe(at(55));

    const legacy = at(80);
    expect(clampListingTitleInput(legacy, legacy)).toBe(legacy);
    expect(clampListingTitleInput(at(81), legacy)).toBe(legacy);
    expect(clampListingTitleInput(at(70), legacy)).toBe(at(70));
    expect(clampListingTitleInput(at(65), legacy)).toBe(at(65));
  });

  it('blocks publish when title is over 65 without mutating the title', () => {
    const longTitle = at(66);
    const tour = {
      id: 't1',
      title: longTitle,
      subtitle: 'Short line under the title',
      description: 'x'.repeat(120),
      city: 'Rovaniemi',
      country: 'Finland',
      image: 'https://cdn.example.com/hero.jpg',
      includes: ['Guide'],
      excludes: ['Meals'],
      listingExtras: {
        galleryImageUrls: ['a', 'b', 'c', 'd'],
        experienceLanguage: 'en',
        experienceStartStyle: 'meeting_point',
        bookingOptions: [],
      },
    } as TourPackage;
    const blockers = getListingPublishBlockers(tour);
    expect(blockers.some((b) => /too long|65/i.test(b))).toBe(true);
    expect(tour.title).toBe(longTitle);
  });
});
