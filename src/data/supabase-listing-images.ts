import { supabase } from '../lib/supabase';

const BUCKET = 'listing-images';
const MAX_BYTES = 5 * 1024 * 1024;
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

export async function uploadListingImage(
  userId: string,
  file: File
): Promise<{ publicUrl: string | null; error?: string }> {
  if (!supabase) return { publicUrl: null, error: 'Storage not configured' };
  if (file.size > MAX_BYTES) return { publicUrl: null, error: 'Image must be 5 MB or smaller.' };
  if (!ALLOWED.includes(file.type as (typeof ALLOWED)[number])) {
    return { publicUrl: null, error: 'Use JPEG, PNG, WebP, or GIF.' };
  }

  const ext = extForMime(file.type);
  const path = `${userId}/listing-photos/${crypto.randomUUID()}.${ext}`;

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
  const path = listingImagePathFromPublicUrl(publicUrl);
  if (!path || !path.startsWith(`${userId}/`)) return;
  await supabase.storage.from(BUCKET).remove([path]);
}
