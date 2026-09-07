/** Filter chips and destination helpers. Kept off the seed/brochure modules so production does not ship demo catalog JS. */

export const SEED_DESTINATION_OPTIONS = [
  { id: 'all', label: 'All', type: 'world' as const },
  { id: 'vietnam', label: 'Vietnam', type: 'region' as const },
  { id: 'thailand', label: 'Thailand', type: 'region' as const },
  { id: 'cambodia', label: 'Cambodia', type: 'region' as const },
  { id: 'hanoi', label: 'Hanoi', type: 'city' as const },
  { id: 'ho-chi-minh-city', label: 'Ho Chi Minh City', type: 'city' as const },
  { id: 'hoi-an', label: 'Hoi An', type: 'city' as const },
  { id: 'bangkok', label: 'Bangkok', type: 'city' as const },
  { id: 'phuket', label: 'Phuket', type: 'city' as const },
  { id: 'siem-reap', label: 'Siem Reap', type: 'city' as const },
  { id: 'halong-bay', label: 'Halong Bay', type: 'city' as const },
];

/** Build destination options from listings (global: every country/city that has tours). */
export function getDestinationsFromListings(
  listings: { country?: string; city?: string }[]
): { id: string; label: string; type: 'world' | 'region' | 'city' }[] {
  const out: { id: string; label: string; type: 'world' | 'region' | 'city' }[] = [
    { id: 'all', label: 'All', type: 'world' },
  ];
  const countries = new Set<string>();
  const cities = new Set<string>();
  listings.forEach((l) => {
    if (l.country) countries.add(l.country);
    if (l.city) cities.add(l.city);
  });
  [...countries].sort().forEach((c) => {
    out.push({ id: c.toLowerCase().replace(/\s+/g, '-'), label: c, type: 'region' });
  });
  [...cities].sort().forEach((c) => {
    out.push({ id: c.toLowerCase().replace(/\s+/g, '-'), label: c, type: 'city' });
  });
  return out;
}

/** Tag options for the Tours filter sheet. */
export const TAG_OPTIONS = [
  { id: 'free-cancellation', label: 'Free cancellation' },
  { id: 'small-group', label: 'Small group' },
  { id: 'pickup-available', label: 'Pickup available' },
  { id: 'mobile-ticket', label: 'Mobile ticket' },
  { id: 'bestseller', label: 'Bestseller' },
];
