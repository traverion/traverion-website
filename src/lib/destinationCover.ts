import { HERO_IMG } from './heroImages';

/**
 * Destination discovery imagery.
 * Curated entries must be geographically accurate /public assets only.
 * Places without a curated cover (e.g. Finland, Rovaniemi) prefer a listing photo
 * from that destination so cards do not show unrelated Mediterranean/tropical stock.
 */
const DESTINATION_COVER_BY_SLUG: Record<string, string> = {
  thailand: HERO_IMG.thailand,
  laos: HERO_IMG.laos,
  vietnam: HERO_IMG.vietnam,
  'halong-bay': HERO_IMG.banner,
  'ha-long-bay': HERO_IMG.banner,
  cambodia: HERO_IMG.cambodia,
  myanmar: HERO_IMG.myanmar,
};

function slugifyPlace(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function firstUsableImage(candidates: Array<string | null | undefined> | undefined): string | null {
  if (!candidates?.length) return null;
  for (const raw of candidates) {
    const url = typeof raw === 'string' ? raw.trim() : '';
    if (!url) continue;
    if (url.startsWith('data:')) continue;
    if (url.includes('example.com')) continue;
    return url;
  }
  return null;
}

/** Cover image for a destination slug or place label. Never invents product photos. */
export function destinationCoverSrc(
  slugOrLabel: string | null | undefined,
  options?: { candidates?: Array<string | null | undefined> }
): string {
  const slug = slugifyPlace(slugOrLabel ?? '');
  if (slug && DESTINATION_COVER_BY_SLUG[slug]) return DESTINATION_COVER_BY_SLUG[slug];
  const fromListings = firstUsableImage(options?.candidates);
  if (fromListings) return fromListings;
  // Last resort: generic travel mood — only when no curated or listing image exists.
  return HERO_IMG.vacation;
}

/** Country slug for a city destination when the listing carries a country. */
export function destinationParentCountrySlug(
  citySlug: string,
  countryName: string | null | undefined
): string | null {
  const city = slugifyPlace(citySlug);
  const country = slugifyPlace(countryName ?? '');
  if (!city || !country || city === country) return null;
  return country;
}
