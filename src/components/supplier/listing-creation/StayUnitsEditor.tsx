import { useState } from 'react';
import {
  activeStayUnits,
  emptyStayUnit,
  stayUnitReady,
  type StayUnitDraft,
} from '../../../lib/stay-accommodation';
import type { ListingCreationNavItem } from '../../../lib/listing-creation-workspace';
import { TourOptionWorkspace } from './TourOptionWorkspace';

type Props = {
  units: StayUnitDraft[];
  currency: string;
  onChange: (units: StayUnitDraft[]) => void;
};

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `unit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function StayUnitsEditor({ units, currency, onChange }: Props) {
  const [draft, setDraft] = useState<StayUnitDraft | null>(null);
  const [scene, setScene] = useState(0);
  const active = activeStayUnits(units);
  const archived = units.filter((unit) => unit.archived);

  function openEditor(unit: StayUnitDraft) {
    setDraft({ ...unit, amenities: unit.amenities.slice() });
    setScene(0);
  }

  function commit(next: StayUnitDraft) {
    const exists = units.some((unit) => unit.id === next.id);
    onChange(exists ? units.map((unit) => (unit.id === next.id ? next : unit)) : [...units, next]);
  }

  const scenes = ['Details', 'Pricing'];
  const detailsReady = Boolean(draft?.name.trim() && draft.maxGuests && draft.maxGuests >= 1 && draft.quantity >= 1);
  const priceReady = Boolean(draft?.nightlyPriceUsd && draft.nightlyPriceUsd > 0);
  const nav: ListingCreationNavItem[] = scenes.map((label, index) => ({
    id: String(index),
    label,
    state: index === scene ? 'current' : (index === 0 ? detailsReady : priceReady) ? 'complete' : 'upcoming',
    requirementsMet: index === 0 ? detailsReady : priceReady,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-[#111827]">Rooms and units</h4>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Each type keeps its own price and quantity. Guests cannot book these until room inventory is available.
          </p>
        </div>
        <button
          type="button"
          className="tv-btn-primary !min-h-10 shrink-0 !px-3 text-sm"
          onClick={() => openEditor(emptyStayUnit(newId()))}
        >
          Add room type
        </button>
      </div>
      {active.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#E6EAF0] px-4 py-6 text-sm text-ink-muted">
          Add the first room or unit type.
        </p>
      ) : null}
      <ul className="space-y-3">
        {active.map((unit) => {
          const ready = stayUnitReady(unit);
          return (
            <li key={unit.id} className="lc-tile rounded-xl px-4 py-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[1.05rem] font-semibold text-ink">{unit.name.trim() || 'Untitled room type'}</h3>
                <p className="text-[11px] font-medium text-ink-muted">{ready ? 'Configured' : 'Incomplete'}</p>
              </div>
              <p className="mt-2 text-[13px] text-ink">
                <span className="text-ink-muted">Occupancy · </span>
                {unit.maxGuests != null ? `Up to ${unit.maxGuests} guests` : 'Not set'}
                {unit.beds != null ? ` · ${unit.beds} beds` : ''}
              </p>
              <p className="mt-1 text-[13px] text-ink">
                <span className="text-ink-muted">Price · </span>
                {unit.nightlyPriceUsd != null ? `${unit.nightlyPriceUsd} ${currency} / night` : 'Not set'}
                {` · ${unit.quantity} identical units`}
              </p>
              <div className="mt-3 flex flex-wrap gap-1 border-t border-black/[0.06] pt-2">
                <button type="button" className="tv-btn-primary !min-h-8 !px-2.5 text-[12.5px]" onClick={() => openEditor(unit)}>
                  Edit option
                </button>
                <button
                  type="button"
                  className="lux-flat inline-flex min-h-8 items-center rounded-md px-2 text-[12.5px] font-medium text-ink-muted"
                  onClick={() => {
                    onChange([
                      ...units,
                      {
                        ...unit,
                        id: newId(),
                        name: unit.name ? `${unit.name} copy`.slice(0, 80) : '',
                        amenities: unit.amenities.slice(),
                        archived: false,
                      },
                    ]);
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="lux-flat inline-flex min-h-8 items-center rounded-md px-2 text-[12.5px] font-medium text-ink-muted"
                  onClick={() => onChange(units.map((row) => (row.id === unit.id ? { ...row, archived: true } : row)))}
                >
                  Archive
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {archived.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink-muted">Archived</p>
          {archived.map((unit) => (
            <div key={unit.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2">
              <span className="text-sm text-ink-muted">{unit.name.trim() || 'Untitled room type'}</span>
              <button type="button" className="text-sm font-semibold text-[#0B397E]" onClick={() => onChange(units.map((row) => (row.id === unit.id ? { ...row, archived: false } : row)))}>
                Restore
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {draft ? (
        <TourOptionWorkspace
          modeTitle={units.some((unit) => unit.id === draft.id) ? 'Edit option' : 'Create option'}
          optionName={draft.name}
          listingTitle="Room types"
          persistLabel={null}
          continueHint={(scene === 0 ? detailsReady : priceReady) ? null : 'Finish this section to continue.'}
          continueLabel={scene === 1 ? 'Save option' : 'Continue'}
          continueDisabled={scene === 0 ? !detailsReady : !priceReady}
          navItems={nav}
          onSelectNavId={(id) => setScene(Number(id))}
          onBackToOptions={() => setDraft(null)}
          onPreviousScene={scene > 0 ? () => setScene(0) : null}
          onClose={() => setDraft(null)}
          onSaveDraft={() => commit(draft)}
          onContinue={() => {
            if (scene === 0) {
              if (!detailsReady) return;
              setScene(1);
              return;
            }
            if (!priceReady) return;
            commit(draft);
            setDraft(null);
          }}
          saveDraftDisabled={false}
        >
          {scene === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-ink sm:col-span-2">
                Name *
                <input className="tv-input mt-1 w-full font-normal" value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 80) })} />
              </label>
              <Num label="Maximum guests *" value={draft.maxGuests} min={1} max={50} onChange={(maxGuests) => setDraft({ ...draft, maxGuests })} />
              <Num label="Identical units *" value={draft.quantity} min={1} max={500} onChange={(quantity) => setDraft({ ...draft, quantity: quantity ?? 1 })} />
              <Num label="Bedrooms" value={draft.bedrooms} min={0} max={30} onChange={(bedrooms) => setDraft({ ...draft, bedrooms })} />
              <Num label="Beds" value={draft.beds} min={0} max={50} onChange={(beds) => setDraft({ ...draft, beds })} />
              <Num label="Bathrooms" value={draft.bathrooms} min={0} max={20} step={0.5} onChange={(bathrooms) => setDraft({ ...draft, bathrooms })} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Num label={`Nightly price * · ${currency}`} value={draft.nightlyPriceUsd} min={1} max={1000000} onChange={(nightlyPriceUsd) => setDraft({ ...draft, nightlyPriceUsd })} />
              <Num label="Minimum nights" value={draft.minNights} min={1} max={365} onChange={(minNights) => setDraft({ ...draft, minNights: minNights ?? 1 })} />
              <p className="text-xs text-ink-muted sm:col-span-2">This price is saved with the draft. Checkout does not reserve room types yet.</p>
            </div>
          )}
        </TourOptionWorkspace>
      ) : null}
    </div>
  );
}

function Num({
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
        className="tv-input mt-1 w-full font-normal"
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
      />
    </label>
  );
}
