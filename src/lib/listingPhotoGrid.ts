import type { TourPackage } from '../types/tour';
import { parseListingExtras } from '../types/listingExtras';
import { LISTING_PLACEHOLDER_IMAGE } from './listingQualityScore';

export const LISTING_PHOTO_GRID_COLS = 4;
export const LISTING_PHOTO_GRID_ROWS = 3;
export const LISTING_PHOTO_GRID_SLOTS = LISTING_PHOTO_GRID_COLS * LISTING_PHOTO_GRID_ROWS;
export const LISTING_PHOTO_MIN = 4;
export const LISTING_PHOTO_MAX = 12;

export type ListingPhotoFileReject = { name: string; reason: string };

export function remainingListingPhotoSlots(filledCount: number): number {
  return Math.max(0, LISTING_PHOTO_MAX - Math.max(0, filledCount));
}

/** Cap extra files before upload so a 13th pick cannot wipe existing photos. */
export function takeListingPhotoFiles(
  names: string[],
  remainingSlots: number
): { accepted: string[]; rejected: ListingPhotoFileReject[] } {
  const accepted: string[] = [];
  const rejected: ListingPhotoFileReject[] = [];
  const remaining = Math.max(0, remainingSlots);
  for (const name of names) {
    if (accepted.length >= remaining) {
      rejected.push({
        name,
        reason: `You can add up to ${LISTING_PHOTO_MAX} photos.`,
      });
      continue;
    }
    accepted.push(name);
  }
  return { accepted, rejected };
}

export function isPlaceholderListingImageUrl(url: string): boolean {
  const u = url.trim();
  return !u || u === LISTING_PLACEHOLDER_IMAGE || u.includes('pexels.com/photos/346885');
}

/** Real listing photo, or null when the URL is empty / stock placeholder. */
export function listingHeroImageSrc(url: string | null | undefined): string | null {
  const u = (url ?? '').trim();
  if (isPlaceholderListingImageUrl(u)) return null;
  return u;
}

/** Fixed 12 slots; empty strings allowed between filled cells. */
export function normalizePhotoSlots(fromSlots: string[] | undefined | null): string[] {
  const base = Array.isArray(fromSlots) ? fromSlots.map((s) => String(s ?? '')) : [];
  const out = base.slice(0, LISTING_PHOTO_GRID_SLOTS);
  while (out.length < LISTING_PHOTO_GRID_SLOTS) out.push('');
  return out;
}

/** Parallel to photoSlots grid; optional friendly names (e.g. upload filenames). */
export function normalizePhotoSlotLabels(fromLabels: string[] | undefined | null): string[] {
  const base = Array.isArray(fromLabels) ? fromLabels.map((s) => String(s ?? '').slice(0, 200)) : [];
  const out = base.slice(0, LISTING_PHOTO_GRID_SLOTS);
  while (out.length < LISTING_PHOTO_GRID_SLOTS) out.push('');
  return out;
}

/** Move all filled photos to the front (0..n-1) while keeping order and paired labels. */
export function compactPhotoSlotsAndLabels(
  slots: string[],
  labels: string[]
): { slots: string[]; labels: string[] } {
  const s = normalizePhotoSlots(slots);
  const l = normalizePhotoSlotLabels(labels);
  const pairs: { url: string; label: string }[] = [];
  for (let i = 0; i < LISTING_PHOTO_GRID_SLOTS; i++) {
    const url = s[i].trim();
    if (url) pairs.push({ url, label: l[i].trim() });
  }
  const ns = Array.from({ length: LISTING_PHOTO_GRID_SLOTS }, () => '');
  const nl = Array.from({ length: LISTING_PHOTO_GRID_SLOTS }, () => '');
  for (let j = 0; j < pairs.length && j < LISTING_PHOTO_GRID_SLOTS; j++) {
    ns[j] = pairs[j].url;
    nl[j] = pairs[j].label;
  }
  return { slots: ns, labels: nl };
}

/** Reorder filled photos. Index 0 is the cover; dragging a supporting photo to 0 makes it the cover. */
export function reorderFilledPhotos(
  slots: string[],
  labels: string[],
  from: number,
  to: number
): { slots: string[]; labels: string[] } {
  const compacted = compactPhotoSlotsAndLabels(slots, labels);
  const filled = compacted.slots.filter((url) => url.trim()).length;
  if (from === to || from < 0 || to < 0 || from >= filled || to >= filled) return compacted;
  const nextS = [...compacted.slots];
  const nextL = [...compacted.labels];
  const [movedUrl] = nextS.splice(from, 1);
  const [movedLabel] = nextL.splice(from, 1);
  nextS.splice(to, 0, movedUrl ?? '');
  nextL.splice(to, 0, movedLabel ?? '');
  return compactPhotoSlotsAndLabels(nextS, nextL);
}

/** Partner UI: show a file-style name instead of a long URL when possible. */
export function displayNameForPhotoSlot(url: string, label: string): string {
  const t = url.trim();
  if (!t) return '';
  const lb = label.trim();
  if (lb) return lb;
  try {
    const u = new URL(t);
    const seg = u.pathname.split('/').filter(Boolean).pop();
    if (seg) return decodeURIComponent(seg.replace(/\+/g, ' '));
  } catch {
    /* ignore */
  }
  return t.length > 48 ? `${t.slice(0, 45)}…` : t;
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
