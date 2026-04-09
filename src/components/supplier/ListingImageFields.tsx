import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  isListingImageStoragePublicUrl,
  removeListingImageIfOwned,
  uploadListingImage,
} from '../../data/supabase-listing-images';
import {
  LISTING_PHOTO_MAX,
  LISTING_PHOTO_MIN,
  compactPhotoSlotsAndLabels,
  displayNameForPhotoSlot,
  normalizePhotoSlotLabels,
  normalizePhotoSlots,
  orderedPhotoUrls,
} from '../../lib/listingPhotoGrid';

export type ListingPhotosValue = {
  slots: string[];
  labels: string[];
};

type ListingImageFieldsProps = {
  photoSlots: string[];
  photoSlotLabels: string[];
  onPhotosChange: (next: ListingPhotosValue) => void;
  userId: string | null | undefined;
  uploadsEnabled: boolean;
};

function previewUrl(url: string): string | null {
  const t = url.trim();
  return t || null;
}

export default function ListingImageFields({
  photoSlots,
  photoSlotLabels,
  onPhotosChange,
  userId,
  uploadsEnabled,
}: ListingImageFieldsProps) {
  const slots = normalizePhotoSlots(photoSlots);
  const labels = normalizePhotoSlotLabels(photoSlotLabels);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadIndexRef = useRef<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pushBundle = (nextSlots: string[], nextLabels: string[]) => {
    onPhotosChange(compactPhotoSlotsAndLabels(nextSlots, nextLabels));
  };

  const filledCount = orderedPhotoUrls(slots).length;
  const canAddMore = filledCount < LISTING_PHOTO_MAX;
  /** After compact, photos sit at 0 .. filledCount-1 */
  const filledIndices = Array.from({ length: filledCount }, (_, i) => i);

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
    const nextS = [...normalizePhotoSlots(slots)];
    const nextL = [...normalizePhotoSlotLabels(labels)];
    nextS[index] = publicUrl;
    nextL[index] = file.name.trim().slice(0, 200) || 'Photo';
    pushBundle(nextS, nextL);
    setSelectedIndex(index);
    if (prevUrl && isListingImageStoragePublicUrl(prevUrl)) {
      void removeListingImageIfOwned(userId, prevUrl);
    }
  };

  const clearSlot = (index: number) => {
    const prev = (slots[index] ?? '').trim();
    const nextS = [...normalizePhotoSlots(slots)];
    const nextL = [...normalizePhotoSlotLabels(labels)];
    nextS[index] = '';
    nextL[index] = '';
    pushBundle(nextS, nextL);
    if (userId && prev && isListingImageStoragePublicUrl(prev)) {
      void removeListingImageIfOwned(userId, prev);
    }
    setSelectedIndex(null);
  };

  const setSlotUrl = (index: number, url: string) => {
    const nextS = [...normalizePhotoSlots(slots)];
    const nextL = [...normalizePhotoSlotLabels(labels)];
    nextS[index] = url;
    nextL[index] = '';
    pushBundle(nextS, nextL);
  };

  const moveLeft = () => {
    if (selectedIndex == null || selectedIndex <= 0) return;
    const nextS = [...normalizePhotoSlots(slots)];
    const nextL = [...normalizePhotoSlotLabels(labels)];
    [nextS[selectedIndex], nextS[selectedIndex - 1]] = [nextS[selectedIndex - 1], nextS[selectedIndex]];
    [nextL[selectedIndex], nextL[selectedIndex - 1]] = [nextL[selectedIndex - 1], nextL[selectedIndex]];
    pushBundle(nextS, nextL);
    setSelectedIndex(selectedIndex - 1);
  };

  const moveRight = () => {
    if (selectedIndex == null || selectedIndex >= filledCount - 1) return;
    const nextS = [...normalizePhotoSlots(slots)];
    const nextL = [...normalizePhotoSlotLabels(labels)];
    [nextS[selectedIndex], nextS[selectedIndex + 1]] = [nextS[selectedIndex + 1], nextS[selectedIndex]];
    [nextL[selectedIndex], nextL[selectedIndex + 1]] = [nextL[selectedIndex + 1], nextL[selectedIndex]];
    pushBundle(nextS, nextL);
    setSelectedIndex(selectedIndex + 1);
  };

  const addSlotIndex = filledCount;
  const storageUrl =
    selectedIndex !== null ? (slots[selectedIndex] ?? '').trim() : '';
  const isSelectedStorage = Boolean(storageUrl && isListingImageStoragePublicUrl(storageUrl));

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
          <span className="font-medium text-gray-800">Order = what travelers see</span> (first photo is the main image).
          Select a photo and use the arrows to reorder. Empty slots are not shown to guests.
        </p>
        <p className="text-xs text-finland font-medium tabular-nums">
          {filledCount} / {LISTING_PHOTO_MIN}–{LISTING_PHOTO_MAX} photos added
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
              selectedIndex === null || selectedIndex >= filledCount - 1 || busyIndex !== null || filledCount < 2
            }
            onClick={moveRight}
            className="touch-manipulation inline-flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 sm:gap-3 flex-1 min-w-0 items-start">
          {filledIndices.map((index) => {
            const url = slots[index] ?? '';
            const p = previewUrl(url);
            const busy = busyIndex === index;
            const selected = selectedIndex === index;
            const caption = displayNameForPhotoSlot(url, labels[index] ?? '');
            return (
              <div key={`slot-${index}-${url.slice(-24)}`} className="flex w-[5.75rem] sm:w-[6.25rem] flex-col gap-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedIndex(selected ? null : index)}
                  className={[
                    'relative w-full overflow-hidden rounded-xl border-2 bg-gray-50 transition-shadow touch-manipulation',
                    'aspect-square max-h-[88px] sm:max-h-[96px]',
                    selected ? 'border-finland ring-2 ring-finland/30 shadow-md' : 'border-gray-200 hover:border-gray-300',
                  ].join(' ')}
                >
                  {p ? (
                    <img src={p} alt="" className="h-full w-full object-cover" />
                  ) : null}
                  {busy && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-[10px] font-medium text-white">
                      …
                    </span>
                  )}
                  {index === 0 && p && (
                    <span className="absolute left-1 top-1 rounded bg-black/55 px-1 py-0.5 text-[9px] font-semibold text-white">
                      Main
                    </span>
                  )}
                </button>
                <p className="truncate text-center text-[10px] text-gray-600 leading-tight px-0.5" title={caption}>
                  {caption}
                </p>
                <div className="flex gap-0.5 justify-center flex-wrap">
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

          {canAddMore && (
            <button
              type="button"
              disabled={!uploadsEnabled || busyIndex !== null}
              onClick={() => {
                setSelectedIndex(addSlotIndex);
                openPickerForIndex(addSlotIndex);
              }}
              className="touch-manipulation flex h-[88px] w-[5.75rem] sm:h-[96px] sm:w-[6.25rem] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/80 text-gray-500 hover:border-finland/50 hover:bg-finland/5 hover:text-finland disabled:opacity-40"
              aria-label="Add another photo"
            >
              <Plus className="h-7 w-7" strokeWidth={1.75} aria-hidden />
              <span className="text-[10px] font-medium">Add photo</span>
            </button>
          )}
        </div>
      </div>

      {selectedIndex !== null && selectedIndex < filledCount && (
        <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 space-y-2">
          {isSelectedStorage ? (
            <>
              <p className="text-xs font-medium text-gray-800">
                {displayNameForPhotoSlot(storageUrl, labels[selectedIndex] ?? '')}
              </p>
              <p className="text-xs text-gray-600 leading-relaxed">
                Uploaded from your device. Use <span className="font-medium">Replace</span> to swap the file, or{' '}
                <span className="font-medium">Clear</span> to remove.
              </p>
            </>
          ) : (
            <>
              <label className="block text-xs font-medium text-gray-600">
                Image URL (optional — or use Replace / Add photo to upload)
                {selectedIndex === 0 ? ' — main image' : ''}
              </label>
              <input
                type="url"
                value={slots[selectedIndex] ?? ''}
                onChange={(e) => setSlotUrl(selectedIndex, e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-finland text-xs"
                placeholder="https://…"
              />
            </>
          )}
        </div>
      )}

      {!uploadsEnabled && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Connect Supabase and sign in to upload files from your device. Until then, paste image URLs in the field above
          when a photo is selected.
        </p>
      )}
    </div>
  );
}
