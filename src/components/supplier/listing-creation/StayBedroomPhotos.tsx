import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { STAY_BED_KINDS, type StaySleepingArea } from '../../../lib/stay-beds';
import { prepareListingImageFile } from '../../../lib/listing-image-prepare';
import { uploadListingImage } from '../../../data/supabase-listing-images';
import type { StayAccommodationOption } from '../../../lib/stay-options';

type Props = {
  options: StayAccommodationOption[];
  galleryUrls: string[];
  userId?: string;
  uploadsEnabled: boolean;
  onChange: (options: StayAccommodationOption[]) => void;
};

function bedLine(area: StaySleepingArea): string {
  const parts = area.beds.map((bed) => {
    const label = STAY_BED_KINDS.find((kind) => kind.id === bed.kind)?.label ?? 'Bed';
    return `${bed.count} ${label.toLowerCase()}${bed.count === 1 ? '' : 's'}`;
  });
  return parts.join(', ');
}

export default function StayBedroomPhotos({ options, galleryUrls, userId, uploadsEnabled, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const areas = options.filter((option) => !option.archived).flatMap((option) =>
    option.sleepingAreas.map((area) => ({ option, area }))
  );

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

  function assign(optionId: string, areaId: string, urls: string[], url: string) {
    if (!url.startsWith('http') || urls.includes(url) || urls.length >= 8) return;
    write(optionId, areaId, [...urls, url]);
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
      if (!current.includes(uploaded.publicUrl)) write(optionId, areaId, [...current, uploaded.publicUrl]);
    } catch {
      setError('That photo could not be uploaded.');
    } finally {
      setBusyId(null);
    }
  }

  if (areas.length === 0) {
    return (
      <p className="rounded-xl px-4 py-6 text-sm text-ink-muted ring-1 ring-[#E6EAF0]">
        Add sleeping areas in Options & availability. Bedroom photos can be attached after those rooms exist.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">Bedroom photos are optional. Guests only see a room when it has a photo.</p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {areas.map(({ option, area }) => {
        const urls = urlsFor(option, area.id);
        const unused = galleryUrls.filter((url) => url.startsWith('http') && !urls.includes(url));
        const roomLabel = area.name || 'Sleeping area';
        return (
          <section key={`${option.id}-${area.id}`} className="stay-panel stay-room-photo-card space-y-2.5">
            <div>
              <h4 className="text-sm font-semibold text-ink">{roomLabel}</h4>
              <p className="stay-help mt-0.5">{bedLine(area) || 'Beds not set'}{option.name.trim() ? ` · ${option.name.trim()}` : ''}</p>
            </div>

            <div className="space-y-1.5">
              <p className="stay-kicker">Assigned to this room</p>
              {urls.length > 0 ? (
                <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {urls.map((url, index) => (
                    <li key={`${area.id}-${url}`} className="stay-room-thumb group relative overflow-hidden rounded-lg ring-1 ring-[#E6EAF0]">
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
                        aria-label={`Remove ${roomLabel} photo ${index + 1}`}
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
            </div>

            {unused.length > 0 ? (
              <div className="space-y-1.5 border-t border-[#E6EAF0] pt-2.5">
                <p className="stay-kicker">Property photos</p>
                <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                  {unused.map((url, index) => {
                    const canAssign = urls.length < 8;
                    return (
                      <li key={`pool-${area.id}-${url}`}>
                        <button
                          type="button"
                          className={`block w-full overflow-hidden rounded-lg ring-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#073b83] ${
                            canAssign ? 'ring-[#E6EAF0] hover:ring-[#073b83]/40' : 'cursor-not-allowed opacity-40 ring-[#E6EAF0]'
                          }`}
                          aria-label={`Assign property photo ${index + 1} to ${roomLabel}`}
                          aria-pressed={false}
                          disabled={!canAssign}
                          onClick={() => assign(option.id, area.id, urls, url)}
                        >
                          <img src={url} alt="" className="aspect-square w-full object-cover" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="stay-help">Tap a property photo to assign it. Assigned photos leave this row.</p>
              </div>
            ) : null}

            <label className="tv-btn-secondary inline-flex min-h-11 cursor-pointer items-center justify-center px-3 text-sm">
              {busyId === area.id ? 'Uploading…' : 'Upload for this room'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={!uploadsEnabled || busyId != null || urls.length >= 8}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  void upload(option.id, area.id, file, urls);
                }}
              />
            </label>
          </section>
        );
      })}
    </div>
  );
}
