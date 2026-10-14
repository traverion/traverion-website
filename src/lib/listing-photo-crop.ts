/**
 * Crop settings for listing photos.
 * Display URLs are cropped JPEGs; originals + crop state let suppliers re-edit without quality loss.
 * Traveler gallery / search cards use 4:3 — match that frame in the editor.
 */

import type { Area, Point } from 'react-easy-crop';
import { listingImagePathFromPublicUrl } from '../data/supabase-listing-images';
import { supabase } from './supabase';

/** Traveler-facing cover / gallery tile ratio (TourDetails + browse cards). */
export const LISTING_PHOTO_CROP_ASPECT = 4 / 3;

/** Keep in sync with LISTING_PHOTO_GRID_SLOTS — avoid importing listingPhotoGrid (cycle). */
const PHOTO_CROP_SLOT_COUNT = 12;

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
  for (let i = 0; i < PHOTO_CROP_SLOT_COUNT; i++) {
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

type LoadedSource = {
  source: CanvasImageSource;
  naturalWidth: number;
  naturalHeight: number;
  revoke?: () => void;
};

function htmlImageFromUrl(url: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image-load'));
    img.src = url;
  });
}

async function sourceFromBlob(blob: Blob): Promise<LoadedSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        naturalWidth: bitmap.width,
        naturalHeight: bitmap.height,
        revoke: () => bitmap.close(),
      };
    } catch {
      /* fall through to object URL */
    }
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await htmlImageFromUrl(objectUrl, false);
    return {
      source: img,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      revoke: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (e) {
    URL.revokeObjectURL(objectUrl);
    throw e;
  }
}

/**
 * Load pixels for canvas crop without tainting.
 * Prefer fetch/blob (or authenticated storage download) over crossOrigin &lt;img&gt;.
 */
export async function loadListingImageForCrop(src: string): Promise<LoadedSource> {
  const url = src.trim();
  if (!url) throw new Error('image-empty');

  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'reload' });
    if (res.ok) return await sourceFromBlob(await res.blob());
  } catch {
    /* try storage download */
  }

  const path = listingImagePathFromPublicUrl(url);
  if (path && supabase) {
    const { data, error } = await supabase.storage.from('listing-images').download(path);
    if (!error && data) return await sourceFromBlob(data);
  }

  // Last resort — may fail on toBlob if the canvas is tainted.
  const img = await htmlImageFromUrl(url, true);
  return {
    source: img,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
  };
}

/** Rasterize the selected pixel region from a master image URL. */
export async function cropListingPhotoToBlob(
  imageSrc: string,
  area: Area,
  opts?: { maxEdge?: number; quality?: number }
): Promise<Blob> {
  const loaded = await loadListingImageForCrop(imageSrc);
  try {
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
    // Clamp crop rectangle to image bounds — floating-point crop coords can overflow by a px.
    const sx = Math.max(0, Math.min(area.x, loaded.naturalWidth - 1));
    const sy = Math.max(0, Math.min(area.y, loaded.naturalHeight - 1));
    const sw = Math.max(1, Math.min(area.width, loaded.naturalWidth - sx));
    const sh = Math.max(1, Math.min(area.height, loaded.naturalHeight - sy));
    ctx.drawImage(loaded.source, sx, sy, sw, sh, 0, 0, outW, outH);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
    );
    if (!blob) throw new Error('encode');
    return blob;
  } finally {
    loaded.revoke?.();
  }
}

/** Small live preview object URL for the crop dialog. Caller should revoke. */
export async function cropListingPhotoPreviewDataUrl(
  imageSrc: string,
  area: Area,
  maxEdge = 480
): Promise<string> {
  const blob = await cropListingPhotoToBlob(imageSrc, area, { maxEdge, quality: 0.82 });
  return URL.createObjectURL(blob);
}
