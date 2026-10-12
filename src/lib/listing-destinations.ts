/**
 * Curated country → city lists for supplier Basics location scene.
 * Custom city fallback is always allowed (persist free-text city/country).
 */

export type ListingCountryOption = {
  code: string;
  label: string;
  cities: readonly string[];
};

/** Travel-focused set; suppliers can still type any city via custom entry. */
export const LISTING_COUNTRY_OPTIONS: readonly ListingCountryOption[] = [
  {
    code: 'FI',
    label: 'Finland',
    cities: [
      'Rovaniemi',
      'Helsinki',
      'Lapland',
      'Tromsø area (FI border)',
      'Levi',
      'Saariselkä',
      'Inari',
      'Oulu',
      'Tampere',
      'Turku',
    ],
  },
  {
    code: 'SE',
    label: 'Sweden',
    cities: ['Stockholm', 'Kiruna', 'Abisko', 'Gothenburg', 'Malmö'],
  },
  {
    code: 'NO',
    label: 'Norway',
    cities: ['Tromsø', 'Oslo', 'Bergen', 'Lofoten', 'Troms'],
  },
  {
    code: 'IS',
    label: 'Iceland',
    cities: ['Reykjavík', 'Akureyri', 'Vík', 'Höfn'],
  },
  {
    code: 'EE',
    label: 'Estonia',
    cities: ['Tallinn', 'Tartu'],
  },
  {
    code: 'LV',
    label: 'Latvia',
    cities: ['Riga'],
  },
  {
    code: 'LT',
    label: 'Lithuania',
    cities: ['Vilnius', 'Kaunas'],
  },
  {
    code: 'DK',
    label: 'Denmark',
    cities: ['Copenhagen', 'Aarhus'],
  },
  {
    code: 'DE',
    label: 'Germany',
    cities: ['Berlin', 'Munich', 'Hamburg', 'Frankfurt'],
  },
  {
    code: 'FR',
    label: 'France',
    cities: ['Paris', 'Nice', 'Lyon', 'Marseille'],
  },
  {
    code: 'IT',
    label: 'Italy',
    cities: ['Rome', 'Milan', 'Florence', 'Venice'],
  },
  {
    code: 'ES',
    label: 'Spain',
    cities: ['Barcelona', 'Madrid', 'Seville', 'Valencia'],
  },
  {
    code: 'GB',
    label: 'United Kingdom',
    cities: ['London', 'Edinburgh', 'Manchester'],
  },
  {
    code: 'US',
    label: 'United States',
    cities: ['New York', 'Los Angeles', 'Chicago', 'Miami'],
  },
  {
    code: 'JP',
    label: 'Japan',
    cities: ['Tokyo', 'Kyoto', 'Osaka'],
  },
  {
    code: 'TH',
    label: 'Thailand',
    cities: ['Bangkok', 'Phuket', 'Chiang Mai'],
  },
  {
    code: 'VN',
    label: 'Vietnam',
    cities: ['Hanoi', 'Ho Chi Minh City', 'Hoi An', 'Halong Bay'],
  },
  {
    code: 'KH',
    label: 'Cambodia',
    cities: ['Siem Reap', 'Phnom Penh'],
  },
] as const;

export const LISTING_CUSTOM_CITY_VALUE = '__custom__';

export function listingCountryLabels(): string[] {
  return LISTING_COUNTRY_OPTIONS.map((c) => c.label);
}

export function findListingCountryByLabel(country: string): ListingCountryOption | undefined {
  const key = country.trim().toLowerCase();
  if (!key) return undefined;
  return LISTING_COUNTRY_OPTIONS.find((c) => c.label.toLowerCase() === key);
}

export function citiesForListingCountry(country: string): string[] {
  return [...(findListingCountryByLabel(country)?.cities ?? [])];
}

export function listingCountrySelectOptions(): { value: string; label: string }[] {
  return [
    { value: '', label: 'Select country…' },
    ...LISTING_COUNTRY_OPTIONS.map((c) => ({ value: c.label, label: c.label })),
  ];
}

/** City options for a country, plus custom entry when the typed city is not in the list. */
export function listingCitySelectOptions(
  country: string,
  currentCity: string
): { value: string; label: string }[] {
  const cities = citiesForListingCountry(country);
  const cur = currentCity.trim();
  const known = new Set(cities.map((c) => c.toLowerCase()));
  const options: { value: string; label: string }[] = [
    { value: '', label: country.trim() ? 'Select city…' : 'Select a country first' },
    ...cities.map((c) => ({ value: c, label: c })),
    { value: LISTING_CUSTOM_CITY_VALUE, label: 'Other city…' },
  ];
  if (cur && !known.has(cur.toLowerCase())) {
    options.splice(1, 0, { value: cur, label: cur });
  }
  return options;
}

export function isCustomListingCity(country: string, city: string): boolean {
  const cur = city.trim();
  if (!cur) return false;
  const cities = citiesForListingCountry(country);
  return !cities.some((c) => c.toLowerCase() === cur.toLowerCase());
}

export function formatListingPlaceLabel(city: string, country: string): string {
  const c = city.trim();
  const co = country.trim();
  if (c && co) return `${c}, ${co}`;
  return co || c || '';
}
