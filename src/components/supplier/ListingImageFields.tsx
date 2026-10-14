import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, MoreHorizontal, Plus } from 'lucide-react';
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
  EMPTY_LISTING_PHOTO_CROP,
  LISTING_PHOTO_MAX,
  LISTING_PHOTO_MIN,
  compactPhotoSlotsAndLabels,
  displayNameForPhotoSlot,
  normalizePhotoCropSettings,
  normalizePhotoOriginalUrls,
  normalizePhotoSlotLabels,
  normalizePhotoSlots,
  orderedPhotoUrls,
  remainingListingPhotoSlots,
  reorderFilledPhotos,
  takeListingPhotoFiles,
  type ListingPhotoCropSettings,
} from '../../lib/listingPhotoGrid';
import { ListingPhotoActionMenu, photoMenuItemClass } from './ListingPhotoActionMenu';
import { ListingPhotoCropModal } from './ListingPhotoCropModal';

export type ListingPhotosValue = {
  slots: string[];
  labels: string[];
  originals: string[];
  crops: ListingPhotoCropSettings[];
};

type ListingImageFieldsProps = {
  photoSlots: string[];
  photoSlotLabels: string[];
  photoOriginalUrls?: string[];
  photoCropSettings?: ListingPhotoCropSettings[] | unknown[];
  onPhotosChange: (next: ListingPhotosValue) => void;
  userId: string | null | undefined;
  uploadsEnabled: boolean;
};

type PhotoIssue = { name: string; message: string; retryFiles?: File[] };

const PHOTO_DRAG_TYPE = 'application/x-traverion-photo-index';

function previewUrl(url: string): string | null {
  const t = url.trim();
  return t || null;
}

function emptyCrop(): ListingPhotoCropSettings {
  return { ...EMPTY_LISTING_PHOTO_CROP, crop: { x: 0, y: 0 } };
}

export default function ListingImageFields({
  photoSlots,
  photoSlotLabels,
  photoOriginalUrls,
  photoCropSettings,
  onPhotosChange,
  userId,
  uploadsEnabled,
}: ListingImageFieldsProps) {
  const slots = normalizePhotoSlots(photoSlots);
  const labels = normalizePhotoSlotLabels(photoSlotLabels);
  const originals = normalizePhotoOriginalUrls(photoOriginalUrls);
  const crops = normalizePhotoCropSettings(photoCropSettings);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceIndexRef = useRef<number | null>(null);
  const menuButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const uploadGenRef = useRef(0);
  const slotsRef = useRef(slots);
  const labelsRef = useRef(labels);
  const originalsRef = useRef(originals);
  const cropsRef = useRef(crops);
  slotsRef.current = slots;
  labelsRef.current = labels;
  originalsRef.current = originals;
  cropsRef.current = crops;

  const [busy, setBusy] = useState(false);
  const [uploadLabel, setUploadLabel] = useState<string | null>(null);
  const [issues, setIssues] = useState<PhotoIssue[]>([]);
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(null);
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  const [dragOverCover, setDragOverCover] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [coverFlash, setCoverFlash] = useState(false);
  const [cropIndex, setCropIndex] = useState<number | null>(null);

  const pushBundle = (
    nextSlots: string[],
    nextLabels: string[],
    nextOriginals: string[],
    nextCrops: ListingPhotoCropSettings[]
  ) => {
    onPhotosChange(compactPhotoSlotsAndLabels(nextSlots, nextLabels, nextOriginals, nextCrops));
  };

  const filledCount = orderedPhotoUrls(slots).length;
  const canAddMore = filledCount < LISTING_PHOTO_MAX;
  const coverUrl = (slots[0] ?? '').trim();
  const coverPreview = previewUrl(coverUrl);

  const closeMenu = () => {
    setMenuIndex(null);
    setPendingRemoveIndex(null);
  };

  useEffect(() => {
    if (menuIndex == null) return;
    if (menuIndex >= filledCount) closeMenu();
  }, [menuIndex, filledCount]);

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

  /** Upload a cropped JPEG into an existing slot; keeps the master original. */
  const applyCroppedBlob = async (
    replaceIndex: number,
    blob: Blob,
    cropSettings: ListingPhotoCropSettings
  ) => {
    if (!userId || !uploadsEnabled) {
      throw new Error('Sign in to save this crop.');
    }
    const workingS = [...normalizePhotoSlots(slotsRef.current)];
    const workingL = [...normalizePhotoSlotLabels(labelsRef.current)];
    const workingO = [...normalizePhotoOriginalUrls(originalsRef.current)];
    const workingC = [...normalizePhotoCropSettings(cropsRef.current)];
    const prevUrl = (workingS[replaceIndex] ?? '').trim();
    const prevOriginal = (workingO[replaceIndex] ?? '').trim();
    const keepOriginal = prevOriginal || prevUrl;
    if (!prevUrl) throw new Error('Photo missing');

    const file = new File([blob], 'photo-crop.jpg', { type: 'image/jpeg' });
    setBusy(true);
    setUploadLabel('Saving crop…');
    try {
      const { publicUrl, error: upErr } = await prepareAndUpload(file);
      if (upErr || !publicUrl) {
        throw new Error(userFacingError(upErr, USER_ERROR.upload));
      }
      workingS[replaceIndex] = publicUrl;
      workingO[replaceIndex] = keepOriginal;
      workingC[replaceIndex] = cropSettings;
      // Keep existing label; crop does not rename the photo.
      pushBundle(workingS, workingL, workingO, workingC);
      setIssues([]);
      if (
        prevUrl &&
        prevUrl !== publicUrl &&
        prevUrl !== keepOriginal &&
        isListingImageStoragePublicUrl(prevUrl)
      ) {
        void removeListingImageIfOwned(userId, prevUrl);
      }
    } finally {
      setBusy(false);
      setUploadLabel(null);
    }
  };

  const ingestFiles = async (files: File[], replaceIndex: number | null) => {
    if (!userId || !uploadsEnabled || busy) return;
    const list = Array.from(files).filter(Boolean);
    if (list.length === 0) return;

    const gen = ++uploadGenRef.current;
    const workingS = [...normalizePhotoSlots(slotsRef.current)];
    const workingL = [...normalizePhotoSlotLabels(labelsRef.current)];
    const workingO = [...normalizePhotoOriginalUrls(originalsRef.current)];
    const workingC = [...normalizePhotoCropSettings(cropsRef.current)];
    const nextIssues: PhotoIssue[] = [];

    if (replaceIndex != null) {
      const file = list[0];
      if (!file) return;
      if (list.length > 1) {
        nextIssues.push({
          name: list[1]?.name ?? 'extra',
          message: 'Replace uses one file. Extra files were ignored.',
        });
      }
      setBusy(true);
      setUploadLabel(`Uploading ${file.name}…`);
      const prevUrl = (workingS[replaceIndex] ?? '').trim();
      const prevOriginal = (workingO[replaceIndex] ?? '').trim();
      const { publicUrl, originalUrl, error: upErr, label } = await prepareAndUpload(file);
      if (gen !== uploadGenRef.current) return;
      setBusy(false);
      setUploadLabel(null);
      if (upErr || !publicUrl) {
        setIssues([
          {
            name: file.name,
            message: userFacingError(upErr, USER_ERROR.upload),
            retryFiles: [file],
          },
          ...nextIssues,
        ]);
        return;
      }
      workingS[replaceIndex] = publicUrl;
      workingL[replaceIndex] = label.trim().slice(0, 200) || 'Photo';
      workingO[replaceIndex] = originalUrl || publicUrl;
      workingC[replaceIndex] = emptyCrop();
      pushBundle(workingS, workingL, workingO, workingC);
      setIssues(nextIssues);
      if (
        prevUrl &&
        prevUrl !== publicUrl &&
        prevUrl !== workingO[replaceIndex] &&
        isListingImageStoragePublicUrl(prevUrl)
      ) {
        void removeListingImageIfOwned(userId, prevUrl);
      }
      if (
        userId &&
        prevOriginal &&
        prevOriginal !== prevUrl &&
        prevOriginal !== workingO[replaceIndex] &&
        isListingImageStoragePublicUrl(prevOriginal)
      ) {
        void removeListingImageIfOwned(userId, prevOriginal);
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
    let done = 0;
    for (const file of toUpload) {
      if (gen !== uploadGenRef.current) return;
      setUploadLabel(`Uploading ${done + 1}/${toUpload.length}…`);
      const { publicUrl, originalUrl, error: upErr, label } = await prepareAndUpload(file);
      if (gen !== uploadGenRef.current) return;
      done += 1;
      if (upErr || !publicUrl) {
        nextIssues.push({
          name: file.name,
          message: userFacingError(upErr, USER_ERROR.upload),
          retryFiles: [file],
        });
        continue;
      }
      workingS[addIndex] = publicUrl;
      workingL[addIndex] = label.trim().slice(0, 200) || 'Photo';
      workingO[addIndex] = originalUrl || publicUrl;
      workingC[addIndex] = emptyCrop();
      addIndex += 1;
      pushBundle(workingS, workingL, workingO, workingC);
    }
    setBusy(false);
    setUploadLabel(null);
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
    const nextC = [...normalizePhotoCropSettings(crops)];
    nextS[index] = '';
    nextL[index] = '';
    nextO[index] = '';
    nextC[index] = emptyCrop();
    pushBundle(nextS, nextL, nextO, nextC);
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
    closeMenu();
  };

  const moveToIndex = (from: number, to: number) => {
    const next = reorderFilledPhotos(slots, labels, from, to, originals, crops);
    pushBundle(next.slots, next.labels, next.originals, next.crops);
    if (to === 0 && from !== 0) {
      setCoverFlash(true);
      window.setTimeout(() => setCoverFlash(false), 320);
    }
  };

  const makeCover = (index: number) => {
    if (index <= 0) return;
    moveToIndex(index, 0);
    closeMenu();
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
  };

  const dropIncomingFiles = (e: React.DragEvent, replaceIndex: number | null) => {
    e.preventDefault();
    setDropActive(false);
    setDragOverCover(false);
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length === 0) return;
    void ingestFiles(files, replaceIndex);
  };

  const countLabel = `${filledCount}/${LISTING_PHOTO_MAX}`;
  const progressHint =
    filledCount === 0
      ? `${LISTING_PHOTO_MIN}–${LISTING_PHOTO_MAX} required to publish`
      : filledCount < LISTING_PHOTO_MIN
        ? `${LISTING_PHOTO_MIN - filledCount} more for publish`
        : 'Ready for publish';

  const menuItems = (index: number) => {
    const pending = pendingRemoveIndex === index;
    if (pending) {
      return (
        <>
          <button
            type="button"
            role="menuitem"
            className={photoMenuItemClass()}
            onClick={() => setPendingRemoveIndex(null)}
          >
            Keep photo
          </button>
          <button
            type="button"
            role="menuitem"
            className={photoMenuItemClass(true)}
            onClick={() => clearSlot(index)}
          >
            Delete photo
          </button>
        </>
      );
    }
    return (
      <>
        <button
          type="button"
          role="menuitem"
          className={photoMenuItemClass()}
          disabled={busy || index === 0}
          onClick={() => makeCover(index)}
        >
          Make cover
        </button>
        <button
          type="button"
          role="menuitem"
          className={photoMenuItemClass()}
          disabled={!uploadsEnabled || busy || !(slots[index] ?? '').trim()}
          onClick={() => {
            closeMenu();
            setCropIndex(index);
          }}
        >
          Crop / Edit
        </button>
        <button
          type="button"
          role="menuitem"
          className={photoMenuItemClass()}
          disabled={!uploadsEnabled || busy}
          onClick={() => {
            closeMenu();
            openPicker(index);
          }}
        >
          Replace
        </button>
        <button
          type="button"
          role="menuitem"
          className={photoMenuItemClass(true)}
          disabled={busy}
          onClick={() => setPendingRemoveIndex(index)}
        >
          Delete
        </button>
      </>
    );
  };

  return (
    <div className="space-y-2.5">
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
            <p key={`${issue.name}-${i}`} className="text-[12.5px] text-red-800">
              {issue.name}: {issue.message}
              {issue.retryFiles?.length && uploadsEnabled && !busy ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className="font-semibold text-finland underline"
                    onClick={() => {
                      setIssues((prev) => prev.filter((_, j) => j !== i));
                      void ingestFiles(issue.retryFiles!, null);
                    }}
                  >
                    Retry
                  </button>
                </>
              ) : null}
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
          className={`lc-upload flex min-h-[6.5rem] w-full flex-col items-center justify-center gap-1 rounded-[var(--partner-radius,0.5rem)] px-3 py-3.5 text-center transition-colors disabled:opacity-40 ${
            dropActive ? 'lc-upload--active' : ''
          }`}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-finland/10 text-finland">
            <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.85} aria-hidden />
          </span>
          <span className="text-[13px] font-semibold tracking-tight text-ink">
            {busy ? uploadLabel || 'Uploading…' : 'Add photos'}
          </span>
          <span className="partner-meta tabular-nums">
            {LISTING_PHOTO_MIN}–{LISTING_PHOTO_MAX} · under {LISTING_IMAGE_MAX_MB} MB · HEIC OK
          </span>
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold tabular-nums text-ink">
                {countLabel}
                <span className="ml-1.5 font-normal text-ink-muted">· {progressHint}</span>
              </p>
              <p className="text-[12px] text-ink-muted">Cover is first. Use arrows or drag to reorder.</p>
            </div>
            {canAddMore ? (
              <button
                type="button"
                disabled={!uploadsEnabled || busy}
                onClick={() => openPicker(null)}
                className="tv-btn-secondary inline-flex min-h-8 items-center gap-1 px-2.5 text-[12.5px] font-semibold disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Add photos
              </button>
            ) : null}
          </div>

          {busy && uploadLabel ? (
            <p className="text-[12.5px] text-ink-muted" role="status">
              {uploadLabel}
            </p>
          ) : null}

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
              const canMoveEarlier = index > 0;
              const canMoveLater = index < filledCount - 1;
              return (
                <div
                  key={`slot-${index}-${url.slice(-24)}`}
                  className={`lc-tile group relative overflow-hidden rounded-[var(--partner-radius-sm,0.375rem)] ${
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
                    className="lux-flat block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-finland/40"
                  >
                    {preview ? (
                      <img src={preview} alt="" className="aspect-square w-full object-cover" />
                    ) : null}
                  </button>
                  {isCover ? (
                    <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/55 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-white">
                      Cover
                    </span>
                  ) : null}
                  <button
                    ref={(el) => {
                      menuButtonRefs.current[index] = el;
                    }}
                    type="button"
                    aria-label={`Options for photo ${index + 1}`}
                    aria-expanded={menuIndex === index}
                    aria-haspopup="menu"
                    disabled={busy}
                    className="lux-flat absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-ink shadow-sm hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland/35 disabled:opacity-40"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      setPendingRemoveIndex(null);
                      setMenuIndex((cur) => (cur === index ? null : index));
                    }}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-1">
                    <button
                      type="button"
                      aria-label={`Move photo ${index + 1} earlier`}
                      disabled={busy || !canMoveEarlier}
                      className="lux-flat flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-ink shadow-sm hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland/35 disabled:pointer-events-none disabled:opacity-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.currentTarget.blur();
                        moveToIndex(index, index - 1);
                      }}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move photo ${index + 1} later`}
                      disabled={busy || !canMoveLater}
                      className="lux-flat flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-ink shadow-sm hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland/35 disabled:pointer-events-none disabled:opacity-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.currentTarget.blur();
                        moveToIndex(index, index + 1);
                      }}
                    >
                      <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                    </button>
                  </div>
                </div>
              );
            })}

            {canAddMore ? (
              <button
                type="button"
                disabled={!uploadsEnabled || busy}
                onClick={() => openPicker(null)}
                className={`lc-upload lux-flat flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-[var(--partner-radius-sm,0.375rem)] text-[12px] font-semibold text-finland focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland/30 disabled:opacity-40 ${
                  dropActive ? 'lc-upload--active' : ''
                }`}
              >
                <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Add
              </button>
            ) : null}
          </div>

          <ListingPhotoActionMenu
            open={menuIndex != null}
            anchorEl={menuIndex != null ? menuButtonRefs.current[menuIndex] ?? null : null}
            onClose={closeMenu}
          >
            {menuIndex != null ? menuItems(menuIndex) : null}
          </ListingPhotoActionMenu>

          <p className="text-[11px] leading-snug text-ink-faint">
            By uploading you confirm you have rights to use these photos on Traverion.
          </p>
        </div>
      )}

      {cropIndex != null && (slots[cropIndex] ?? '').trim() ? (
        <ListingPhotoCropModal
          imageUrl={(originals[cropIndex] ?? '').trim() || (slots[cropIndex] ?? '').trim()}
          initial={crops[cropIndex] ?? emptyCrop()}
          onCancel={() => setCropIndex(null)}
          onApply={async ({ blob, settings }) => {
            const idx = cropIndex;
            if (idx == null) return;
            await applyCroppedBlob(idx, blob, settings);
            setCropIndex(null);
          }}
        />
      ) : null}

      {!uploadsEnabled && (
        <div className="space-y-2">
          <p className="text-[12.5px] text-ink-muted">
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
                  const nextC = [...normalizePhotoCropSettings(crops)];
                  nextS[filledCount] = url;
                  nextL[filledCount] = '';
                  nextO[filledCount] = url;
                  nextC[filledCount] = emptyCrop();
                  pushBundle(nextS, nextL, nextO, nextC);
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
