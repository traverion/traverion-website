/** Partner ticks these; stored values may still be lowercase from older listings. */
export const STAY_AMENITY_PRESETS = [
  'Wifi',
  'Heating',
  'Air conditioning',
  'Kitchen',
  'Towels',
  'Bed linen',
  'Hot water',
  'TV',
  'Washer',
  'Dryer',
  'Hair dryer',
  'Workspace',
  'Fireplace',
  'Sauna',
  'Hot tub',
  'Bathtub',
  'Pool',
  'Terrace',
  'Balcony',
  'Garden',
  'Outdoor furniture',
  'Barbecue',
  'Free parking',
  'Paid parking',
  'EV charging',
  'Self check-in',
  'Elevator',
  'Crib',
  'High chair',
  'Step-free entrance',
  'Wheelchair-accessible bathroom',
] as const;

/** Same stored tokens, grouped so the creator is easier to scan. */
export const STAY_AMENITY_GROUPS: { label: string; items: readonly (typeof STAY_AMENITY_PRESETS)[number][] }[] = [
  { label: 'Essentials', items: ['Wifi', 'Heating', 'Air conditioning', 'Kitchen', 'Towels', 'Bed linen', 'Hot water'] },
  { label: 'Comfort', items: ['TV', 'Washer', 'Dryer', 'Hair dryer', 'Workspace', 'Fireplace'] },
  { label: 'Wellness', items: ['Sauna', 'Hot tub', 'Bathtub', 'Pool'] },
  { label: 'Outdoor', items: ['Terrace', 'Balcony', 'Garden', 'Outdoor furniture', 'Barbecue'] },
  { label: 'Parking and arrival', items: ['Free parking', 'Paid parking', 'EV charging', 'Self check-in', 'Elevator'] },
  { label: 'Family', items: ['Crib', 'High chair'] },
  { label: 'Accessibility', items: ['Step-free entrance', 'Wheelchair-accessible bathroom', 'Elevator'] },
];

const PRESET_BY_KEY = new Map(STAY_AMENITY_PRESETS.map((label) => [label.toLowerCase(), label]));

const ALIASES: Record<string, string> = {
  'wi-fi': 'Wifi',
  'wi fi': 'Wifi',
  'step-free access': 'Step-free entrance',
};

function amenityLookupKey(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Display label for a stored amenity token.
 * Does not add amenities — only casing / known spelling of the same fact.
 */
export function formatStayAmenityLabel(raw: string): string {
  const key = amenityLookupKey(raw);
  if (!key) return '';
  const preset = PRESET_BY_KEY.get(key) ?? ALIASES[key];
  if (preset) return preset;
  const words = key.split(' ');
  return words
    .map((word, i) => {
      if (word === 'wifi' || word === 'wi-fi') return 'Wifi';
      if (word === 'tv') return 'TV';
      if (i === 0) return word.charAt(0).toUpperCase() + word.slice(1);
      return word;
    })
    .join(' ');
}

export function stayAmenityDisplayList(raw: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw ?? []) {
    const label = formatStayAmenityLabel(item);
    if (!label) continue;
    const k = label.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(label);
  }
  return out;
}
