import { useEffect, useRef, useState } from 'react';
import { ImagePlus, MoreHorizontal, Plus } from 'lucide-react';
import {
  LISTING_IMAGE_MAX_BYTES,
  LISTING_IMAGE_MAX_MB,
  isListingImageStoragePublicUrl,
  removeListingImageIfOwned,
  uploadListingImage,
} from '../../data/supabase-listing-images';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import {
  listingImageAcceptAttribute,
  prepareListingImageFile,
} from '../../lib/listing-image-prepare';
import {
  LISTING_PHOTO_MAX,
  LISTING_PHOTO_MIN,
  compactPhotoSlotsAndLabels,
  displayNameForPhotoSlot,
  normalizePhotoOriginalUrls,
  normalizePhotoSlotLabels,
  normalizePhotoSlots,
  orderedPhotoUrls,
  remainingListingPhotoSlots,
  reorderFilledPhotos,
  takeListingPhotoFiles,
} from '../../lib/listingPhotoGrid';
import { ListingPhotoCropModal } from './ListingPhotoCropModal';

export type ListingPhotosValue = {
  slots: string[];
  labels: string[];
  originals: string[];
};

type ListingImageFieldsProps = {
  photoSlots: string[];
  photoSlotLabels: string[];
  photoOriginalUrls?: string[];
  onPhotosChange: (next: ListingPhotosValue) => void;
  userId: string | null | undefined;
  uploadsEnabled: boolean;
};

type PhotoIssue = { name: string; message: string };

const PHOTO_DRAG_TYPE = 'application/x-traverion-photo-index';

function previewUrl(url: string): string | null {
  const t = url.trim();
  return t || null;
}

export default function ListingImageFields({
  photoSlots,
  photoSlotLabels,
  photoOriginalUrls,
  onPhotosChange,
  userId,
  uploadsEnabled,
}: ListingImageFieldsProps) {
  const slots = normalizePhotoSlots(photoSlots);
  const labels = normalizePhotoSlotLabels(photoSlotLabels);
  const originals = normalizePhotoOriginalUrls(photoOriginalUrls);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceIndexRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<PhotoIssue[]>([]);
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(null);
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  const [dragOverCover, setDragOverCover] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [coverFlash, setCoverFlash] = useState(false);
  const [cropIndex, setCropIndex] = useState<number | null>(null);

  const pushBundle = (nextSlots: string[], nextLabels: string[], nextOriginals: string[]) => {
    onPhotosChange(compactPhotoSlotsAndLabels(nextSlots, nextLabels, nextOriginals));
  };

  const filledCount = orderedPhotoUrls(slots).length;
  const canAddMore = filledCount < LISTING_PHOTO_MAX;
  const coverUrl = (slots[0] ?? '').trim();
  const coverPreview = previewUrl(coverUrl);
  const photosNeeded = Math.max(0, LISTING_PHOTO_MIN - filledCount);

  useEffect(() => {
    if (menuIndex == null) return;
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuIndex(null);
        setPendingRemoveIndex(null);
      }
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [menuIndex]);

  const openPicker = (replaceIndex: number | null) => {
    if (!uploadsEnabled || !userId || busy) return;
    if (replaceIndex == null && !canAddMore) return;
    replaceIndexRef.current = replaceIndex;
    fileRef.current?.click();
  };

  const prepareAndUpload = async (file: File) => {
    const prepared = await prepareListingImageFile(file);
    if ('error' in prepared) {
      return {
        publicUrl: null as string | null,
        originalUrl: null as string | null,
        error: prepared.error,
        label: file.name,
      };
    }
    const display = await uploadListingImage(userId!, prepared.file);
    if (display.error || !display.publicUrl) {
      return { publicUrl: null, originalUrl: null, error: display.error, label: file.name };
    }
    let originalUrl = display.publicUrl;
    // Retain a master when we resized/converted and the source still fits storage limits.
    if (prepared.resized && file.size <= LISTING_IMAGE_MAX_BYTES) {
      const master = await uploadListingImage(userId!, file);
      if (master.publicUrl) originalUrl = master.publicUrl;
    }
    return {
      publicUrl: display.publicUrl,
      originalUrl,
      error: undefined as string | undefined,
      label: prepared.file.name,
    };
  };

  const ingestFiles = async (files: File[], replaceIndex: number | null, opts?: { keepOriginalAt?: number }) => {
    if (!userId || !uploadsEnabled || busy) return;
    const list = Array.from(files).filter(Boolean);
    if (list.length === 0) return;

    const workingS = [...normalizePhotoSlots(slots)];
    const workingL = [...normalizePhotoSlotLabels(labels)];
    const workingO = [...normalizePhotoOriginalUrls(originals)];
    const nextIssues: PhotoIssue[] = [];

    if (replaceIndex != null) {
      const file = list[0];
      if (!file) return;
      if (list.length > 1) {
        nextIssues.push({ name: list[1]?.name ?? 'extra', message: 'Replace uses one file. Extra files were ignored.' });
      }
      setBusy(true);
      const prevUrl = (workingS[replaceIndex] ?? '').trim();
      const prevOriginal = (workingO[replaceIndex] ?? '').trim();
      const keepOriginal = opts?.keepOriginalAt === replaceIndex ? prevOriginal || prevUrl : '';
      const { publicUrl, originalUrl, error: upErr, label } = await prepareAndUpload(file);
      setBusy(false);
      if (upErr || !publicUrl) {
        setIssues([{ name: file.name, message: userFacingError(upErr, USER_ERROR.upload) }, ...nextIssues]);
        return;
      }
      workingS[replaceIndex] = publicUrl;
      workingL[replaceIndex] = label.trim().slice(0, 200) || 'Photo';
      workingO[replaceIndex] = keepOriginal || originalUrl || publicUrl;
      pushBundle(workingS, workingL, workingO);
      setIssues(nextIssues);
      if (prevUrl && prevUrl !== publicUrl && prevUrl !== workingO[replaceIndex] && isListingImageStoragePublicUrl(prevUrl)) {
        void removeListingImageIfOwned(userId, prevUrl);
      }
      return;
    }

    const remaining = remainingListingPhotoSlots(workingS.filter((url) => url.trim()).length);
    const planned = takeListingPhotoFiles(
      list.map((file) => file.name),
      remaining
    );
    planned.rejected.forEach((item) => nextIssues.push({ name: item.name, message: item.reason }));
    const toUpload = list.slice(0, planned.accepted.length);

    setBusy(true);
    let addIndex = workingS.filter((url) => url.trim()).length;
    for (const file of toUpload) {
      const { publicUrl, originalUrl, error: upErr, label } = await prepareAndUpload(file);
      if (upErr || !publicUrl) {
        nextIssues.push({ name: file.name, message: userFacingError(upErr, USER_ERROR.upload) });
        continue;
      }
      workingS[addIndex] = publicUrl;
      workingL[addIndex] = label.trim().slice(0, 200) || 'Photo';
      workingO[addIndex] = originalUrl || publicUrl;
      addIndex += 1;
      pushBundle(workingS, workingL, workingO);
    }
    setBusy(false);
    setIssues(nextIssues);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    const replaceIndex = replaceIndexRef.current;
    replaceIndexRef.current = null;
    await ingestFiles(files, replaceIndex);
  };

  const clearSlot = (index: number) => {
    const prev = (slots[index] ?? '').trim();
    const prevOriginal = (originals[index] ?? '').trim();
    const nextS = [...normalizePhotoSlots(slots)];
    const nextL = [...normalizePhotoSlotLabels(labels)];
    const nextO = [...normalizePhotoOriginalUrls(originals)];
    nextS[index] = '';
    nextL[index] = '';
    nextO[index] = '';
    pushBundle(nextS, nextL, nextO);
    if (userId && prev && isListingImageStoragePublicUrl(prev)) {
      void removeListingImageIfOwned(userId, prev);
    }
    if (
      userId &&
      prevOriginal &&
      prevOriginal !== prev &&
      isListingImageStoragePublicUrl(prevOriginal)
    ) {
      void removeListingImageIfOwned(userId, prevOriginal);
    }
    setPendingRemoveIndex(null);
    setMenuIndex(null);
  };

  const moveToIndex = (from: number, to: number) => {
    const next = reorderFilledPhotos(slots, labels, from, to, originals);
    pushBundle(next.slots, next.labels, next.originals);
  };

  const makeCover = (index: number) => {
    if (index <= 0) return;
    moveToIndex(index, 0);
    setMenuIndex(null);
    setCoverFlash(true);
    window.setTimeout(() => setCoverFlash(false), 320);
  };

  const onPhotoDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData(PHOTO_DRAG_TYPE, String(index));
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  };

  const dropPhotoIndex = (e: React.DragEvent, to: number) => {
    e.preventDefault();
    setDragOverCover(false);
    const raw = e.dataTransfer.getData(PHOTO_DRAG_TYPE) || e.dataTransfer.getData('text/plain');
    const from = Number.parseInt(raw, 10);
    if (!Number.isFinite(from)) return;
    moveToIndex(from, to);
    if (to === 0 && from !== 0) {
      setCoverFlash(true);
      window.setTimeout(() => setCoverFlash(false), 320);
    }
  };

  const dropIncomingFiles = (e: React.DragEvent, replaceIndex: number | null) => {
    e.preventDefault();
    setDropActive(false);
    setDragOverCover(false);
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length === 0) return;
    void ingestFiles(files, replaceIndex);
  };

  const progressLabel =
    filledCount === 0
      ? `Add at least ${LISTING_PHOTO_MIN} photos`
      : photosNeeded > 0
        ? `${filledCount} of ${LISTING_PHOTO_MIN} · add ${photosNeeded} more`
        : `${filledCount} of ${LISTING_PHOTO_MAX} photos`;

  const renderMenu = (index: number) => {
    if (menuIndex !== index) return null;
    const pending = pendingRemoveIndex === index;
    return (
      <div
        ref={menuRef}
        className="absolute right-2 top-11 z-20 min-w-[10.5rem] overflow-hidden rounded-lg border border-black/[0.1] bg-paper shadow-lg"
        role="menu"
      >
        {pending ? (
          <>
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-black/[0.04]"
              onClick={() => setPendingRemoveIndex(null)}
            >
              Keep photo
            </button>
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2.5 text-left text-sm font-medium text-red-700 hover:bg-red-50"
              onClick={() => clearSlot(index)}
            >
              Remove photo
            </button>
          </>
        ) : (
          <>
            {index > 0 ? (
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-black/[0.04]"
                disabled={busy}
                onClick={() => makeCover(index)}
              >
                Make cover
              </button>
            ) : null}
            {index > 0 ? (
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-black/[0.04]"
                disabled={busy}
                onClick={() => {
                  moveToIndex(index, index - 1);
                  setMenuIndex(null);
                }}
              >
                Move earlier
              </button>
            ) : null}
            {index < filledCount - 1 ? (
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-black/[0.04]"
                disabled={busy}
                onClick={() => {
                  moveToIndex(index, index + 1);
                  setMenuIndex(null);
                }}
              >
                Move later
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-black/[0.04]"
              disabled={!uploadsEnabled || busy}
              onClick={() => {
                setMenuIndex(null);
                openPicker(index);
              }}
            >
              Replace
            </button>
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-black/[0.04]"
              disabled={!uploadsEnabled || busy || !(slots[index] ?? '').trim()}
              onClick={() => {
                setMenuIndex(null);
                setCropIndex(index);
              }}
            >
              Crop
            </button>
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2.5 text-left text-sm font-medium text-red-700 hover:bg-red-50"
              disabled={busy}
              onClick={() => setPendingRemoveIndex(index)}
            >
              Remove
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept={listingImageAcceptAttribute()}
        multiple
        aria-label="Upload listing photos"
        className="hidden"
        onChange={(ev) => void handleFileInput(ev)}
      />

      {issues.length > 0 ? (
        <div className="space-y-1" role="alert">
          {issues.map((issue, i) => (
            <p key={`${issue.name}-${i}`} className="text-[13px] text-red-800">
              {issue.name}: {issue.message}
            </p>
          ))}
        </div>
      ) : null}

      {!coverPreview ? (
        <button
          type="button"
          disabled={!uploadsEnabled || busy}
          onClick={() => openPicker(null)}
          onDragOver={(e) => {
            if (!uploadsEnabled || busy) return;
            e.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDropActive(false);
            const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
            if (files.length) void ingestFiles(files, null);
          }}
          className={`lc-upload flex min-h-[7rem] w-full flex-col items-center justify-center gap-1.5 rounded-[var(--partner-radius,0.5rem)] px-3 py-4 text-center transition-colors disabled:opacity-40 ${
            dropActive ? 'lc-upload--active' : ''
          }`}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-finland/10 text-finland">
            <ImagePlus className="h-4 w-4" strokeWidth={1.85} aria-hidden />
          </span>
          <span className="text-[13px] font-semibold tracking-tight text-ink">
            {busy ? 'Optimizing & uploading…' : 'Add photos'}
          </span>
          <span className="max-w-sm partner-meta">
            Drag and drop or browse. Large and HEIC files are optimized automatically.
            <span className="mt-0.5 block tabular-nums">
              {LISTING_PHOTO_MIN}–{LISTING_PHOTO_MAX} photos · optimized under {LISTING_IMAGE_MAX_MB} MB
            </span>
          </span>
        </button>
      ) : (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[13px] font-medium tabular-nums text-ink">{progressLabel}</p>
              <p className="partner-meta">First photo is the cover. Drag to reorder.</p>
            </div>
            {canAddMore ? (
              <button
                type="button"
                disabled={!uploadsEnabled || busy}
                onClick={() => openPicker(null)}
                className="tv-btn-secondary inline-flex min-h-9 items-center gap-1.5 px-3 text-[13px] font-semibold disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Add photos
              </button>
            ) : null}
          </div>

          <div
            className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5"
            onDragOver={(e) => {
              if (!uploadsEnabled || busy || !e.dataTransfer.types.includes('Files')) return;
              e.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(e) => {
              if (!e.dataTransfer.files?.length) return;
              dropIncomingFiles(e, null);
            }}
          >
            {Array.from({ length: filledCount }, (_, index) => {
              const url = slots[index] ?? '';
              const preview = previewUrl(url);
              const caption = displayNameForPhotoSlot(url, labels[index] ?? '');
              const isCover = index === 0;
              return (
                <div
                  key={`slot-${index}-${url.slice(-24)}`}
                  className={`lc-tile relative overflow-hidden rounded-[var(--partner-radius-sm,0.375rem)] ${
                    isCover && dragOverCover ? 'lc-tile--drop' : ''
                  } ${isCover && coverFlash ? 'lc-tile--just-cover' : ''} ${dropActive ? 'lc-tile--drop' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (isCover) setDragOverCover(true);
                  }}
                  onDragLeave={() => {
                    if (isCover) setDragOverCover(false);
                  }}
                  onDrop={(e) => {
                    if (e.dataTransfer.files?.length) {
                      dropIncomingFiles(e, isCover ? 0 : index);
                      return;
                    }
                    dropPhotoIndex(e, index);
                  }}
                >
                  <button
                    type="button"
                    draggable={!busy}
                    onDragStart={(e) => onPhotoDragStart(e, index)}
                    aria-label={`${caption}. Photo ${index + 1} of ${filledCount}${isCover ? ', cover' : ''}.`}
                    className="block w-full"
                  >
                    {preview ? (
                      <img src={preview} alt="" className="aspect-square w-full object-cover" />
                    ) : null}
                  </button>
                  {isCover ? (
                    <span className="absolute left-1.5 top-1.5 rounded bg-paper/95 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink">
                      Cover
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Options for photo ${index + 1}`}
                    aria-expanded={menuIndex === index}
                    disabled={busy}
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-paper/95 text-ink shadow-sm hover:bg-paper disabled:opacity-40"
                    onClick={() => {
                      setPendingRemoveIndex(null);
                      setMenuIndex((cur) => (cur === index ? null : index));
                    }}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  {renderMenu(index)}
                  {busy && isCover ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-[12px] font-medium text-white">
                      Uploading…
                    </span>
                  ) : null}
                </div>
              );
            })}

            {canAddMore ? (
              <button
                type="button"
                disabled={!uploadsEnabled || busy}
                onClick={() => openPicker(null)}
                className={`lc-upload flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-[var(--partner-radius-sm,0.375rem)] text-[12px] font-semibold text-finland disabled:opacity-40 ${
                  dropActive ? 'lc-upload--active' : ''
                }`}
              >
                <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Add
              </button>
            ) : null}
          </div>
          <p className="partner-meta">
            By uploading you confirm you have rights to use these photos on Traverion.
          </p>
        </div>
      )}

      {cropIndex != null && (slots[cropIndex] ?? '').trim() ? (
        <ListingPhotoCropModal
          imageUrl={
            (originals[cropIndex] ?? '').trim() || (slots[cropIndex] ?? '').trim()
          }
          onCancel={() => setCropIndex(null)}
          onApply={(blob) => {
            const idx = cropIndex;
            setCropIndex(null);
            const file = new File([blob], 'cover-crop.jpg', { type: 'image/jpeg' });
            void ingestFiles([file], idx, { keepOriginalAt: idx });
          }}
        />
      ) : null}

      {!uploadsEnabled && (
        <div className="space-y-2">
          <p className="text-[13px] text-ink-muted">
            Sign in with storage connected to upload from your device. You can still paste an image URL.
          </p>
          {canAddMore ? (
            <label className="block text-[13px] font-medium text-ink">
              Image URL
              <input
                type="url"
                className="tv-input mt-1"
                placeholder="https://…"
                onBlur={(e) => {
                  const url = e.target.value.trim();
                  if (!url) return;
                  const nextS = [...normalizePhotoSlots(slots)];
                  const nextL = [...normalizePhotoSlotLabels(labels)];
                  const nextO = [...normalizePhotoOriginalUrls(originals)];
                  nextS[filledCount] = url;
                  nextL[filledCount] = '';
                  nextO[filledCount] = url;
                  pushBundle(nextS, nextL, nextO);
                  e.target.value = '';
                }}
              />
            </label>
          ) : null}
        </div>
      )}
    </div>
  );
}
