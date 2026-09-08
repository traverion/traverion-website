/** Partner ticks these; stored values may still be lowercase from older listings. */
export const STAY_AMENITY_PRESETS = [
  'Wifi',
  'Kitchen',
  'Parking',
  'Washer',
  'Heating',
  'Workspace',
  'TV',
  'Hair dryer',
  'Self check-in',
] as const;

const PRESET_BY_KEY = new Map(STAY_AMENITY_PRESETS.map((label) => [label.toLowerCase(), label]));

const ALIASES: Record<string, string> = {
  'wi-fi': 'Wifi',
  'wi fi': 'Wifi',
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
