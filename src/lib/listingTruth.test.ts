import { describe, expect, it } from 'vitest';
import { TRAVERION_STANDARD_CANCELLATION_POLICY } from '../types/listingExtras';
import { listingShowsFreeCancellation, publicReviewLabel } from './listingTruth';

describe('listingShowsFreeCancellation', () => {
  it('follows the tag or the standard Traverion policy, not empty tags', () => {
    expect(listingShowsFreeCancellation({ tags: ['free-cancellation'] })).toBe(true);
    expect(listingShowsFreeCancellation({ tags: [], cancellationPolicy: TRAVERION_STANDARD_CANCELLATION_POLICY })).toBe(
      true,
    );
    expect(listingShowsFreeCancellation({ tags: [], cancellationPolicy: '' })).toBe(true);
    expect(listingShowsFreeCancellation({ tags: [], cancellationPolicy: 'Non-refundable.' })).toBe(false);
  });
});

describe('publicReviewLabel', () => {
  it('hides a score until there is at least one real review', () => {
    expect(publicReviewLabel(null)).toEqual({ score: null, count: 0 });
    expect(publicReviewLabel({ rating: 4.5, count: 0 })).toEqual({ score: null, count: 0 });
    expect(publicReviewLabel({ rating: 4.8, count: 3 })).toEqual({ score: '4.8', count: 3 });
  });
});
