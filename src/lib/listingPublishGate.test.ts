import { describe, expect, it } from 'vitest';
import { partnerListingCardPresentation } from './listingPublishGate';

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
