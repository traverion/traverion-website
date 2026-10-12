/**
 * Client-side image prepare before listing upload:
 * - Accept large originals and resize/compress under storage limits
 * - Attempt HEIC/HEIF decode when the browser can (e.g. Safari)
 * - Preserve orientation via createImageBitmap / drawImage
 */

export const LISTING_IMAGE_PREPARE_MAX_EDGE = 2400;
export const LISTING_IMAGE_PREPARE_TARGET_BYTES = 4.5 * 1024 * 1024;
export const LISTING_IMAGE_PREPARE_ABSOLUTE_BYTES = 25 * 1024 * 1024;

const RASTER_ACCEPT = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const HEIC_ACCEPT = new Set(['image/heic', 'image/heif']);

export function listingImageAcceptAttribute(): string {
  return 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif';
}

export function isLikelyListingImageFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (RASTER_ACCEPT.has(mime) || HEIC_ACCEPT.has(mime)) return true;
  const name = file.name.toLowerCase();
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name);
}

function isHeicLike(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (HEIC_ACCEPT.has(mime)) return true;
  return /\.(heic|heif)$/i.test(file.name);
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode'));
      el.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('encode'));
        else resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}

function drawScaled(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  edge: number
): HTMLCanvasElement {
  const scale = Math.min(1, edge / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/**
 * Prepare a photo for upload. Large files are resized/compressed.
 * HEIC succeeds only when the browser can decode it; otherwise a clear error.
 */
export async function prepareListingImageFile(
  file: File,
  opts?: { maxEdge?: number; targetBytes?: number; absoluteBytes?: number }
): Promise<{ file: File; resized: boolean } | { error: string }> {
  if (!isLikelyListingImageFile(file)) {
    return { error: 'Use JPEG, PNG, WebP, GIF, or HEIC/HEIF.' };
  }
  const absolute = opts?.absoluteBytes ?? LISTING_IMAGE_PREPARE_ABSOLUTE_BYTES;
  if (file.size > absolute) {
    return { error: `Image is too large to process (max ${Math.round(absolute / (1024 * 1024))} MB).` };
  }

  const maxEdge = opts?.maxEdge ?? LISTING_IMAGE_PREPARE_MAX_EDGE;
  const targetBytes = opts?.targetBytes ?? LISTING_IMAGE_PREPARE_TARGET_BYTES;
  const mime = (file.type || '').toLowerCase();

  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    if (isHeicLike(file)) {
      return {
        error:
          'This browser cannot convert HEIC/HEIF. Export as JPEG on your device, or open this page in Safari.',
      };
    }
    return { error: 'Could not read this image. Try another file or export as JPEG.' };
  }

  const srcW = 'naturalWidth' in bitmap ? bitmap.naturalWidth || bitmap.width : bitmap.width;
  const srcH = 'naturalHeight' in bitmap ? bitmap.naturalHeight || bitmap.height : bitmap.height;
  if (!srcW || !srcH) {
    if ('close' in bitmap) bitmap.close();
    return { error: 'Could not read image dimensions.' };
  }

  const alreadyOk =
    !isHeicLike(file) &&
    RASTER_ACCEPT.has(mime) &&
    file.size <= targetBytes &&
    Math.max(srcW, srcH) <= maxEdge;

  if (alreadyOk) {
    if ('close' in bitmap) bitmap.close();
    return { file, resized: false };
  }

  try {
    let edge = maxEdge;
    let canvas = drawScaled(bitmap, srcW, srcH, edge);
    if ('close' in bitmap) bitmap.close();

    let quality = 0.88;
    let blob = await canvasToJpegBlob(canvas, quality);
    while (blob.size > targetBytes && quality > 0.55) {
      quality -= 0.08;
      blob = await canvasToJpegBlob(canvas, quality);
    }
    while (blob.size > targetBytes && edge > 960) {
      edge = Math.round(edge * 0.75);
      canvas = drawScaled(canvas, canvas.width, canvas.height, edge);
      blob = await canvasToJpegBlob(canvas, 0.82);
    }

    if (blob.size > 5 * 1024 * 1024) {
      return { error: 'Could not compress this image under 5 MB. Try a smaller photo.' };
    }

    const base = file.name.replace(/\.[^.]+$/, '') || 'listing-photo';
    const prepared = new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
    return { file: prepared, resized: true };
  } catch {
    return { error: 'Image processing failed. Try another photo or export as JPEG.' };
  }
}
