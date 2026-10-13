import { describe, expect, it } from 'vitest';
import {
  detectListingDepartureTimezone,
  listingTimezoneMatchesAuto,
} from './listing-location-timezone';

describe('detectListingDepartureTimezone', () => {
  it('maps Rovaniemi, Finland to Europe/Helsinki', () => {
    const result = detectListingDepartureTimezone('Finland', 'Rovaniemi');
    expect(result).toEqual({
      timezone: 'Europe/Helsinki',
      detected: true,
      source: 'country',
    });
  });

  it('maps US cities to distinct zones', () => {
    expect(detectListingDepartureTimezone('United States', 'Los Angeles').timezone).toBe(
      'America/Los_Angeles'
    );
    expect(detectListingDepartureTimezone('United States', 'New York').timezone).toBe(
      'America/New_York'
    );
  });

  it('falls back when country is unknown', () => {
    const result = detectListingDepartureTimezone('Atlantis', 'Nowhere');
    expect(result.detected).toBe(false);
    expect(result.timezone).toBe('Europe/Helsinki');
  });

  it('listingTimezoneMatchesAuto compares resolved zones', () => {
    expect(listingTimezoneMatchesAuto('Finland', 'Helsinki', 'Europe/Helsinki')).toBe(true);
    expect(listingTimezoneMatchesAuto('Finland', 'Helsinki', 'America/New_York')).toBe(false);
  });
});
