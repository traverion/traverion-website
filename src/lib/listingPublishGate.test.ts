import { describe, expect, it } from 'vitest';
import type { TourPackage } from '../types/tour';
import {
  getListingPublishBlockers,
  partnerListingCardPresentation,
  publishBlockerListingWizardStep,
} from './listingPublishGate';

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

  it('Phase 1268: flags live listings that need season updates', () => {
    const card = partnerListingCardPresentation({
      isLive: true,
      publishBlockers: [],
      accountEligible: true,
      liveAttention: 'Every schedule season has ended. Extend dates or travelers cannot book.',
    });
    expect(card.statusLabel).toBe('Needs update');
    expect(card.primaryCta).toBe('continue');
    expect(card.primaryCtaLabel).toBe('Edit');
  });

  it('Phase 1272: live attention works for any publish-bar message', () => {
    const card = partnerListingCardPresentation({
      isLive: true,
      publishBlockers: [],
      accountEligible: true,
      liveAttention: 'Add at least two “what’s included” items so the offer is clear.',
    });
    expect(card.statusLabel).toBe('Needs update');
    expect(card.publishDisabledReason).toContain('included');
  });
});

/** Layer B: stay wizard has Space + Price steps before Photos — blocker jumps must not use tour indices. */
describe('publishBlockerListingWizardStep', () => {
  it('maps stay photo and pricing blockers to Photos (4) and Price (3)', () => {
    expect(
      publishBlockerListingWizardStep('Replace the placeholder hero image with a real photo of the property.', true)
    ).toBe(4);
    expect(publishBlockerListingWizardStep('Set a nightly price greater than zero.', true)).toBe(3);
    expect(publishBlockerListingWizardStep('Set how many guests the property can host.', true)).toBe(2);
    expect(
      publishBlockerListingWizardStep(
        'Add the check-in address guests need after they book (street / building / entry).',
        true
      )
    ).toBe(1);
  });

  it('keeps tour blocker jumps on tour step indices', () => {
    expect(
      publishBlockerListingWizardStep('Replace the placeholder hero image with a real photo of your tour.', false)
    ).toBe(3);
    expect(publishBlockerListingWizardStep('Add where guests meet or are picked up for this option.', false)).toBe(2);
  });
});
