import { useState } from 'react';
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
    onChange(
      options.map((option) => {
        if (option.id !== optionId) return option;
        const rest = (option.roomPhotos ?? []).filter((row) => row.areaId !== areaId);
        return { ...option, roomPhotos: urls.length > 0 ? [...rest, { areaId, urls }] : rest };
      })
    );
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
      if (!current.includes(uploaded.publicUrl)) write(optionId, areaId, [...current, uploaded.publicUrl].slice(0, 8));
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
        const unused = galleryUrls.filter((url) => !urls.includes(url));
        return (
          <section key={`${option.id}-${area.id}`} className="stay-panel space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-ink">{area.name || 'Sleeping area'}</h4>
              <p className="stay-help mt-1">{bedLine(area) || 'Beds not set'}{option.name.trim() ? ` · ${option.name.trim()}` : ''}</p>
            </div>
            {urls.length > 0 ? (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {urls.map((url, index) => (
                  <li key={url} className="space-y-1">
                    <img src={url} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        className="min-h-11 text-xs font-semibold text-ink-muted disabled:opacity-30"
                        disabled={index === 0}
                        aria-label={`Move ${area.name || 'room'} photo ${index + 1} earlier`}
                        onClick={() => {
                          const next = [...urls];
                          const [item] = next.splice(index, 1);
                          if (!item) return;
                          next.splice(index - 1, 0, item);
                          write(option.id, area.id, next);
                        }}
                      >
                        Earlier
                      </button>
                      <span className="text-xs tabular-nums text-ink-muted">{index + 1}</span>
                      <button type="button" className="min-h-11 text-xs font-semibold text-ink-muted" onClick={() => write(option.id, area.id, urls.filter((item) => item !== url))}>Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="stay-help">No photos assigned. Guests only see this room when it has one.</p>
            )}
            {unused.length > 0 ? (
              <div>
                <p className="stay-kicker">Property photos</p>
                <ul className="mt-2 flex gap-2 overflow-x-auto">
                  {unused.map((url, index) => (
                    <li key={url}>
                      <button
                        type="button"
                        className="block overflow-hidden rounded-lg ring-1 ring-[#E6EAF0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#073b83]"
                        aria-label={`Assign property photo ${index + 1} to ${area.name || 'this room'}`}
                        disabled={urls.length >= 8}
                        onClick={() => write(option.id, area.id, [...urls, url].slice(0, 8))}
                      >
                        <img src={url} alt="" className="h-16 w-24 object-cover" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <label className="tv-btn-secondary inline-flex min-h-11 cursor-pointer items-center justify-center px-3 text-sm">
              {busyId === area.id ? 'Uploading…' : 'Upload for this room'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={!uploadsEnabled || busyId != null}
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
