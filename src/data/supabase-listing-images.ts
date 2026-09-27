import { supabase } from '../lib/supabase';
import { resolveSupplierId } from './supabase-supplier-team';

const BUCKET = 'listing-images';
export const LISTING_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const LISTING_IMAGE_MAX_MB = 5;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

function extForMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'gif';
}

/** Extract object path inside `listing-images` from a public object URL, or null. */
export function listingImagePathFromPublicUrl(publicUrl: string): string | null {
  const u = publicUrl.trim();
  if (!u) return null;
  const marker = '/storage/v1/object/public/listing-images/';
  const i = u.indexOf(marker);
  if (i === -1) return null;
  const rest = u.slice(i + marker.length).split('?')[0] ?? '';
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

export function isListingImageStoragePublicUrl(url: string): boolean {
  return listingImagePathFromPublicUrl(url) != null;
}

/** Hero + gallery URLs that live in the listing-images bucket (deduped). */
export function collectListingStorageImageUrls(listing: {
  image?: string | null;
  listingExtras?: { galleryImageUrls?: string[] | null } | null;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    const u = (raw ?? '').trim();
    if (!u || seen.has(u)) return;
    if (!isListingImageStoragePublicUrl(u)) return;
    seen.add(u);
    out.push(u);
  };
  push(listing.image);
  for (const g of listing.listingExtras?.galleryImageUrls ?? []) push(g);
  return out;
}

export async function uploadListingImage(
  userId: string,
  file: File
): Promise<{ publicUrl: string | null; error?: string }> {
  if (!supabase) return { publicUrl: null, error: 'Storage not configured' };
  if (file.size > LISTING_IMAGE_MAX_BYTES) return { publicUrl: null, error: 'Image must be 5 MB or smaller.' };
  if (!ALLOWED.includes(file.type as (typeof ALLOWED)[number])) {
    return { publicUrl: null, error: 'Use JPEG, PNG, WebP, or GIF.' };
  }

  // Phase 1215: store under owner prefix so team uploads match owner gallery GC.
  const ownerSupplierId = await resolveSupplierId(userId);
  const ext = extForMime(file.type);
  const path = `${ownerSupplierId}/listing-photos/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
  });
  if (upErr) return { publicUrl: null, error: upErr.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl };
}

export async function removeListingImageIfOwned(userId: string, publicUrl: string): Promise<void> {
  if (!supabase || !userId || !publicUrl.trim()) return;
  const ownerSupplierId = await resolveSupplierId(userId);
  const path = listingImagePathFromPublicUrl(publicUrl);
  if (!path || !path.startsWith(`${ownerSupplierId}/`)) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

/** Best-effort cleanup after a listing row is deleted. Never throws. */
export async function removeOwnedListingImagesAfterDelete(
  userId: string,
  imageUrls: string[]
): Promise<void> {
  if (!userId || imageUrls.length === 0) return;
  for (const url of imageUrls) {
    try {
      await removeListingImageIfOwned(userId, url);
    } catch {
      // Storage GC is best-effort; listing row delete already succeeded.
    }
  }
}
