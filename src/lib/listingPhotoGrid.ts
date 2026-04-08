import type { TourPackage } from '../types/tour';
import { parseListingExtras } from '../types/listingExtras';
import { LISTING_PLACEHOLDER_IMAGE } from './listingQualityScore';

export const LISTING_PHOTO_GRID_COLS = 4;
export const LISTING_PHOTO_GRID_ROWS = 3;
export const LISTING_PHOTO_GRID_SLOTS = LISTING_PHOTO_GRID_COLS * LISTING_PHOTO_GRID_ROWS;
export const LISTING_PHOTO_MIN = 4;
export const LISTING_PHOTO_MAX = 12;

export function isPlaceholderListingImageUrl(url: string): boolean {
  const u = url.trim();
  return !u || u === LISTING_PLACEHOLDER_IMAGE || u.includes('pexels.com/photos/346885');
}

/** Fixed 12 slots; empty strings allowed between filled cells. */
export function normalizePhotoSlots(fromSlots: string[] | undefined | null): string[] {
  const base = Array.isArray(fromSlots) ? fromSlots.map((s) => String(s ?? '')) : [];
  const out = base.slice(0, LISTING_PHOTO_GRID_SLOTS);
  while (out.length < LISTING_PHOTO_GRID_SLOTS) out.push('');
  return out;
}

/** Customer order: left-to-right, top-to-bottom, skipping empty slots. */
export function orderedPhotoUrls(slots: string[]): string[] {
  return normalizePhotoSlots(slots)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Hydrate grid from saved tour.image + listingExtras.galleryImageUrls (legacy shape). */
export function photoSlotsFromTourPackage(tour: TourPackage): string[] {
  const extras = parseListingExtras(tour.listingExtras as unknown);
  const gallery = Array.isArray(extras.galleryImageUrls)
    ? extras.galleryImageUrls.map((s) => String(s ?? '').trim()).filter(Boolean)
    : [];
  const hero = String(tour.image ?? '').trim();
  const slots = Array.from({ length: LISTING_PHOTO_GRID_SLOTS }, () => '');
  let i = 0;
  if (!isPlaceholderListingImageUrl(hero)) {
    slots[0] = hero;
    i = 1;
  }
  for (const u of gallery) {
    if (i >= LISTING_PHOTO_GRID_SLOTS) break;
    slots[i++] = u;
  }
  return slots;
}
