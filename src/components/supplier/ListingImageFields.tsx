import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  isListingImageStoragePublicUrl,
  removeListingImageIfOwned,
  uploadListingImage,
} from '../../data/supabase-listing-images';
import {
  LISTING_PHOTO_GRID_COLS,
  LISTING_PHOTO_GRID_SLOTS,
  LISTING_PHOTO_MAX,
  LISTING_PHOTO_MIN,
  normalizePhotoSlots,
  orderedPhotoUrls,
} from '../../lib/listingPhotoGrid';

type ListingImageFieldsProps = {
  photoSlots: string[];
  onPhotoSlotsChange: (slots: string[]) => void;
  userId: string | null | undefined;
  uploadsEnabled: boolean;
};

function previewUrl(url: string): string | null {
  const t = url.trim();
  return t || null;
}

function swap(slots: string[], a: number, b: number): string[] {
  const next = [...normalizePhotoSlots(slots)];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

export default function ListingImageFields({
  photoSlots,
  onPhotoSlotsChange,
  userId,
  uploadsEnabled,
}: ListingImageFieldsProps) {
  const slots = normalizePhotoSlots(photoSlots);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadIndexRef = useRef<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filledCount = orderedPhotoUrls(slots).length;
  const canAddMore = filledCount < LISTING_PHOTO_MAX;

  const openPickerForIndex = (index: number) => {
    if (!uploadsEnabled || !userId || busyIndex !== null) return;
    if (!canAddMore && !slots[index]?.trim()) return;
    setError(null);
    uploadIndexRef.current = index;
    fileRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const index = uploadIndexRef.current;
    uploadIndexRef.current = null;
    if (!file || !userId || !uploadsEnabled || index == null) return;

    setBusyIndex(index);
    setError(null);
    const prevUrl = (slots[index] ?? '').trim();
    const { publicUrl, error: upErr } = await uploadListingImage(userId, file);
    setBusyIndex(null);
    if (upErr || !publicUrl) {
      setError(upErr ?? 'Upload failed');
      return;
    }
    const next = [...normalizePhotoSlots(slots)];
    next[index] = publicUrl;
    onPhotoSlotsChange(next);
    setSelectedIndex(index);
    if (prevUrl && isListingImageStoragePublicUrl(prevUrl)) {
      void removeListingImageIfOwned(userId, prevUrl);
    }
  };

  const clearSlot = (index: number) => {
    const prev = (slots[index] ?? '').trim();
    const next = [...normalizePhotoSlots(slots)];
    next[index] = '';
    onPhotoSlotsChange(next);
    if (userId && prev && isListingImageStoragePublicUrl(prev)) {
      void removeListingImageIfOwned(userId, prev);
    }
    if (selectedIndex === index) setSelectedIndex(null);
  };

  const setSlotUrl = (index: number, url: string) => {
    const next = [...normalizePhotoSlots(slots)];
    next[index] = url;
    onPhotoSlotsChange(next);
  };

  const moveLeft = () => {
    if (selectedIndex == null || selectedIndex <= 0) return;
    const next = swap(slots, selectedIndex, selectedIndex - 1);
    onPhotoSlotsChange(next);
    setSelectedIndex(selectedIndex - 1);
  };

  const moveRight = () => {
    if (selectedIndex == null || selectedIndex >= LISTING_PHOTO_GRID_SLOTS - 1) return;
    const next = swap(slots, selectedIndex, selectedIndex + 1);
    onPhotoSlotsChange(next);
    setSelectedIndex(selectedIndex + 1);
  };

  const firstEmptyIndex = slots.findIndex((s) => !s.trim());

  return (
    <div className="space-y-4">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(ev) => void handleFile(ev)}
      />

      {error && (
        <p className="text-sm text-red-600 rounded-lg border border-red-200 bg-red-50 px-3 py-2" role="alert">
          {error}
        </p>
      )}

      <div id="supplier-listing-field-image" className="space-y-2">
        <p className="text-xs text-gray-600 leading-relaxed">
          <span className="font-medium text-gray-800">Order = what travelers see</span> (left to right, top to bottom; empty
          slots are skipped). The <span className="font-medium text-gray-800">first photo in that order</span> is the main
          image — usually keep it in the top-left, or select a photo and use the arrows to move it. Publishing needs{' '}
          {LISTING_PHOTO_MIN}–{LISTING_PHOTO_MAX} photos.
        </p>
        <p className="text-xs text-finland font-medium tabular-nums">
          {filledCount} / {LISTING_PHOTO_MIN}–{LISTING_PHOTO_MAX} photos
          {filledCount < LISTING_PHOTO_MIN ? ' — add more to publish' : ''}
        </p>
      </div>

      <div id="supplier-listing-field-gallery" className="flex flex-col sm:flex-row gap-3 sm:items-start">
        <div className="flex flex-row sm:flex-col gap-2 shrink-0 sm:pt-1">
          <button
            type="button"
            aria-label="Move selected photo earlier in the order"
            disabled={selectedIndex === null || selectedIndex <= 0 || busyIndex !== null}
            onClick={moveLeft}
            className="touch-manipulation inline-flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Move selected photo later in the order"
            disabled={
              selectedIndex === null || selectedIndex >= LISTING_PHOTO_GRID_SLOTS - 1 || busyIndex !== null
            }
            onClick={moveRight}
            className="touch-manipulation inline-flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div
          className="grid flex-1 gap-1.5 sm:gap-2 mx-auto w-full max-w-md"
          style={{ gridTemplateColumns: `repeat(${LISTING_PHOTO_GRID_COLS}, minmax(0, 1fr))` }}
        >
          {slots.map((url, index) => {
            const p = previewUrl(url);
            const busy = busyIndex === index;
            const selected = selectedIndex === index;
            const isMainSlot = index === 0;
            return (
              <div key={index} className="flex flex-col gap-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedIndex(selected ? null : index)}
                  className={[
                    'relative w-full overflow-hidden rounded-lg border-2 bg-gray-50 transition-shadow touch-manipulation',
                    'aspect-square max-h-[72px] sm:max-h-[80px]',
                    selected ? 'border-finland ring-2 ring-finland/30 shadow-md' : 'border-gray-200 hover:border-gray-300',
                  ].join(' ')}
                >
                  {p ? (
                    <img src={p} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[10px] sm:text-xs text-gray-400 px-0.5 text-center leading-tight">
                      {isMainSlot ? 'Main' : `${index + 1}`}
                    </span>
                  )}
                  {busy && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-[10px] font-medium text-white">
                      …
                    </span>
                  )}
                </button>
                <div className="flex gap-0.5 justify-center">
                  <button
                    type="button"
                    disabled={!uploadsEnabled || busyIndex !== null || (!canAddMore && !p)}
                    onClick={(e) => {
                      e.stopPropagation();
                      openPickerForIndex(index);
                    }}
                    className="touch-manipulation rounded px-1 py-0.5 text-[10px] font-medium text-finland hover:bg-finland/10 disabled:opacity-40"
                  >
                    {p ? 'Replace' : 'Add'}
                  </button>
                  {p && (
                    <button
                      type="button"
                      disabled={busyIndex !== null}
                      onClick={(e) => {
                        e.stopPropagation();
                        clearSlot(index);
                      }}
                      className="touch-manipulation rounded px-1 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedIndex !== null && (
        <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 space-y-2">
          <label className="block text-xs font-medium text-gray-600">
            Photo URL (slot {selectedIndex + 1}
            {selectedIndex === 0 ? ' — main' : ''})
          </label>
          <input
            type="url"
            value={slots[selectedIndex] ?? ''}
            onChange={(e) => setSlotUrl(selectedIndex, e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-finland text-xs"
            placeholder="https://…"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          disabled={!uploadsEnabled || busyIndex !== null || firstEmptyIndex < 0 || !canAddMore}
          onClick={() => {
            if (firstEmptyIndex >= 0) {
              setSelectedIndex(firstEmptyIndex);
              openPickerForIndex(firstEmptyIndex);
            }
          }}
          className="touch-manipulation px-3 py-2 rounded-lg bg-finland text-white text-sm font-medium hover:bg-finland-dark disabled:opacity-50 min-h-[40px]"
        >
          {busyIndex !== null ? 'Uploading…' : 'Upload next empty slot'}
        </button>
        {!uploadsEnabled && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Connect Supabase and sign in to upload files. Until then, paste URLs in a selected slot.
          </p>
        )}
      </div>
    </div>
  );
}
