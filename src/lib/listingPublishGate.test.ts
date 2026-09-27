import { describe, expect, it } from 'vitest';
import type { TourPackage } from '../types/tour';
import { getListingPublishBlockers, partnerListingCardPresentation } from './listingPublishGate';

describe('Phase 1240: legacy group size publish gate', () => {
  it('blocks no-option tours without a parseable min–max group size', () => {
    const tour = {
      id: 't1',
      title: 'Aurora',
      description: 'x'.repeat(80),
      city: 'Rovaniemi',
      country: 'Finland',
      image: 'https://example.com/hero.jpg',
      groupSize: 'Small group',
      includes: ['Guide', 'Transport'],
      excludes: ['Meals'],
      meetingPoint: 'City center meeting point',
      listingExtras: { galleryImageUrls: ['a', 'b', 'c'], bookingOptions: [] },
    } as TourPackage;
    const blockers = getListingPublishBlockers(tour);
    expect(blockers.some((b) => /min–max range/i.test(b))).toBe(true);
  });

  it('accepts a parseable group size when there are no booking options', () => {
    const tour = {
      id: 't1',
      title: 'Aurora',
      description: 'x'.repeat(80),
      city: 'Rovaniemi',
      country: 'Finland',
      image: 'https://example.com/hero.jpg',
      groupSize: '1-8 People',
      includes: ['Guide', 'Transport'],
      excludes: ['Meals'],
      meetingPoint: 'City center meeting point',
      listingExtras: { galleryImageUrls: ['a', 'b', 'c'], bookingOptions: [] },
    } as TourPackage;
    const blockers = getListingPublishBlockers(tour);
    expect(blockers.some((b) => /min–max range|group size/i.test(b))).toBe(false);
  });
});

describe('partnerListingCardPresentation', () => {
  it('does not present Publish as available when the listing is incomplete', () => {
    const card = partnerListingCardPresentation({
      isLive: false,
      publishBlockers: ['Add at least four photos.'],
      accountEligible: true,
    });
    expect(card.statusLabel).toBe('Draft');
    expect(card.draftStateLabel).toBe('Incomplete');
    expect(card.primaryCta).toBe('continue');
    expect(card.primaryCtaLabel).toBe('Edit');
  });

  it('separates listing-ready from account verification', () => {
    const card = partnerListingCardPresentation({
      isLive: false,
      publishBlockers: [],
      accountEligible: false,
    });
    expect(card.draftStateLabel).toBe('Ready to publish');
    expect(card.primaryCta).toBe('verify');
    expect(card.primaryCtaLabel).toBe('Verification required');
  });

  it('only offers Publish when listing and account both pass', () => {
    const card = partnerListingCardPresentation({
      isLive: false,
      publishBlockers: [],
      accountEligible: true,
    });
    expect(card.primaryCta).toBe('publish');
    expect(card.publishDisabledReason).toBeNull();
  });
});
