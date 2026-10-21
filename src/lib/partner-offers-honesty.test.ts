import { describe, expect, it } from 'vitest';
import {
  partnerOfferCountsAsActiveNow,
  partnerOfferListingIsStayUnsupported,
  partnerOfferMayBePersistedForListing,
} from './partner-offers-honesty';

describe('partner offers honesty', () => {
  it('allows stay Offers on traveler checkout (legacy unsupported helper is always false)', () => {
    expect(
      partnerOfferListingIsStayUnsupported({
        listingExtras: { inventoryFamily: 'stay' },
      })
    ).toBe(false);
    expect(
      partnerOfferListingIsStayUnsupported({
        listingExtras: { inventoryFamily: 'tour' },
      })
    ).toBe(false);
  });

  it('persists Offers on tours and stays, not unfinished families', () => {
    expect(
      partnerOfferMayBePersistedForListing({
        listingExtras: { inventoryFamily: 'stay' },
      })
    ).toBe(true);
    expect(
      partnerOfferMayBePersistedForListing({
        listingExtras: { inventoryFamily: 'tour' },
      })
    ).toBe(true);
    expect(
      partnerOfferMayBePersistedForListing({
        listingExtras: { inventoryFamily: 'experience' },
      })
    ).toBe(false);
  });

  it('counts active Offers for tours and stays', () => {
    expect(
      partnerOfferCountsAsActiveNow({
        listing: { listingExtras: { inventoryFamily: 'stay' } },
        status: 'active',
      })
    ).toBe(true);
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
