import { useEffect, useRef, useState } from 'react';
import { ImagePlus, MoreHorizontal, Plus } from 'lucide-react';
import {
  LISTING_IMAGE_MAX_MB,
  isListingImageStoragePublicUrl,
  removeListingImageIfOwned,
  uploadListingImage,
} from '../../data/supabase-listing-images';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import {
  LISTING_PHOTO_MAX,
  LISTING_PHOTO_MIN,
  compactPhotoSlotsAndLabels,
  displayNameForPhotoSlot,
  normalizePhotoSlotLabels,
  normalizePhotoSlots,
  orderedPhotoUrls,
  remainingListingPhotoSlots,
  reorderFilledPhotos,
  takeListingPhotoFiles,
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

type PhotoIssue = { name: string; message: string };

const PHOTO_DRAG_TYPE = 'application/x-traverion-photo-index';

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
  const replaceIndexRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<PhotoIssue[]>([]);
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(null);
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  const [dragOverCover, setDragOverCover] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [coverFlash, setCoverFlash] = useState(false);

  const pushBundle = (nextSlots: string[], nextLabels: string[]) => {
    onPhotosChange(compactPhotoSlotsAndLabels(nextSlots, nextLabels));
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

  const ingestFiles = async (files: File[], replaceIndex: number | null) => {
    if (!userId || !uploadsEnabled || busy) return;
    const list = Array.from(files).filter(Boolean);
    if (list.length === 0) return;

    const workingS = [...normalizePhotoSlots(slots)];
    const workingL = [...normalizePhotoSlotLabels(labels)];
    const nextIssues: PhotoIssue[] = [];

    if (replaceIndex != null) {
      const file = list[0];
      if (!file) return;
      if (list.length > 1) {
        nextIssues.push({ name: list[1]?.name ?? 'extra', message: 'Replace uses one file. Extra files were ignored.' });
      }
      setBusy(true);
      const prevUrl = (workingS[replaceIndex] ?? '').trim();
      const { publicUrl, error: upErr } = await uploadListingImage(userId, file);
      setBusy(false);
      if (upErr || !publicUrl) {
        setIssues([{ name: file.name, message: userFacingError(upErr, USER_ERROR.upload) }, ...nextIssues]);
        return;
      }
      workingS[replaceIndex] = publicUrl;
      workingL[replaceIndex] = file.name.trim().slice(0, 200) || 'Photo';
      pushBundle(workingS, workingL);
      setIssues(nextIssues);
      if (prevUrl && isListingImageStoragePublicUrl(prevUrl)) {
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
      const { publicUrl, error: upErr } = await uploadListingImage(userId, file);
      if (upErr || !publicUrl) {
        nextIssues.push({ name: file.name, message: userFacingError(upErr, USER_ERROR.upload) });
        continue;
      }
      workingS[addIndex] = publicUrl;
      workingL[addIndex] = file.name.trim().slice(0, 200) || 'Photo';
      addIndex += 1;
      pushBundle(workingS, workingL);
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
    const nextS = [...normalizePhotoSlots(slots)];
    const nextL = [...normalizePhotoSlotLabels(labels)];
    nextS[index] = '';
    nextL[index] = '';
    pushBundle(nextS, nextL);
    if (userId && prev && isListingImageStoragePublicUrl(prev)) {
      void removeListingImageIfOwned(userId, prev);
    }
    setPendingRemoveIndex(null);
    setMenuIndex(null);
  };

  const moveToIndex = (from: number, to: number) => {
    const next = reorderFilledPhotos(slots, labels, from, to);
    pushBundle(next.slots, next.labels);
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
    <div className="space-y-5">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        aria-label="Upload listing photos"
        className="hidden"
        onChange={(ev) => void handleFileInput(ev)}
      />

      {issues.length > 0 ? (
        <div className="space-y-1" role="alert">
          {issues.map((issue, i) => (
            <p key={`${issue.name}-${i}`} className="text-sm text-red-800">
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
          className={`lc-upload flex min-h-[16rem] w-full flex-col items-center justify-center gap-3 rounded-2xl px-6 py-10 text-center transition-colors disabled:opacity-40 sm:min-h-[18rem] ${
            dropActive ? 'lc-upload--active' : ''
          }`}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-finland/10 text-finland">
            <ImagePlus className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="font-display text-xl font-bold tracking-tight text-ink">
            {busy ? 'Uploading…' : 'Upload photos'}
          </span>
          <span className="max-w-sm text-sm leading-relaxed text-ink-muted">
            Drag and drop, or click to browse. First photo becomes the cover.
            <span className="mt-1 block tabular-nums">
              {LISTING_PHOTO_MIN}–{LISTING_PHOTO_MAX} photos · up to {LISTING_IMAGE_MAX_MB} MB each
            </span>
          </span>
        </button>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium tabular-nums text-ink">{progressLabel}</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                Drag a photo onto the cover to promote it. First photo shows in search.
              </p>
            </div>
            {canAddMore ? (
              <button
                type="button"
                disabled={!uploadsEnabled || busy}
                onClick={() => openPicker(null)}
                className="tv-btn-secondary inline-flex min-h-11 items-center gap-2 px-4 text-sm font-semibold disabled:opacity-40"
              >
                <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                Add photos
              </button>
            ) : null}
          </div>

          <div
            className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3"
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
            <div
              className={`lc-tile lc-tile--cover relative col-span-2 row-span-2 overflow-hidden rounded-xl ${
                dragOverCover ? 'lc-tile--drop' : ''
              } ${coverFlash ? 'lc-tile--just-cover' : ''} ${dropActive ? 'lc-tile--drop' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCover(true);
              }}
              onDragLeave={() => setDragOverCover(false)}
              onDrop={(e) => {
                if (e.dataTransfer.files?.length) {
                  dropIncomingFiles(e, 0);
                  return;
                }
                dropPhotoIndex(e, 0);
              }}
            >
              <img
                src={coverPreview}
                alt=""
                draggable={!busy}
                onDragStart={(e) => onPhotoDragStart(e, 0)}
                className="aspect-[4/3] h-full w-full object-cover sm:aspect-auto sm:min-h-[14rem]"
              />
              <span className="absolute left-3 top-3 rounded-md bg-paper/95 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
                Cover
              </span>
              <button
                type="button"
                aria-label="Cover photo options"
                aria-expanded={menuIndex === 0}
                disabled={busy}
                className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-paper/95 text-ink shadow-sm hover:bg-paper disabled:opacity-40"
                onClick={() => {
                  setPendingRemoveIndex(null);
                  setMenuIndex((cur) => (cur === 0 ? null : 0));
                }}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>
              {renderMenu(0)}
              {busy ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-sm font-medium text-white">
                  Uploading…
                </span>
              ) : null}
              {dragOverCover ? (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-paper/90 px-3 py-2 text-center text-sm font-medium text-ink">
                  Drop to make this the cover
                </span>
              ) : null}
            </div>

            {Array.from({ length: filledCount - 1 }, (_, i) => i + 1).map((index) => {
              const url = slots[index] ?? '';
              const preview = previewUrl(url);
              const caption = displayNameForPhotoSlot(url, labels[index] ?? '');
              return (
                <div key={`slot-${index}-${url.slice(-24)}`} className="lc-tile relative overflow-hidden rounded-xl">
                  <button
                    type="button"
                    draggable={!busy}
                    onDragStart={(e) => onPhotoDragStart(e, index)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => dropPhotoIndex(e, index)}
                    aria-label={`${caption}. Photo ${index + 1} of ${filledCount}. Drag onto cover to promote.`}
                    className="block w-full"
                  >
                    {preview ? (
                      <img src={preview} alt="" className="aspect-square w-full object-cover" />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    aria-label={`Options for photo ${index + 1}`}
                    aria-expanded={menuIndex === index}
                    disabled={busy}
                    className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-paper/95 text-ink shadow-sm hover:bg-paper disabled:opacity-40"
                    onClick={() => {
                      setPendingRemoveIndex(null);
                      setMenuIndex((cur) => (cur === index ? null : index));
                    }}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  {renderMenu(index)}
                </div>
              );
            })}

            {canAddMore ? (
              <button
                type="button"
                disabled={!uploadsEnabled || busy}
                onClick={() => openPicker(null)}
                className={`lc-upload flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-finland disabled:opacity-40 ${
                  dropActive ? 'lc-upload--active' : ''
                }`}
              >
                <Plus className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                Add
              </button>
            ) : null}
          </div>
        </div>
      )}

      {!uploadsEnabled && (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">
            Sign in with storage connected to upload from your device. You can still paste an image URL.
          </p>
          {canAddMore ? (
            <label className="block text-sm font-medium text-ink">
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
                  nextS[filledCount] = url;
                  nextL[filledCount] = '';
                  pushBundle(nextS, nextL);
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
