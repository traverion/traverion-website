import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { STAY_BED_KINDS, type StaySleepingArea } from '../../../lib/stay-beds';
import { prepareListingImageFile } from '../../../lib/listing-image-prepare';
import { uploadListingImage } from '../../../data/supabase-listing-images';
import type { StayAccommodationOption } from '../../../lib/stay-options';
import { useDialogFocus } from '../../../hooks/useDialogFocus';

type Props = {
  options: StayAccommodationOption[];
  galleryUrls: string[];
  userId?: string;
  uploadsEnabled: boolean;
  onChange: (options: StayAccommodationOption[]) => void;
  onEditRooms?: () => void;
  /** When a room upload succeeds, also append the URL to the property gallery if missing. */
  onGalleryUrl?: (url: string) => void;
};

type PickerTarget = { optionId: string; areaId: string; roomLabel: string };

function bedLine(area: StaySleepingArea): string {
  const parts = area.beds.map((bed) => {
    const label = STAY_BED_KINDS.find((kind) => kind.id === bed.kind)?.label ?? 'Bed';
    return `${bed.count} ${label.toLowerCase()}${bed.count === 1 ? '' : 's'}`;
  });
  return parts.join(', ');
}

function hasBeds(area: StaySleepingArea): boolean {
  return area.beds.some((bed) => bed.count > 0);
}

export default function StayBedroomPhotos({
  options,
  galleryUrls,
  userId,
  uploadsEnabled,
  onChange,
  onEditRooms,
  onGalleryUrl,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const areas = options
    .filter((option) => !option.archived)
    .flatMap((option) => option.sleepingAreas.map((area) => ({ option, area })));

  function urlsFor(option: StayAccommodationOption, areaId: string): string[] {
    return option.roomPhotos?.find((row) => row.areaId === areaId)?.urls ?? [];
  }

  function write(optionId: string, areaId: string, urls: string[]) {
    const unique = Array.from(new Set(urls.filter((url) => url.startsWith('http')))).slice(0, 8);
    onChange(
      options.map((option) => {
        if (option.id !== optionId) return option;
        const rest = (option.roomPhotos ?? []).filter((row) => row.areaId !== areaId);
        return { ...option, roomPhotos: unique.length > 0 ? [...rest, { areaId, urls: unique }] : rest };
      })
    );
  }

  function move(optionId: string, areaId: string, urls: string[], index: number, delta: number) {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= urls.length) return;
    const next = [...urls];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(nextIndex, 0, item);
    write(optionId, areaId, next);
  }

  async function upload(optionId: string, areaId: string, file: File | undefined, current: string[]) {
    if (!file || !userId || !uploadsEnabled) return;
    setBusyId(areaId);
    setError(null);
    try {
      const prepared = await prepareListingImageFile(file);
      if ('error' in prepared) {
        setError(prepared.error);
        return;
      }
      const uploaded = await uploadListingImage(userId, prepared.file);
      if (!uploaded.publicUrl) {
        setError(uploaded.error ?? 'That photo could not be uploaded.');
        return;
      }
      if (!current.includes(uploaded.publicUrl)) {
        write(optionId, areaId, [...current, uploaded.publicUrl]);
        onGalleryUrl?.(uploaded.publicUrl);
      }
    } catch {
      setError('That photo could not be uploaded.');
    } finally {
      setBusyId(null);
    }
  }

  if (areas.length === 0) {
    return (
      <div className="space-y-3 rounded-xl px-4 py-6 ring-1 ring-[#E6EAF0]">
        <p className="text-sm text-ink-muted">Add sleeping areas before attaching bedroom photos.</p>
        {onEditRooms ? (
          <button type="button" className="min-h-11 text-sm font-semibold text-finland" onClick={onEditRooms}>
            Go to sleeping setup
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">Bedroom photos are optional. Guests only see a room when it has a photo.</p>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {areas.map(({ option, area }) => {
        const urls = urlsFor(option, area.id);
        const roomLabel = area.name || 'Sleeping area';
        const bedsReady = hasBeds(area);
        const canAdd = urls.length < 8;
        return (
          <section key={`${option.id}-${area.id}`} className="stay-panel stay-room-photo-card space-y-2.5">
            <div>
              <h4 className="text-sm font-semibold text-ink">{roomLabel}</h4>
              <p className="stay-help mt-0.5">
                {bedLine(area) || 'Beds not set'}
                {option.name.trim() ? ` · ${option.name.trim()}` : ''}
              </p>
              {!bedsReady ? (
                <p className="mt-1.5 text-sm font-medium text-[#9a6700]" role="status">
                  No beds configured for this room.{' '}
                  {onEditRooms ? (
                    <button type="button" className="font-semibold text-finland underline-offset-2 hover:underline" onClick={onEditRooms}>
                      Edit sleeping setup
                    </button>
                  ) : null}
                </p>
              ) : null}
            </div>

            {urls.length > 0 ? (
              <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {urls.map((url, index) => (
                  <li key={`${area.id}-${url}`} className="stay-room-thumb relative overflow-hidden rounded-lg ring-1 ring-[#E6EAF0]">
                    <img src={url} alt="" className="aspect-square w-full object-cover" />
                    <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/55 px-1 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                      {index + 1}
                    </span>
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-0.5 bg-gradient-to-t from-black/55 to-transparent p-1">
                      <button
                        type="button"
                        className="lux-flat flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-ink disabled:opacity-30"
                        disabled={index === 0}
                        aria-label={`Move ${roomLabel} photo ${index + 1} earlier`}
                        onClick={() => move(option.id, area.id, urls, index, -1)}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="lux-flat flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-ink disabled:opacity-30"
                        disabled={index >= urls.length - 1}
                        aria-label={`Move ${roomLabel} photo ${index + 1} later`}
                        onClick={() => move(option.id, area.id, urls, index, 1)}
                      >
                        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                      </button>
                    </div>
                    <button
                      type="button"
                      className="absolute right-1 top-1 rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold text-ink"
                      aria-label={`Remove ${roomLabel} photo ${index + 1} from this room`}
                      onClick={() => write(option.id, area.id, urls.filter((item) => item !== url))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="stay-help">No photos assigned yet.</p>
            )}

            <button
              type="button"
              className="tv-btn-secondary inline-flex min-h-11 items-center justify-center gap-1.5 px-3 text-sm disabled:opacity-40"
              disabled={!canAdd}
              aria-haspopup="dialog"
              onClick={() => setPicker({ optionId: option.id, areaId: area.id, roomLabel })}
            >
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
              Add photos
            </button>
          </section>
        );
      })}

      {picker ? (
        <RoomPhotoPickerDialog
          open
          roomLabel={picker.roomLabel}
          galleryUrls={galleryUrls}
          assigned={urlsFor(
            options.find((row) => row.id === picker.optionId) ?? options[0]!,
            picker.areaId
          )}
          busy={busyId === picker.areaId}
          uploadsEnabled={uploadsEnabled && Boolean(userId)}
          onClose={() => setPicker(null)}
          onApply={(next) => {
            write(picker.optionId, picker.areaId, next);
            setPicker(null);
          }}
          onUpload={(file) => {
            const current = urlsFor(
              options.find((row) => row.id === picker.optionId) ?? options[0]!,
              picker.areaId
            );
            void upload(picker.optionId, picker.areaId, file, current);
          }}
        />
      ) : null}
    </div>
  );
}

function RoomPhotoPickerDialog({
  open,
  roomLabel,
  galleryUrls,
  assigned,
  busy,
  uploadsEnabled,
  onClose,
  onApply,
  onUpload,
}: {
  open: boolean;
  roomLabel: string;
  galleryUrls: string[];
  assigned: string[];
  busy: boolean;
  uploadsEnabled: boolean;
  onClose: () => void;
  onApply: (urls: string[]) => void;
  onUpload: (file: File) => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(() => assigned);
  const pool = galleryUrls.filter((url) => url.startsWith('http'));

  useDialogFocus(open, panelRef, onClose);

  useEffect(() => {
    setDraft(assigned);
  }, [assigned, open]);

  function toggle(url: string) {
    setDraft((current) => {
      if (current.includes(url)) return current.filter((item) => item !== url);
      if (current.length >= 8) return current;
      return [...current, url];
    });
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[#E5E7EB] bg-white shadow-xl sm:rounded-xl pb-[env(safe-area-inset-bottom,0px)]"
      >
        <div className="shrink-0 border-b border-black/[0.06] px-4 py-3">
          <h2 id={titleId} className="text-[15px] font-semibold tracking-tight text-ink">
            Photos for {roomLabel}
          </h2>
          <p className="mt-0.5 text-[12px] text-ink-muted">Select property photos or upload a new one. Up to 8 per room.</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {pool.length > 0 ? (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {pool.map((url, index) => {
                const on = draft.includes(url);
                const full = !on && draft.length >= 8;
                return (
                  <li key={url}>
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={`${on ? 'Deselect' : 'Select'} property photo ${index + 1}`}
                      disabled={full}
                      className={`relative block w-full overflow-hidden rounded-lg ring-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#073b83] disabled:opacity-40 ${
                        on ? 'ring-[#073b83]' : 'ring-transparent hover:ring-[#073b83]/35'
                      }`}
                      onClick={() => toggle(url)}
                    >
                      <img src={url} alt="" className="aspect-square w-full object-cover" />
                      {on ? (
                        <span className="absolute right-1 top-1 rounded bg-[#073b83] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          Selected
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">No property photos yet. Upload one below, or add photos on the property gallery screen first.</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-black/[0.06] px-4 py-3">
          <label className="tv-btn-secondary inline-flex min-h-11 cursor-pointer items-center justify-center px-3 text-sm disabled:opacity-40">
            {busy ? 'Uploading…' : 'Upload new'}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={!uploadsEnabled || busy || draft.length >= 8}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) onUpload(file);
              }}
            />
          </label>
          <div className="ml-auto flex gap-2">
            <button type="button" className="tv-btn-ghost !min-h-11 px-3 text-sm" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="tv-btn-primary !min-h-11 px-3 text-sm"
              disabled={busy}
              onClick={() => onApply(draft)}
            >
              Save selection
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
