import { HERO_IMG } from './heroImages';

/**
 * Destination discovery imagery — separate from product listing photos.
 * Only uses licensed assets already in /public (HERO_IMG).
 */
const DESTINATION_COVER_BY_SLUG: Record<string, string> = {
  finland: HERO_IMG.vacation,
  rovaniemi: HERO_IMG.banner,
  lapland: HERO_IMG.banner,
  thailand: HERO_IMG.thailand,
  laos: HERO_IMG.laos,
};

function slugifyPlace(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** Cover image for a destination slug or place label. Never invents product photos. */
export function destinationCoverSrc(slugOrLabel: string | null | undefined): string {
  const slug = slugifyPlace(slugOrLabel ?? '');
  if (slug && DESTINATION_COVER_BY_SLUG[slug]) return DESTINATION_COVER_BY_SLUG[slug];
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
