import { useState } from 'react';
import { STAY_AMENITY_PRESETS } from '../../../lib/stay-amenities';
import {
  activeStayUnits,
  emptyStayUnit,
  stayUnitReady,
  type StayUnitDraft,
} from '../../../lib/stay-accommodation';

type Props = {
  units: StayUnitDraft[];
  currency: string;
  onChange: (units: StayUnitDraft[]) => void;
};

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `unit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function moveActive(units: StayUnitDraft[], id: string, direction: -1 | 1): StayUnitDraft[] {
  const activeIds = units.filter((unit) => !unit.archived).map((unit) => unit.id);
  const index = activeIds.indexOf(id);
  const swapId = activeIds[index + direction];
  if (index < 0 || !swapId) return units;
  const a = units.findIndex((unit) => unit.id === id);
  const b = units.findIndex((unit) => unit.id === swapId);
  const copy = units.slice();
  const held = copy[a];
  copy[a] = copy[b];
  copy[b] = held;
  return copy;
}

export default function StayUnitsEditor({ units, currency, onChange }: Props) {
  const [openId, setOpenId] = useState<string | null>(units.find((unit) => !unit.archived)?.id ?? null);
  const active = activeStayUnits(units);
  const archived = units.filter((unit) => unit.archived);

  function patch(id: string, partial: Partial<StayUnitDraft>) {
    onChange(units.map((unit) => (unit.id === id ? { ...unit, ...partial } : unit)));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-[#111827]">Rooms and units</h4>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Each type has its own price, capacity, and quantity. Guests cannot book these until room inventory is
            available.
          </p>
        </div>
        <button
          type="button"
          className="lux-flat shrink-0 rounded-lg bg-[#0B397E] px-3 py-2 text-sm font-semibold text-white"
          onClick={() => {
            const unit = emptyStayUnit(newId());
            onChange([...units, unit]);
            setOpenId(unit.id);
          }}
        >
          Add room type
        </button>
      </div>
      {active.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#E6EAF0] px-4 py-6 text-sm text-ink-muted">
          Add the first room or unit type. A hotel, resort, or cabin village lists each bookable type here.
        </p>
      ) : null}
      <ul className="space-y-3">
        {active.map((unit, index) => {
          const open = openId === unit.id;
          const ready = stayUnitReady(unit);
          return (
            <li key={unit.id} className="rounded-xl border border-[#E6EAF0] bg-white">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : unit.id)}
              >
                <span>
                  <span className="block text-sm font-semibold text-ink">{unit.name.trim() || 'Untitled room type'}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    {unit.maxGuests != null ? `${unit.maxGuests} guests` : 'Capacity not set'}
                    {unit.nightlyPriceUsd != null ? ` · ${unit.nightlyPriceUsd} ${currency} / night` : ''}
                    {` · ${unit.quantity} available`}
                    {ready ? '' : ' · Incomplete'}
                  </span>
                </span>
                <span className="text-xs font-semibold text-[#0B397E]">{open ? 'Close' : 'Edit'}</span>
              </button>
              {open ? (
                <div className="space-y-4 border-t border-[#E6EAF0] px-4 py-4">
                  <label className="block text-sm font-semibold text-ink">
                    Name *
                    <input
                      value={unit.name}
                      onChange={(e) => patch(unit.id, { name: e.target.value.slice(0, 80) })}
                      className="tv-input mt-1 w-full"
                      placeholder="e.g. Standard room"
                      maxLength={80}
                    />
                  </label>
                  <label className="block text-sm font-semibold text-ink">
                    Short description
                    <textarea
                      value={unit.description}
                      onChange={(e) => patch(unit.id, { description: e.target.value.slice(0, 400) })}
                      className="tv-input mt-1 min-h-[4.5rem] w-full resize-y"
                      maxLength={400}
                      placeholder="What is different about this room type"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <NumberField
                      label="Maximum guests *"
                      value={unit.maxGuests}
                      min={1}
                      max={50}
                      onChange={(maxGuests) => patch(unit.id, { maxGuests })}
                    />
                    <NumberField
                      label="How many of this type *"
                      value={unit.quantity}
                      min={1}
                      max={500}
                      onChange={(quantity) => patch(unit.id, { quantity: quantity ?? 1 })}
                    />
                    <NumberField
                      label="Bedrooms"
                      value={unit.bedrooms}
                      min={0}
                      max={30}
                      onChange={(bedrooms) => patch(unit.id, { bedrooms })}
                    />
                    <NumberField
                      label="Beds"
                      value={unit.beds}
                      min={0}
                      max={50}
                      onChange={(beds) => patch(unit.id, { beds })}
                    />
                    <NumberField
                      label="Bathrooms"
                      value={unit.bathrooms}
                      min={0}
                      max={20}
                      step={0.5}
                      onChange={(bathrooms) => patch(unit.id, { bathrooms })}
                    />
                    <NumberField
                      label="Nightly price *"
                      value={unit.nightlyPriceUsd}
                      min={1}
                      max={1000000}
                      onChange={(nightlyPriceUsd) => patch(unit.id, { nightlyPriceUsd })}
                    />
                    <NumberField
                      label="Minimum nights"
                      value={unit.minNights}
                      min={1}
                      max={365}
                      onChange={(minNights) => patch(unit.id, { minNights: minNights ?? 1 })}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold text-ink">Amenities for this type</p>
                    <div className="flex flex-wrap gap-2">
                      {STAY_AMENITY_PRESETS.map((label) => {
                        const on = unit.amenities.some((item) => item.toLowerCase() === label.toLowerCase());
                        return (
                          <button
                            key={label}
                            type="button"
                            aria-pressed={on}
                            className={`lux-flat rounded-full px-3 py-1.5 text-sm ${
                              on ? 'bg-[#0B397E] text-white' : 'text-ink-muted ring-1 ring-[#E6EAF0]'
                            }`}
                            onClick={() =>
                              patch(unit.id, {
                                amenities: on
                                  ? unit.amenities.filter((item) => item.toLowerCase() !== label.toLowerCase())
                                  : [...unit.amenities, label],
                              })
                            }
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="lux-flat rounded-lg px-3 py-2 text-sm font-semibold text-ink ring-1 ring-[#E6EAF0]"
                      disabled={index === 0}
                      onClick={() => onChange(moveActive(units, unit.id, -1))}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className="lux-flat rounded-lg px-3 py-2 text-sm font-semibold text-ink ring-1 ring-[#E6EAF0]"
                      disabled={index === active.length - 1}
                      onClick={() => onChange(moveActive(units, unit.id, 1))}
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      className="lux-flat rounded-lg px-3 py-2 text-sm font-semibold text-ink ring-1 ring-[#E6EAF0]"
                      onClick={() => {
                        const copy = emptyStayUnit(newId());
                        copy.name = unit.name ? `${unit.name} copy`.slice(0, 80) : '';
                        copy.description = unit.description;
                        copy.maxGuests = unit.maxGuests;
                        copy.bedrooms = unit.bedrooms;
                        copy.beds = unit.beds;
                        copy.bathrooms = unit.bathrooms;
                        copy.amenities = unit.amenities.slice();
                        copy.nightlyPriceUsd = unit.nightlyPriceUsd;
                        copy.quantity = unit.quantity;
                        copy.minNights = unit.minNights;
                        onChange([...units, copy]);
                        setOpenId(copy.id);
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="lux-flat rounded-lg px-3 py-2 text-sm font-semibold text-ink ring-1 ring-[#E6EAF0]"
                      onClick={() => {
                        patch(unit.id, { archived: true });
                        setOpenId(null);
                      }}
                    >
                      Archive
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {archived.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink-muted">Archived</p>
          {archived.map((unit) => (
            <div key={unit.id} className="flex items-center justify-between gap-3 rounded-lg bg-paper-raised px-3 py-2">
              <span className="text-sm text-ink-muted">{unit.name.trim() || 'Untitled room type'}</span>
              <button
                type="button"
                className="text-sm font-semibold text-[#0B397E]"
                onClick={() => patch(unit.id, { archived: false })}
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block text-sm font-semibold text-ink">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (!raw) {
            onChange(null);
            return;
          }
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : null);
        }}
        className="tv-input mt-1 w-full"
      />
    </label>
  );
}
