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
          <section key={`${option.id}-${area.id}`} className="rounded-xl bg-white p-4 ring-1 ring-[#E6EAF0]">
            <h4 className="text-sm font-semibold text-ink">{area.name || 'Sleeping area'}</h4>
            <p className="mt-1 text-[12.5px] text-ink-muted">{bedLine(area) || 'Beds not set'}{option.name.trim() ? ` · ${option.name.trim()}` : ''}</p>
            {urls.length > 0 ? (
              <ul className="mt-3 flex gap-2 overflow-x-auto">
                {urls.map((url, index) => (
                  <li key={url} className="w-24 shrink-0">
                    <img src={url} alt="" className="h-20 w-24 rounded-lg object-cover" />
                    <div className="mt-1 flex justify-between text-[12px]">
                      <button
                        type="button"
                        className="min-h-11 text-ink-muted"
                        disabled={index === 0}
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
                      <button type="button" className="min-h-11 text-ink-muted" onClick={() => write(option.id, area.id, urls.filter((item) => item !== url))}>Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {unused.length > 0 ? (
                <select
                  className="tv-input min-w-0 flex-1 font-normal"
                  value=""
                  aria-label={`Use a main photo for ${area.name}`}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    write(option.id, area.id, [...urls, e.target.value].slice(0, 8));
                  }}
                >
                  <option value="">Use a main photo</option>
                  {unused.map((url, index) => (
                    <option key={url} value={url}>Main photo {index + 1}</option>
                  ))}
                </select>
              ) : null}
              <label className="tv-btn-secondary inline-flex min-h-11 cursor-pointer items-center justify-center px-3 text-sm">
                {busyId === area.id ? 'Uploading…' : 'Upload'}
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
            </div>
          </section>
        );
      })}
    </div>
  );
}
