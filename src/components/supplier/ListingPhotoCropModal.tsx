import { useCallback, useEffect, useRef, useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import {
  EMPTY_LISTING_PHOTO_CROP,
  LISTING_PHOTO_CROP_ASPECT,
  cropListingPhotoPreviewDataUrl,
  cropListingPhotoToBlob,
  type ListingPhotoCropSettings,
} from '../../lib/listing-photo-crop';

/**
 * Interactive 4:3 crop editor (traveler gallery / search ratio).
 * Drag + zoom; live preview; Reset / Apply / Cancel. Master image stays untouched.
 */
export function ListingPhotoCropModal({
  imageUrl,
  initial,
  onCancel,
  onApply,
}: {
  imageUrl: string;
  initial?: ListingPhotoCropSettings | null;
  onCancel: () => void;
  onApply: (result: { blob: Blob; settings: ListingPhotoCropSettings }) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const seed = initial ?? EMPTY_LISTING_PHOTO_CROP;
  const [crop, setCrop] = useState<Point>(seed.crop);
  const [zoom, setZoom] = useState(seed.zoom);
  const [areaPixels, setAreaPixels] = useState<Area | null>(seed.areaPixels);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDialogFocus(true, panelRef, onCancel);

  useEffect(() => {
    setCrop(seed.crop);
    setZoom(seed.zoom);
    setAreaPixels(seed.areaPixels);
    setError(null);
  }, [imageUrl, seed.crop.x, seed.crop.y, seed.zoom, seed.areaPixels?.x, seed.areaPixels?.y, seed.areaPixels?.width, seed.areaPixels?.height]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const run = async () => {
      if (!areaPixels) {
        setPreviewUrl(null);
        return;
      }
      try {
        const url = await cropListingPhotoPreviewDataUrl(imageUrl, areaPixels);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch {
        if (!cancelled) setPreviewUrl(null);
      }
    };
    const t = window.setTimeout(() => void run(), 80);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageUrl, areaPixels]);

  useEffect(() => {
    return () => {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setAreaPixels(pixels);
  }, []);

  const reset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setError(null);
  };

  const apply = async () => {
    if (!areaPixels) {
      setError('Adjust the crop frame, then apply.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blob = await cropListingPhotoToBlob(imageUrl, areaPixels);
      onApply({
        blob,
        settings: { crop, zoom, areaPixels },
      });
    } catch {
      setError('Could not apply this crop. Try again or pick another photo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-photo-crop-title"
        className="flex max-h-[min(92vh,44rem)] w-full max-w-xl flex-col overflow-hidden rounded-t-[var(--partner-radius,0.5rem)] border border-black/[0.1] bg-paper shadow-xl sm:rounded-[var(--partner-radius,0.5rem)]"
      >
        <div className="shrink-0 border-b border-black/[0.06] px-4 py-3">
          <h2 id="listing-photo-crop-title" className="text-[15px] font-semibold tracking-tight text-ink">
            Edit photo
          </h2>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            Drag to reposition · scroll or slider to zoom · 4:3 traveler frame
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--partner-radius-sm,0.375rem)] bg-ink">
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={LISTING_PHOTO_CROP_ASPECT}
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              objectFit="contain"
              classes={{
                containerClassName: 'listing-photo-cropper',
                mediaClassName: 'listing-photo-cropper__media',
              }}
              style={{
                containerStyle: { background: '#0a0a0a' },
                cropAreaStyle: {
                  border: '1.5px solid rgba(255,255,255,0.92)',
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
                },
              }}
            />
          </div>

          <label className="mt-3 flex items-center gap-3 text-[13px] text-ink">
            <span className="shrink-0 text-ink-muted">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.02}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="min-w-0 flex-1 accent-[var(--partner-accent,#003580)]"
              aria-valuemin={1}
              aria-valuemax={3}
              aria-valuenow={zoom}
            />
          </label>

          <div className="mt-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-muted">Preview</p>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="aspect-[4/3] w-28 overflow-hidden rounded border border-black/[0.08] bg-black/[0.04] sm:w-36">
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[11px] text-ink-faint">…</div>
                )}
              </div>
              <p className="max-w-[14rem] text-[12px] leading-snug text-ink-muted">
                Guests see this framing in search and on the listing.
              </p>
            </div>
          </div>

          {error ? (
            <p className="mt-2 text-[13px] text-red-800" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-black/[0.06] px-4 py-3">
          <button
            type="button"
            className="lux-flat min-h-9 rounded-md px-2 text-[13px] font-medium text-ink-muted hover:bg-black/[0.04] hover:text-ink"
            onClick={reset}
            disabled={busy}
          >
            Reset
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="tv-btn-ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="tv-btn-primary" onClick={() => void apply()} disabled={busy}>
              {busy ? 'Saving…' : 'Apply crop'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
