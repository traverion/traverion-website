import { describe, expect, it } from 'vitest';
import {
  paidPromotionListingStillBookable,
  rentalDraftCheckoutAllowed,
} from '../../supabase/functions/_shared/rental-checkout-listing-gate.ts';

describe('rental checkout listing gate', () => {
  it('allows a draft rental checkout only while the server flag is on', () => {
    expect(
      rentalDraftCheckoutAllowed({
        inventoryFamily: 'rental',
        listingStatus: 'draft',
        rentalCheckoutEnabled: true,
      })
    ).toBe(true);
    expect(
      rentalDraftCheckoutAllowed({
        inventoryFamily: 'rental',
        listingStatus: 'draft',
        rentalCheckoutEnabled: false,
      })
    ).toBe(false);
    expect(
      rentalDraftCheckoutAllowed({
        inventoryFamily: 'tour',
        listingStatus: 'draft',
        rentalCheckoutEnabled: true,
      })
    ).toBe(false);
  });

  it('promotes a paid draft rental and still requires published tours and stays', () => {
    expect(
      paidPromotionListingStillBookable({
        inventoryFamily: 'rental',
        listingStatus: 'draft',
        seasonBookable: true,
      })
    ).toBe(true);
    expect(
      paidPromotionListingStillBookable({
        inventoryFamily: 'tour',
        listingStatus: 'draft',
        seasonBookable: true,
      })
    ).toBe(false);
    expect(
      paidPromotionListingStillBookable({
        inventoryFamily: 'stay',
        listingStatus: 'draft',
        seasonBookable: true,
      })
    ).toBe(false);
    expect(
      paidPromotionListingStillBookable({
        inventoryFamily: 'tour',
        listingStatus: 'published',
        seasonBookable: false,
      })
    ).toBe(false);
    expect(
      paidPromotionListingStillBookable({
        inventoryFamily: 'rental',
        listingStatus: 'archived',
        seasonBookable: true,
      })
    ).toBe(false);
  });
});
