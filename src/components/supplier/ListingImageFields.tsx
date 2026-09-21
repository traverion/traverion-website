import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
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
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<PhotoIssue[]>([]);
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(null);
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
  };

  const moveToIndex = (from: number, to: number) => {
    const next = reorderFilledPhotos(slots, labels, from, to);
    pushBundle(next.slots, next.labels);
  };

  const makeCover = (index: number) => {
    if (index <= 0) return;
    moveToIndex(index, 0);
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

  const photoButtonClass =
    'touch-manipulation inline-flex min-h-11 items-center px-3 text-sm font-medium text-ink hover:bg-black/[0.04] disabled:opacity-40';

  const renderActions = (index: number) => {
    const pending = pendingRemoveIndex === index;
    if (pending) {
      return (
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className={photoButtonClass} onClick={() => setPendingRemoveIndex(null)}>
            Keep
          </button>
          <button
            type="button"
            className="lc-btn-danger touch-manipulation inline-flex min-h-11 items-center px-3 text-sm font-medium"
            onClick={() => clearSlot(index)}
          >
            Remove photo
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-1">
        {index > 0 ? (
          <button type="button" className={photoButtonClass} disabled={busy} onClick={() => makeCover(index)}>
            Make cover
          </button>
        ) : null}
        {index > 0 ? (
          <button
            type="button"
            className={photoButtonClass}
            disabled={busy}
            onClick={() => moveToIndex(index, index - 1)}
            aria-label={`Move photo ${index + 1} earlier`}
          >
            Earlier
          </button>
        ) : null}
        {index < filledCount - 1 ? (
          <button
            type="button"
            className={photoButtonClass}
            disabled={busy}
            onClick={() => moveToIndex(index, index + 1)}
            aria-label={`Move photo ${index + 1} later`}
          >
            Later
          </button>
        ) : null}
        <button
          type="button"
          className={photoButtonClass}
          disabled={!uploadsEnabled || busy}
          onClick={() => openPicker(index)}
        >
          Replace
        </button>
        <button
          type="button"
          className="lc-btn-danger touch-manipulation inline-flex min-h-11 items-center px-3 text-sm font-medium disabled:opacity-40"
          disabled={busy}
          onClick={() => setPendingRemoveIndex(index)}
        >
          Remove
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
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

      <p className="text-sm text-ink-muted tabular-nums">
        {filledCount} {filledCount === 1 ? 'photo' : 'photos'}
        {' · '}
        {LISTING_PHOTO_MIN} minimum · {LISTING_PHOTO_MAX} maximum · {LISTING_IMAGE_MAX_MB} MB each
      </p>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <section aria-label="Cover photo" className="space-y-3">
        {coverPreview ? (
          <>
            <div
              className={`lc-tile lc-tile--cover relative overflow-hidden rounded-xl ${
                dragOverCover ? 'lc-tile--drop' : ''
              } ${coverFlash ? 'lc-tile--just-cover' : ''}`}
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
                className="aspect-[4/3] w-full object-cover"
              />
              <span className="absolute left-3 top-3 bg-paper/95 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
                Cover
              </span>
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
            {renderActions(0)}
          </>
        ) : (
          <AddPhotosDropzone
            disabled={!uploadsEnabled || busy}
            active={dropActive}
            label="Add cover photo"
            onOpen={() => openPicker(null)}
            onDragState={setDropActive}
            onDropFiles={(files) => void ingestFiles(files, null)}
          />
        )}
      </section>

      <div className="min-w-0 space-y-4">
      {filledCount > 1 ? (
        <section aria-label="Supporting photos" className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">More photos</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: filledCount - 1 }, (_, i) => i + 1).map((index) => {
              const url = slots[index] ?? '';
              const preview = previewUrl(url);
              const caption = displayNameForPhotoSlot(url, labels[index] ?? '');
              return (
                <li key={`slot-${index}-${url.slice(-24)}`} className="min-w-0 space-y-2">
                  <button
                    type="button"
                    draggable={!busy}
                    onDragStart={(e) => onPhotoDragStart(e, index)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => dropPhotoIndex(e, index)}
                    aria-label={`${caption}. Photo ${index + 1} of ${filledCount}. Drag to the cover to make it the cover.`}
                    className="lc-tile relative block w-full overflow-hidden rounded-xl"
                  >
                    {preview ? (
                      <img src={preview} alt="" className="aspect-square w-full object-cover" />
                    ) : null}
                  </button>
                  {renderActions(index)}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {canAddMore && coverPreview ? (
        <AddPhotosDropzone
          disabled={!uploadsEnabled || busy}
          active={dropActive}
          label="Add photos"
          onOpen={() => openPicker(null)}
          onDragState={setDropActive}
          onDropFiles={(files) => void ingestFiles(files, null)}
        />
      ) : null}
      </div>
      </div>

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

function AddPhotosDropzone({
  disabled,
  active,
  label,
  onOpen,
  onDragState,
  onDropFiles,
}: {
  disabled: boolean;
  active: boolean;
  label: string;
  onOpen: () => void;
  onDragState: (on: boolean) => void;
  onDropFiles: (files: File[]) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        onDragState(true);
      }}
      onDragLeave={() => onDragState(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDragState(false);
        const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
        if (files.length) onDropFiles(files);
      }}
      className={`lc-upload flex min-h-[7.5rem] w-full flex-col items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-finland disabled:opacity-40 ${
        active ? 'lc-upload--active' : ''
      }`}
    >
      <Plus className="h-6 w-6" strokeWidth={1.75} aria-hidden />
      {label}
    </button>
  );
}
