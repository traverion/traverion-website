import { describe, expect, it } from 'vitest';
import {
  citiesForListingCountry,
  findListingCountryByLabel,
  formatListingPlaceLabel,
  isCustomListingCity,
  listingCitySelectOptions,
  LISTING_CUSTOM_CITY_VALUE,
} from './listing-destinations';

describe('listing-destinations', () => {
  it('resolves Finland cities including Rovaniemi', () => {
    expect(findListingCountryByLabel('Finland')?.label).toBe('Finland');
    expect(citiesForListingCountry('Finland')).toContain('Rovaniemi');
  });

  it('treats unknown cities as custom', () => {
    expect(isCustomListingCity('Finland', 'Rovaniemi')).toBe(false);
    expect(isCustomListingCity('Finland', 'Kilpisjärvi')).toBe(true);
  });

  it('includes custom city in select options when not in catalog', () => {
    const opts = listingCitySelectOptions('Finland', 'Kilpisjärvi');
    expect(opts.some((o) => o.value === 'Kilpisjärvi')).toBe(true);
    expect(opts.some((o) => o.value === LISTING_CUSTOM_CITY_VALUE)).toBe(true);
  });

  it('formats customer-facing place as City, Country', () => {
    expect(formatListingPlaceLabel('Rovaniemi', 'Finland')).toBe('Rovaniemi, Finland');
  });
});
