/**
 * Crop settings for listing photos.
 * Display URLs are cropped JPEGs; originals + crop state let suppliers re-edit without quality loss.
 * Traveler gallery / search cards use 4:3 — match that frame in the editor.
 */

import type { Area, Point } from 'react-easy-crop';
import { LISTING_PHOTO_GRID_SLOTS } from './listingPhotoGrid';

/** Traveler-facing cover / gallery tile ratio (TourDetails + browse cards). */
export const LISTING_PHOTO_CROP_ASPECT = 4 / 3;

export type ListingPhotoCropSettings = {
  crop: Point;
  zoom: number;
  /** Pixel region from last Apply — used to regenerate display crop from the master. */
  areaPixels: Area | null;
};

export const EMPTY_LISTING_PHOTO_CROP: ListingPhotoCropSettings = {
  crop: { x: 0, y: 0 },
  zoom: 1,
  areaPixels: null,
};

export function normalizePhotoCropSettings(
  from: unknown[] | undefined | null
): ListingPhotoCropSettings[] {
  const base = Array.isArray(from) ? from : [];
  const out: ListingPhotoCropSettings[] = [];
  for (let i = 0; i < LISTING_PHOTO_GRID_SLOTS; i++) {
    out.push(parseOneCrop(base[i]));
  }
  return out;
}

function parseOneCrop(raw: unknown): ListingPhotoCropSettings {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_LISTING_PHOTO_CROP, crop: { x: 0, y: 0 } };
  const o = raw as Record<string, unknown>;
  const cropRaw = o.crop;
  let crop: Point = { x: 0, y: 0 };
  if (cropRaw && typeof cropRaw === 'object') {
    const c = cropRaw as Record<string, unknown>;
    const x = Number(c.x);
    const y = Number(c.y);
    if (Number.isFinite(x) && Number.isFinite(y)) crop = { x, y };
  }
  const zoomN = Number(o.zoom);
  const zoom = Number.isFinite(zoomN) ? Math.min(3, Math.max(1, zoomN)) : 1;
  const area = parseArea(o.areaPixels ?? o.croppedAreaPixels);
  return { crop, zoom, areaPixels: area };
}

function parseArea(raw: unknown): Area | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const x = Number(a.x);
  const y = Number(a.y);
  const width = Number(a.width);
  const height = Number(a.height);
  if (![x, y, width, height].every((n) => Number.isFinite(n)) || width <= 0 || height <= 0) {
    return null;
  }
  return { x, y, width, height };
}

export function listingPhotoCropHasAdjustments(settings: ListingPhotoCropSettings | null | undefined): boolean {
  if (!settings) return false;
  if (settings.areaPixels) return true;
  if (settings.zoom !== 1) return true;
  if (settings.crop.x !== 0 || settings.crop.y !== 0) return true;
  return false;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image-load'));
    img.src = src;
  });
}

/** Rasterize the selected pixel region from a master image URL. */
export async function cropListingPhotoToBlob(
  imageSrc: string,
  area: Area,
  opts?: { maxEdge?: number; quality?: number }
): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const maxEdge = opts?.maxEdge ?? 1600;
  const quality = opts?.quality ?? 0.9;
  const scale = Math.min(1, maxEdge / Math.max(area.width, area.height));
  const outW = Math.max(1, Math.round(area.width * scale));
  const outH = Math.max(1, Math.round(area.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, outW, outH);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
  );
  if (!blob) throw new Error('encode');
  return blob;
}

/** Small live preview data URL for the crop dialog. */
export async function cropListingPhotoPreviewDataUrl(
  imageSrc: string,
  area: Area,
  maxEdge = 480
): Promise<string> {
  const blob = await cropListingPhotoToBlob(imageSrc, area, { maxEdge, quality: 0.82 });
  return URL.createObjectURL(blob);
}
