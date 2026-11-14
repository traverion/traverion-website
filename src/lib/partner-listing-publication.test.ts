import { describe, expect, it } from 'vitest';
import {
  formatListingRatingLabel,
  partnerListingInternalReferences,
  partnerListingPublicationLabel,
} from './partner-listing-publication';
import { partnerListingMatchesQuery } from './partner-listings-filter';

describe('partner listing publication display', () => {
  it('labels Live / Draft / Paused / Deactivated from status + extras', () => {
    expect(partnerListingPublicationLabel({ status: 'published' })).toBe('Live');
    expect(partnerListingPublicationLabel({ status: 'draft' })).toBe('Draft');
    expect(
      partnerListingPublicationLabel({
        status: 'draft',
        listingExtras: { supplierVisibility: 'paused' },
      })
    ).toBe('Paused');
    expect(
      partnerListingPublicationLabel({
        status: 'draft',
        listingExtras: { supplierVisibility: 'deactivated' },
      })
    ).toBe('Deactivated');
  });

  it('formats ratings as avg (count)', () => {
    expect(formatListingRatingLabel(4.8, 24)).toBe('★ 4.8 (24)');
    expect(formatListingRatingLabel(0, 0)).toBe('★ 0.0 (0)');
  });

  it('matches search against internal references', () => {
    const listing = {
      id: 'listing-1',
      title: 'Aurora tour',
      city: 'Rovaniemi',
      country: 'Finland',
      destination: 'Lapland',
      status: 'published',
      listingExtras: {
        inventoryFamily: 'tour' as const,
        internalReference: 'SKU-AURORA-01',
        bookingOptions: [{ id: 'o1', name: 'Standard', internalReference: 'OPT-STD' }],
      },
    };
    expect(partnerListingMatchesQuery(listing, 'sku-aurora')).toBe(true);
    expect(partnerListingMatchesQuery(listing, 'opt-std')).toBe(true);
    expect(partnerListingMatchesQuery(listing, 'missing-code')).toBe(false);
    expect(partnerListingInternalReferences(listing)).toEqual(['SKU-AURORA-01', 'OPT-STD']);
  });
});
