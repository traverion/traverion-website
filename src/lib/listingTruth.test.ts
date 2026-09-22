import { describe, expect, it } from 'vitest';
import { TRAVERION_STANDARD_CANCELLATION_POLICY } from '../types/listingExtras';
import { listingShowsFreeCancellation, listingTourMatchesBrowseTag, publicReviewLabel } from './listingTruth';
import type { TourPackage } from '../types/tour';

describe('listingTourMatchesBrowseTag', () => {
  const base = { id: '1', title: 'T', destination: 'X', tags: [] } as TourPackage;

  it('matches free cancellation from standard policy without the tag', () => {
    expect(listingTourMatchesBrowseTag({ ...base, cancellationPolicy: '' }, 'free-cancellation')).toBe(true);
    expect(listingTourMatchesBrowseTag({ ...base, cancellationPolicy: 'Non-refundable.' }, 'free-cancellation')).toBe(
      false
    );
  });

  it('matches pickup from option meeting copy, not only tags', () => {
    expect(
      listingTourMatchesBrowseTag(
        {
          ...base,
          listingExtras: {
            bookingOptions: [
              {
                id: 'o1',
                name: 'Standard',
                pickupPlace: 'Harbour gate meeting point',
                optionInfo: 'Small group',
                minPersons: 1,
                maxPersons: 8,
                maxSpotsPerSlot: 8,
                weekdays: [true, true, true, true, true, true, true],
                duration: '3h',
                priceUsd: 50,
              },
            ],
          },
        },
        'pickup-available'
      )
    ).toBe(true);
  });
});

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
