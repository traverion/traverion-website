/**
 * Resolve listing departure IANA timezone from Basics country/city.
 * Uses curated maps (not browser TZ). Unknown locations return null for manual fallback.
 */

import { findListingCountryByLabel } from './listing-destinations';
import { resolveDepartureTimezone, TRAVERION_DEPARTURE_TIMEZONE } from './tour-departure-cutoff';

/** Country-code defaults covering curated listing destinations. */
const COUNTRY_TIMEZONE: Record<string, string> = {
  FI: 'Europe/Helsinki',
  SE: 'Europe/Stockholm',
  NO: 'Europe/Oslo',
  IS: 'Atlantic/Reykjavik',
  EE: 'Europe/Tallinn',
  LV: 'Europe/Riga',
  LT: 'Europe/Vilnius',
  DK: 'Europe/Copenhagen',
  DE: 'Europe/Berlin',
  FR: 'Europe/Paris',
  IT: 'Europe/Rome',
  ES: 'Europe/Madrid',
  GB: 'Europe/London',
  US: 'America/New_York',
  JP: 'Asia/Tokyo',
  TH: 'Asia/Bangkok',
  VN: 'Asia/Ho_Chi_Minh',
  KH: 'Asia/Phnom_Penh',
};

/** City overrides when a country spans multiple zones (US, etc.). */
const CITY_TIMEZONE: Record<string, string> = {
  'new york|us': 'America/New_York',
  'los angeles|us': 'America/Los_Angeles',
  'chicago|us': 'America/Chicago',
  'miami|us': 'America/New_York',
};

function normalizeCityKey(city: string, countryCode: string): string {
  return `${city.trim().toLowerCase()}|${countryCode.toLowerCase()}`;
}

export type ListingLocationTimezoneResult = {
  timezone: string;
  /** True when resolved from country/city; false when falling back to platform default. */
  detected: boolean;
  source: 'city' | 'country' | 'default';
};

/**
 * Detect IANA timezone from listing location. Returns platform default with detected=false
 * when country/city cannot be mapped (supplier should pick manually).
 */
export function detectListingDepartureTimezone(
  country: string,
  city: string
): ListingLocationTimezoneResult {
  const match = findListingCountryByLabel(country);
  if (match) {
    const cityKey = normalizeCityKey(city, match.code);
    const cityTz = CITY_TIMEZONE[cityKey];
    if (cityTz) {
      return { timezone: resolveDepartureTimezone(cityTz), detected: true, source: 'city' };
    }
    const countryTz = COUNTRY_TIMEZONE[match.code];
    if (countryTz) {
      return { timezone: resolveDepartureTimezone(countryTz), detected: true, source: 'country' };
    }
  }
  return {
    timezone: TRAVERION_DEPARTURE_TIMEZONE,
    detected: false,
    source: 'default',
  };
}

/** Whether `current` still matches what auto-detect would choose for this location. */
export function listingTimezoneMatchesAuto(
  country: string,
  city: string,
  current: string
): boolean {
  const auto = detectListingDepartureTimezone(country, city);
  if (!auto.detected) return false;
  return resolveDepartureTimezone(current) === auto.timezone;
}
