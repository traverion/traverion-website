import { useEffect, useId, useState } from 'react';
import { formatMoney } from '../../../lib/money';
import { quoteStayLodging, type StaySeasonWindow } from '../../../lib/stay-season-quote';

type Mode = 'open' | 'scheduled';

type Props = {
  title: string;
  currency: string;
  propertyType: string;
  guests: string;
  bedrooms: string;
  beds: string;
  bathrooms: string;
  nightly: string;
  cleaning: string;
  minNights: string;
  checkIn: string;
  checkOut: string;
  availabilityMode: Mode;
  seasons: StaySeasonWindow[];
  onChange: (patch: {
    stayMaxGuests?: string;
    stayBedrooms?: string;
    stayBeds?: string;
    stayBathrooms?: string;
    stayNightly?: string;
    stayCleaningFee?: string;
    stayMinNights?: string;
    stayCheckIn?: string;
    stayCheckOut?: string;
    stayAvailabilityMode?: Mode;
    staySeasons?: StaySeasonWindow[];
  }) => void;
};

function num(raw: string): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

export default function StayOptionsStep({
  title,
  currency,
  propertyType,
  guests,
  bedrooms,
  beds,
  bathrooms,
  nightly,
  cleaning,
  minNights,
  checkIn,
  checkOut,
  availabilityMode,
  seasons,
  onChange,
}: Props) {
  const titleId = useId();
  const [editing, setEditing] = useState(false);
  const [availability, setAvailability] = useState(false);
  const [draftSeason, setDraftSeason] = useState({ name: '', start: '', end: '', nightly: '', minNights: '' });
  const guestCount = Number.parseInt(guests, 10);
  const bedCount = Number.parseInt(beds, 10);
  const capacityWarn =
    Number.isFinite(guestCount) && guestCount >= 1 && Number.isFinite(bedCount) && bedCount >= 1 && guestCount > bedCount * 2;
  const preview = quoteStayLodging({
    checkIn: '2026-06-10',
    nights: Math.max(1, Number.parseInt(minNights, 10) || 1),
    baseNightly: num(nightly),
    baseMinNights: Math.max(1, Number.parseInt(minNights, 10) || 1),
    availabilityMode,
    seasons,
  });
  const optionName = title.trim() || 'Entire place';
  const openSeasons = seasons.filter((season) => season.enabled);

  useEffect(() => {
    if (!editing && !availability) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setEditing(false);
        setAvailability(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, availability]);

  function addSeason() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draftSeason.start) || !/^\d{4}-\d{2}-\d{2}$/.test(draftSeason.end)) return;
    if (draftSeason.end < draftSeason.start) return;
    const nightlyPrice = num(draftSeason.nightly);
    const min = Number.parseInt(draftSeason.minNights, 10);
    const next: StaySeasonWindow = {
      id: `season-${Date.now().toString(36)}`,
      name: draftSeason.name.trim().slice(0, 80),
      start: draftSeason.start,
      end: draftSeason.end,
      enabled: true,
      nightlyPrice: nightlyPrice > 0 ? nightlyPrice : null,
      minNights: Number.isFinite(min) && min >= 1 ? min : null,
    };
    onChange({
      staySeasons: [...seasons, next].slice(0, 24),
      stayAvailabilityMode: 'scheduled',
    });
    setDraftSeason({ name: '', start: '', end: '', nightly: '', minNights: '' });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#E6EAF0] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-[#111827]">{optionName}</h4>
            <p className="mt-1 text-sm text-ink-muted">
              {propertyType || 'Accommodation'}
              {guests.trim() ? ` · Up to ${guests} guests` : ''}
              {bedrooms.trim() ? ` · ${bedrooms} bedroom${bedrooms === '1' ? '' : 's'}` : ''}
              {beds.trim() ? ` · ${beds} bed${beds === '1' ? '' : 's'}` : ''}
            </p>
            <p className="mt-1 text-sm text-ink">
              {num(nightly) > 0 ? `${formatMoney(num(nightly), currency)} / night` : 'Nightly price not set'}
              {' · 1 accommodation'}
              {availabilityMode === 'scheduled'
                ? ` · ${openSeasons.length} availability period${openSeasons.length === 1 ? '' : 's'}`
                : ' · Open unless a night is blocked'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="tv-btn-secondary !min-h-9 !px-3 text-sm" onClick={() => setEditing(true)}>
              Edit option
            </button>
            <button type="button" className="tv-btn-secondary !min-h-9 !px-3 text-sm" onClick={() => setAvailability(true)}>
              Manage availability
            </button>
          </div>
        </div>
        {capacityWarn ? (
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            Your guest capacity may be higher than the sleeping arrangements you have entered. Please review.
          </p>
        ) : null}
        {preview.ok && num(nightly) > 0 ? (
          <p className="mt-3 text-sm text-ink">
            {preview.nightlyPrices.length} night{preview.nightlyPrices.length === 1 ? '' : 's'} from 10 Jun 2026 ={' '}
            <span className="font-semibold">{formatMoney(preview.lodging + (num(cleaning) > 0 ? num(cleaning) : 0), currency)}</span>
            {num(cleaning) > 0 ? `, including ${formatMoney(num(cleaning), currency)} cleaning` : ''}.
          </p>
        ) : null}
      </div>

      {editing ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
          >
            <h4 id={titleId} className="text-lg font-semibold text-[#111827]">
              Edit option
            </h4>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Count label="Maximum guests *" value={guests} min={1} max={50} onChange={(stayMaxGuests) => onChange({ stayMaxGuests })} />
              <Count label="Bedrooms" value={bedrooms} min={0} max={30} onChange={(stayBedrooms) => onChange({ stayBedrooms })} />
              <Count label="Beds" value={beds} min={0} max={50} onChange={(stayBeds) => onChange({ stayBeds })} />
              <Count label="Bathrooms" value={bathrooms} min={0} max={20} step={0.5} onChange={(stayBathrooms) => onChange({ stayBathrooms })} />
              <label className="block text-sm font-semibold text-ink">
                Base nightly price *
                <input className="tv-input mt-1 w-full" type="number" min={1} value={nightly} onChange={(e) => onChange({ stayNightly: e.target.value })} />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Cleaning fee
                <span className="mt-0.5 block text-xs font-normal text-ink-muted">Once per stay.</span>
                <input className="tv-input mt-1 w-full" type="number" min={0} value={cleaning} onChange={(e) => onChange({ stayCleaningFee: e.target.value })} />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Minimum nights
                <input className="tv-input mt-1 w-full" type="number" min={1} value={minNights} onChange={(e) => onChange({ stayMinNights: e.target.value })} />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Check-in *
                <input className="tv-input mt-1 w-full" type="time" value={checkIn} onChange={(e) => onChange({ stayCheckIn: e.target.value })} />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Check-out *
                <input className="tv-input mt-1 w-full" type="time" value={checkOut} onChange={(e) => onChange({ stayCheckOut: e.target.value })} />
              </label>
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" className="tv-btn-primary !min-h-10 !px-4" onClick={() => setEditing(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {availability ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby={`${titleId}-availability`} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <h4 id={`${titleId}-availability`} className="text-lg font-semibold text-[#111827]">
              Availability
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              A shorter period overrides a longer one on the same night. External calendars are not connected.
            </p>
            <fieldset className="mt-4 space-y-2">
              <legend className="text-sm font-semibold text-ink">When guests can book</legend>
              <label className="flex items-start gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="stay-availability-mode"
                  checked={availabilityMode === 'open'}
                  onChange={() => onChange({ stayAvailabilityMode: 'open' })}
                />
                Open unless a night is blocked on Calendar. Seasons only change the price.
              </label>
              <label className="flex items-start gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="stay-availability-mode"
                  checked={availabilityMode === 'scheduled'}
                  onChange={() => onChange({ stayAvailabilityMode: 'scheduled' })}
                />
                Only the periods below are bookable.
              </label>
            </fieldset>
            <ul className="mt-4 space-y-2">
              {seasons.map((season) => (
                <li key={season.id} className="flex items-start justify-between gap-3 text-sm">
                  <span>
                    <span className="font-semibold text-ink">{season.name || 'Availability period'}</span>
                    <span className="block text-ink-muted">
                      {season.start} – {season.end}
                      {season.nightlyPrice ? ` · ${formatMoney(season.nightlyPrice, currency)} / night` : ' · base price'}
                      {season.enabled ? '' : ' · off'}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="text-sm font-semibold text-finland"
                    onClick={() => onChange({ staySeasons: seasons.filter((row) => row.id !== season.id) })}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-ink sm:col-span-2">
                Name
                <input className="tv-input mt-1 w-full font-normal" value={draftSeason.name} maxLength={80} placeholder="Summer" onChange={(e) => setDraftSeason((d) => ({ ...d, name: e.target.value }))} />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Start
                <input className="tv-input mt-1 w-full font-normal" type="date" value={draftSeason.start} onChange={(e) => setDraftSeason((d) => ({ ...d, start: e.target.value }))} />
              </label>
              <label className="block text-sm font-semibold text-ink">
                End
                <input className="tv-input mt-1 w-full font-normal" type="date" value={draftSeason.end} onChange={(e) => setDraftSeason((d) => ({ ...d, end: e.target.value }))} />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Nightly price
                <input className="tv-input mt-1 w-full font-normal" type="number" min={0} value={draftSeason.nightly} placeholder="Base price" onChange={(e) => setDraftSeason((d) => ({ ...d, nightly: e.target.value }))} />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Minimum nights
                <input className="tv-input mt-1 w-full font-normal" type="number" min={1} value={draftSeason.minNights} onChange={(e) => setDraftSeason((d) => ({ ...d, minNights: e.target.value }))} />
              </label>
            </div>
            <div className="mt-4 flex justify-between gap-2">
              <button type="button" className="tv-btn-secondary !min-h-10 !px-4" onClick={addSeason}>
                Add period
              </button>
              <button type="button" className="tv-btn-primary !min-h-10 !px-4" onClick={() => setAvailability(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Count({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-semibold text-ink">
      {label}
      <input
        className="tv-input mt-1 w-full font-normal"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
