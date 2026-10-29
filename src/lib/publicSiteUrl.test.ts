import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  publicListingProductUrl,
  publicListingProductUrlFromListing,
  publicRentalListingUrl,
  publicStayListingUrl,
  publicTourListingUrl,
} from './publicSiteUrl';

describe('publicListingProductUrl (category-aware PDP)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('maps tour / stay / rental to their canonical absolute PDPs', () => {
    const id = 'c2d25217-84f0-46d4-8eaa-83949143fa06';
    expect(publicTourListingUrl(id)).toMatch(new RegExp(`/tour/${id}$`));
    expect(publicStayListingUrl(id)).toContain(`/stays?stay=${id}`);
    expect(publicRentalListingUrl(id)).toMatch(new RegExp(`/rentals/${id}$`));

    expect(publicListingProductUrl(id, 'tour')).toBe(publicTourListingUrl(id));
    expect(publicListingProductUrl(id, 'stay')).toBe(publicStayListingUrl(id));
    expect(publicListingProductUrl(id, 'rental')).toBe(publicRentalListingUrl(id));
  });

  it('never routes rental or stay through the tour URL', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(publicListingProductUrl(id, 'rental')).not.toContain('/tour/');
    expect(publicListingProductUrl(id, 'rental')).not.toContain('packages?tour=');
    expect(publicListingProductUrl(id, 'stay')).not.toContain('/tour/');
    expect(publicListingProductUrl(id, 'stay')).not.toContain('packages?tour=');
  });

  it('does not default unknown families to tour', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(publicListingProductUrl(id, 'experience')).toBeNull();
    expect(publicListingProductUrl(id, 'package')).toBeNull();
    expect(publicListingProductUrl(id, '')).toBeNull();
    expect(publicListingProductUrl(id, null)).toBeNull();
    expect(publicListingProductUrl('', 'rental')).toBeNull();
  });

  it('reads inventoryFamily from listing extras for rentals', () => {
    const id = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee';
    const url = publicListingProductUrlFromListing({
      id,
      listingExtras: { inventoryFamily: 'rental' },
    });
    expect(url).toBe(publicRentalListingUrl(id));
    expect(url).toContain('/rentals/');
  });
});
