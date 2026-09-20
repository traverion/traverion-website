import { describe, expect, it } from 'vitest';
import {
  partnerOfferCountsAsActiveNow,
  partnerOfferListingIsStayUnsupported,
  partnerOfferMayBePersistedForListing,
} from './partner-offers-honesty';

describe('partner offers honesty', () => {
  it('treats stay listings as unsupported for traveler checkout', () => {
    expect(
      partnerOfferListingIsStayUnsupported({
        listingExtras: { inventoryFamily: 'stay' },
      })
    ).toBe(true);
    expect(
      partnerOfferListingIsStayUnsupported({
        listingExtras: { inventoryFamily: 'tour' },
      })
    ).toBe(false);
  });

  it('refuses to persist a new stay discount because checkout would not apply it', () => {
    expect(
      partnerOfferMayBePersistedForListing({
        listingExtras: { inventoryFamily: 'stay' },
      })
    ).toBe(false);
    expect(
      partnerOfferMayBePersistedForListing({
        listingExtras: { inventoryFamily: 'tour' },
      })
    ).toBe(true);
  });

  it('excludes stay-linked discounts from active-now count', () => {
    expect(
      partnerOfferCountsAsActiveNow({
        listing: { listingExtras: { inventoryFamily: 'stay' } },
        status: 'active',
      })
    ).toBe(false);
    expect(
      partnerOfferCountsAsActiveNow({
        listing: { listingExtras: { inventoryFamily: 'tour' } },
        status: 'active',
      })
    ).toBe(true);
    expect(
      partnerOfferCountsAsActiveNow({
        listing: { listingExtras: { inventoryFamily: 'tour' } },
        status: 'ended',
      })
    ).toBe(false);
  });
});

describe('partner offers honesty', () => {
  it('treats stay listings as unsupported for traveler checkout', () => {
    expect(
      partnerOfferListingIsStayUnsupported({
        listingExtras: { inventoryFamily: 'stay' },
      })
    ).toBe(true);
    expect(
      partnerOfferListingIsStayUnsupported({
        listingExtras: { inventoryFamily: 'tour' },
      })
    ).toBe(false);
  });

  it('excludes stay-linked discounts from active-now count', () => {
    expect(
      partnerOfferCountsAsActiveNow({
        listing: { listingExtras: { inventoryFamily: 'stay' } },
        status: 'active',
      })
    ).toBe(false);
    expect(
      partnerOfferCountsAsActiveNow({
        listing: { listingExtras: { inventoryFamily: 'tour' } },
        status: 'active',
      })
    ).toBe(true);
    expect(
      partnerOfferCountsAsActiveNow({
        listing: { listingExtras: { inventoryFamily: 'tour' } },
        status: 'ended',
      })
    ).toBe(false);
  });
});
