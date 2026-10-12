import { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';

/**
 * Simple cover crop: fixed 4:3 frame with zoom. Applies via canvas — does not claim AI quality.
 */
export function ListingPhotoCropModal({
  imageUrl,
  onCancel,
  onApply,
}: {
  imageUrl: string;
  onCancel: () => void;
  onApply: (blob: Blob) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  useDialogFocus(true, panelRef, onCancel);

  useEffect(() => {
    setZoom(1);
  }, [imageUrl]);

  const apply = async () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    setBusy(true);
    try {
      const outW = 1600;
      const outH = 1200;
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const srcAspect = img.naturalWidth / img.naturalHeight;
      const frameAspect = outW / outH;
      let drawW: number;
      let drawH: number;
      if (srcAspect > frameAspect) {
        drawH = img.naturalHeight / zoom;
        drawW = drawH * frameAspect;
      } else {
        drawW = img.naturalWidth / zoom;
        drawH = drawW / frameAspect;
      }
      const sx = Math.max(0, (img.naturalWidth - drawW) / 2);
      const sy = Math.max(0, (img.naturalHeight - drawH) / 2);
      ctx.drawImage(img, sx, sy, drawW, drawH, 0, 0, outW, outH);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
      );
      if (!blob) return;
      onApply(blob);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" role="presentation">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-photo-crop-title"
        className="w-full max-w-lg rounded-[var(--partner-radius,0.5rem)] border border-black/[0.1] bg-paper p-4 shadow-xl"
      >
        <h2 id="listing-photo-crop-title" className="text-[15px] font-semibold text-ink">
          Crop cover (4:3)
        </h2>
        <p className="mt-1 partner-meta">Zoom to frame the cover travelers see in search.</p>
        <div className="mt-3 overflow-hidden rounded-[var(--partner-radius-sm,0.375rem)] bg-black/[0.04]">
          <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden">
            <img
              ref={imgRef}
              src={imageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{ transform: `scale(${zoom})` }}
            />
          </div>
        </div>
        <label className="mt-3 flex items-center gap-3 text-[13px] text-ink">
          Zoom
          <input
            type="range"
            min={1}
            max={2.5}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
        </label>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="tv-btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="tv-btn-primary" onClick={() => void apply()} disabled={busy}>
            {busy ? 'Saving…' : 'Apply crop'}
          </button>
        </div>
      </div>
    </div>
  );
}
