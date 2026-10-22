import { describe, expect, it } from 'vitest';
import {
  buildPublicListingDeepLinkHref,
  resolvePublicListingDeepLinkTarget,
} from './public-listing-deep-link';

const STAY_ID = 'e21b231b-392a-4912-ba7f-07f7b181a564';
const TOUR_ID = 'ddf096fb-2dea-4f59-965f-3cd31907cf03';

describe('resolvePublicListingDeepLinkTarget', () => {
  it('routes published stays to StayDetails even when opened via tour query shape', () => {
    const target = resolvePublicListingDeepLinkTarget({
      status: 'published',
      listingExtras: { inventoryFamily: 'stay', stay: { maxGuests: 4, nightlyPriceUsd: 88 } },
    });
    expect(target).toEqual({
      page: 'stay-details',
      pathname: '/stays',
      idParam: 'stay',
    });
  });

  it('does not open unpublished stays', () => {
    expect(
      resolvePublicListingDeepLinkTarget({
        status: 'draft',
        listingExtras: { inventoryFamily: 'stay' },
      })
    ).toBeNull();
  });

  it('routes published tours (default family) to TourDetails', () => {
    const target = resolvePublicListingDeepLinkTarget({
      status: 'published',
      listingExtras: {},
    });
    expect(target).toEqual({
      page: 'tour-details',
      pathname: '/packages',
      idParam: 'tour',
    });
  });
});

describe('buildPublicListingDeepLinkHref', () => {
  it('rewrites tour= stay ids onto /stays?stay=', () => {
    expect(
      buildPublicListingDeepLinkHref(
        { page: 'stay-details', pathname: '/stays', idParam: 'stay' },
        STAY_ID,
        `?tour=${STAY_ID}&guests=2`
      )
    ).toBe(`/stays?guests=2&stay=${STAY_ID}`);
  });

  it('keeps tour deep links on /packages?tour=', () => {
    expect(
      buildPublicListingDeepLinkHref(
        { page: 'tour-details', pathname: '/packages', idParam: 'tour' },
        TOUR_ID,
        `?tour=${TOUR_ID}`
      )
    ).toBe(`/packages?tour=${TOUR_ID}`);
  });
});
