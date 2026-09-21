import { describe, expect, it } from 'vitest';
import {
  listingPublishTruth,
  reviewBasicsSummary,
  reviewOptionsSummary,
  reviewPhotosSummary,
} from './listing-creation-review';

describe('review summaries', () => {
  it('uses real listing values instead of only Ready', () => {
    expect(reviewBasicsSummary('Guaranteed Northern Lights Tour', 'tour', 'English')).toBe(
      'Guaranteed Northern Lights Tour · Tour/activity · English'
    );
    expect(reviewOptionsSummary(2, 2, 'From €149')).toBe('2 bookable options · From €149');
    expect(reviewPhotosSummary(6, true)).toBe('6 photos · Cover selected');
  });

  it('does not count draft options as bookable', () => {
    expect(reviewOptionsSummary(0, 1, '')).toBe('1 draft — none ready to book');
  });
});

describe('listing vs account publish truth', () => {
  it('separates a ready listing from a blocked account', () => {
    const truth = listingPublishTruth({
      listingReady: true,
      accountEligible: false,
      listingMissing: null,
      accountReason: 'Business is verified. Add IBAN and BIC under Payment & payouts in Settings.',
    });
    expect(truth.listingLine).toBe('Your listing is ready.');
    expect(truth.canPublish).toBe(false);
    expect(truth.bannerTitle).toBe('Verification required before publishing');
    expect(truth.bannerBody).toContain('IBAN');
  });

  it('does not claim verification is complete when the account cannot publish', () => {
    const truth = listingPublishTruth({
      listingReady: false,
      accountEligible: false,
      listingMissing: 'Add at least four photos.',
      accountReason: null,
    });
    expect(truth.listingLine).toBe('Add at least four photos.');
    expect(truth.bannerTitle).toBe('Verification required before publishing');
    expect(truth.canPublish).toBe(false);
  });

  it('enables publish only when listing and account both pass', () => {
    const truth = listingPublishTruth({
      listingReady: true,
      accountEligible: true,
      listingMissing: null,
      accountReason: null,
    });
    expect(truth.canPublish).toBe(true);
    expect(truth.bannerTitle).toBeNull();
    expect(truth.accountLine).toBeNull();
  });
});
