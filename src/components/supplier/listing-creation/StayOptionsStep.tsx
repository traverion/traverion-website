import { useState } from 'react';
import { formatMoney } from '../../../lib/money';
import { quoteStayLodging, type StaySeasonWindow } from '../../../lib/stay-season-quote';
import {
  STAY_BED_KINDS,
  stayBedCount,
  stayCapacityWarning,
  type StayBedKind,
  type StayBedMix,
} from '../../../lib/stay-beds';
import {
  activeStayOptions,
  emptyStayOption,
  newStayOptionId,
  stayOptionStatus,
  stayOptionsNeedSeparateInventory,
  stayScheduleConflicts,
  staySleepingLabel,
  stayStartingNightly,
  type StayAccommodationOption,
} from '../../../lib/stay-options';
import { STAY_SINGLE_PROPERTY_TYPES } from '../../../lib/stay-accommodation';
import type { ListingCreationNavItem } from '../../../lib/listing-creation-workspace';
import { TourOptionWorkspace } from './TourOptionWorkspace';

type Props = {
  title: string;
  currency: string;
  propertyType: string;
  options: StayAccommodationOption[];
  checkIn: string;
  checkOut: string;
  persistLabel: string | null;
  onChange: (options: StayAccommodationOption[]) => void;
  onTimes: (checkIn: string, checkOut: string) => void;
};

function newScheduleId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `stay-sch-${Date.now()}`;
}

export default function StayOptionsStep({
  title,
  currency,
  propertyType,
  options,
  checkIn,
  checkOut,
  persistLabel,
  onChange,
  onTimes,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingScene, setEditingScene] = useState(0);
  const active = activeStayOptions(options);
  const separate = stayOptionsNeedSeparateInventory(options);
  const editing = options.find((option) => option.id === editingId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#111827]">Accommodation options</h3>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-ink-muted">
            {separate
              ? 'These options are saved with the property. Guests cannot book more than one accommodation, or more than one identical unit, until each option has its own night inventory.'
              : 'One accommodation can be reserved. Add another option when this property has a separate bookable space.'}
          </p>
        </div>
        <button
          type="button"
          className="tv-btn-primary !min-h-10 shrink-0 !px-3 text-sm"
          onClick={() => {
            const created = emptyStayOption(newStayOptionId(), propertyType);
            onChange([...options, created]);
            setEditingScene(0);
            setEditingId(created.id);
          }}
        >
          Add option
        </button>
      </div>

      {active.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#E6EAF0] px-4 py-6 text-sm text-ink-muted">
          Add the first accommodation option.
        </p>
      ) : (
        <ul className="space-y-3">
          {active.map((option) => (
            <li key={option.id}>
              <OptionCard
                option={option}
                currency={currency}
                inventoryBlocked={separate}
                onEdit={() => {
                  setEditingScene(0);
                  setEditingId(option.id);
                }}
                onSchedules={() => {
                  setEditingScene(1);
                  setEditingId(option.id);
                }}
                onDuplicate={() => {
                  const copy: StayAccommodationOption = {
                    ...option,
                    id: newStayOptionId(),
                    name: option.name ? `${option.name} copy`.slice(0, 80) : '',
                    schedules: option.schedules.map((schedule) => ({ ...schedule, id: newScheduleId() })),
                  };
                  onChange([...options, copy]);
                }}
                onArchive={() => onChange(options.map((row) => (row.id === option.id ? { ...row, archived: true } : row)))}
              />
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-3 border-t border-[#E6EAF0] pt-4" aria-labelledby="stay-arrival-heading">
        <div>
          <h4 id="stay-arrival-heading" className="text-sm font-semibold text-[#111827]">Check-in and check-out</h4>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            These times apply to the property. They are not a schedule, and the street address stays on Policies.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-ink">
            Check-in
            <input className="tv-input mt-1 w-full font-normal" type="time" value={checkIn} onChange={(e) => onTimes(e.target.value, checkOut)} />
          </label>
          <label className="block text-sm font-semibold text-ink">
            Check-out
            <input className="tv-input mt-1 w-full font-normal" type="time" value={checkOut} onChange={(e) => onTimes(checkIn, e.target.value)} />
          </label>
        </div>
      </section>

      {editing ? (
        <OptionEditor
          option={editing}
          listingTitle={title}
          currency={currency}
          persistLabel={persistLabel}
          inventoryBlocked={stayOptionsNeedSeparateInventory(
            options.map((row) => (row.id === editing.id ? editing : row))
          )}
          initialScene={editingScene}
          onClose={() => setEditingId(null)}
          onCommit={(next) => {
            onChange(options.map((row) => (row.id === next.id ? next : row)));
          }}
        />
      ) : null}
    </div>
  );
}

function OptionCard({
  option,
  currency,
  inventoryBlocked,
  onEdit,
  onSchedules,
  onDuplicate,
  onArchive,
}: {
  option: StayAccommodationOption;
  currency: string;
  inventoryBlocked: boolean;
  onEdit: () => void;
  onSchedules: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
}) {
  const price = stayStartingNightly(option);
  const schedules = option.schedules.filter((schedule) => schedule.enabled);
  return (
    <article className="lc-tile rounded-xl px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[1.05rem] font-semibold tracking-tight text-ink">{option.name.trim() || 'Untitled option'}</h3>
        <p className="text-[11px] font-medium tracking-wide text-ink-muted">{stayOptionStatus(option, inventoryBlocked)}</p>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
        <Fact label="Type" text={option.propertyType || 'Accommodation'} />
        <Fact label="Occupancy" text={option.maxGuests != null ? `Up to ${option.maxGuests} guests` : 'Not set'} />
        <Fact label="Sleeping" text={[option.bedrooms != null ? `${option.bedrooms} bedrooms` : null, staySleepingLabel(option)].filter(Boolean).join(' · ')} />
        <Fact label="Units" text={option.quantity === 1 ? '1 physical unit' : `${option.quantity} identical units`} />
        <Fact label="Schedules" text={schedules.length === 0 ? 'No seasonal schedules' : `${schedules.length} schedule${schedules.length === 1 ? '' : 's'}`} />
        <Fact label="Price" text={price != null ? `From ${formatMoney(price, currency)} / night` : 'Not set'} />
      </dl>
      <div className="mt-3 flex flex-wrap gap-1 border-t border-black/[0.06] pt-2">
        <button type="button" className="tv-btn-primary !min-h-8 !px-2.5 text-[12.5px]" onClick={onEdit}>
          Edit option
        </button>
        <button type="button" className="lux-flat inline-flex min-h-8 items-center rounded-md px-2 text-[12.5px] font-medium text-finland hover:bg-finland/[0.06]" onClick={onSchedules}>
          Manage schedules
        </button>
        <button type="button" className="lux-flat inline-flex min-h-8 items-center rounded-md px-2 text-[12.5px] font-medium text-ink-muted" onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" className="lux-flat inline-flex min-h-8 items-center rounded-md px-2 text-[12.5px] font-medium text-ink-muted" onClick={onArchive}>
          Archive
        </button>
      </div>
    </article>
  );
}

function Fact({ label, text }: { label: string; text: string }) {
  return (
    <div className="min-w-0 text-[13px] leading-snug">
      <dt className="sr-only">{label}</dt>
      <dd className="break-words text-ink">
        <span className="text-ink-muted">{label} · </span>
        {text}
      </dd>
    </div>
  );
}

function OptionEditor({
  option,
  listingTitle,
  currency,
  persistLabel,
  inventoryBlocked,
  initialScene,
  onClose,
  onCommit,
}: {
  option: StayAccommodationOption;
  listingTitle: string;
  currency: string;
  persistLabel: string | null;
  inventoryBlocked: boolean;
  initialScene: number;
  onClose: () => void;
  onCommit: (option: StayAccommodationOption) => void;
}) {
  const [draft, setDraft] = useState(option);
  const [scene, setScene] = useState(initialScene);
  const [scheduleDraft, setScheduleDraft] = useState<StaySeasonWindow | null>(null);
  const guests = draft.maxGuests ?? 0;
  const beds = stayBedCount(draft.bedMix) > 0 ? stayBedCount(draft.bedMix) : draft.beds ?? 0;
  const warning = stayCapacityWarning(guests, draft.bedMix, draft.beds ?? 0);
  const accommodationReady = guests >= 1 && draft.name.trim().length > 0 && beds >= 1;
  const conflicts = stayScheduleConflicts(draft.schedules);
  const nav: ListingCreationNavItem[] = [
    { id: '0', label: 'Accommodation', state: scene === 0 ? 'current' : accommodationReady ? 'complete' : 'upcoming', requirementsMet: accommodationReady },
    { id: '1', label: 'Schedules', state: scene === 1 ? 'current' : 'upcoming', requirementsMet: true },
  ];

  return (
    <>
      <TourOptionWorkspace
        modeTitle={option.name.trim() ? 'Edit option' : 'Create option'}
        optionName={draft.name}
        listingTitle={listingTitle}
        persistLabel={persistLabel}
        continueHint={scene === 0 && !accommodationReady ? 'Add a name, guest capacity, and at least one bed.' : null}
        continueLabel={scene === 1 ? 'Save option' : 'Continue'}
        continueDisabled={scene === 0 && !accommodationReady}
        navItems={nav}
        onSelectNavId={(id) => setScene(Number(id))}
        onBackToOptions={onClose}
        onPreviousScene={scene > 0 ? () => setScene(0) : null}
        onClose={onClose}
        onSaveDraft={() => onCommit(draft)}
        onContinue={() => {
          if (scene === 0) {
            if (!accommodationReady) return;
            setScene(1);
            return;
          }
          onCommit(draft);
          onClose();
        }}
        saveDraftDisabled={false}
      >
        {scene === 0 ? (
          <AccommodationScene draft={draft} warning={warning} onChange={setDraft} />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/[0.08] pb-3">
              <div>
                <h3 className="text-[1.05rem] font-semibold text-ink">Schedules</h3>
                <p className="mt-1 text-[12.5px] text-ink-muted">
                  {draft.schedules.length} schedule{draft.schedules.length === 1 ? '' : 's'} · nightly prices in {currency}
                </p>
              </div>
              <button
                type="button"
                className="tv-btn-primary !min-h-9 !px-3 text-sm"
                onClick={() => {
                  setScheduleDraft({
                    id: newScheduleId(),
                    name: '',
                    start: '',
                    end: '',
                    enabled: true,
                    nightlyPrice: draft.nightlyPrice,
                    minNights: draft.minNights,
                  });
                }}
              >
                Add schedule
              </button>
            </div>
            {inventoryBlocked ? (
              <p className="text-[12.5px] leading-relaxed text-ink-muted">
                This property has more than one bookable space. Schedules are saved, and guests cannot reserve them yet.
              </p>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-ink-muted">
                With no schedule, every night uses the base nightly price unless a night is already reserved. A schedule limits booking to its dates.
              </p>
            )}
            {conflicts.map((line) => (
              <p key={line} className="text-[12.5px] leading-relaxed text-amber-950">{line}</p>
            ))}
            {draft.schedules.length === 0 ? (
              <p className="text-sm text-ink-muted">No schedules yet.</p>
            ) : (
              <ul className="divide-y divide-black/[0.07]">
                {draft.schedules.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <button type="button" className="min-w-0 text-left" onClick={() => setScheduleDraft(row)}>
                      <span className="block text-sm font-semibold text-ink">{row.name.trim() || 'Untitled schedule'}</span>
                      <span className="mt-0.5 block text-[12.5px] text-ink-muted">
                        {row.start && row.end ? `${row.start} – ${row.end}` : 'Dates not set'}
                        {row.nightlyPrice ? ` · ${formatMoney(row.nightlyPrice, currency)} / night` : ''}
                        {row.enabled ? '' : ' · Inactive'}
                      </span>
                    </button>
                    <span className="flex gap-2">
                      <button type="button" className="text-[12.5px] font-semibold text-finland" onClick={() => setScheduleDraft(row)}>
                        Edit schedule
                      </button>
                      <button
                        type="button"
                        className="text-[12.5px] font-medium text-ink-muted"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            schedules: draft.schedules.map((item) => (item.id === row.id ? { ...item, enabled: !item.enabled } : item)),
                          })
                        }
                      >
                        {row.enabled ? 'Deactivate' : 'Activate'}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </TourOptionWorkspace>
      {scheduleDraft ? (
        <ScheduleEditor
          schedule={scheduleDraft}
          currency={currency}
          optionName={draft.name}
          baseNightly={draft.nightlyPrice}
          baseMinNights={draft.minNights}
          maxGuests={draft.maxGuests}
          persistLabel={persistLabel}
          onClose={() => setScheduleDraft(null)}
          onCommit={(next) => {
            const exists = draft.schedules.some((row) => row.id === next.id);
            setDraft({
              ...draft,
              availabilityMode: 'scheduled',
              schedules: exists ? draft.schedules.map((row) => (row.id === next.id ? next : row)) : [...draft.schedules, next],
            });
          }}
        />
      ) : null}
    </>
  );
}

function AccommodationScene({
  draft,
  warning,
  onChange,
}: {
  draft: StayAccommodationOption;
  warning: string | null;
  onChange: (next: StayAccommodationOption) => void;
}) {
  const [kind, setKind] = useState<StayBedKind>('single');
  const rows = STAY_BED_KINDS.filter((bed) => (draft.bedMix[bed.id] ?? 0) > 0);
  const sleeps = rows.reduce((sum, bed) => sum + (draft.bedMix[bed.id] ?? 0) * bed.sleeps, 0);

  function setMix(bedMix: StayBedMix) {
    const count = stayBedCount(bedMix);
    onChange({ ...draft, bedMix, beds: count > 0 ? count : draft.beds });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-ink sm:col-span-2">
          Option name
          <input className="tv-input mt-1 w-full font-normal" value={draft.name} maxLength={80} onChange={(e) => onChange({ ...draft, name: e.target.value.slice(0, 80) })} />
        </label>
        <label className="block text-sm font-semibold text-ink">
          Accommodation type
          <select className="tv-input mt-1 w-full font-normal" value={draft.propertyType} onChange={(e) => onChange({ ...draft, propertyType: e.target.value })}>
            {STAY_SINGLE_PROPERTY_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <Num label="Maximum guests" value={draft.maxGuests} min={1} max={50} onChange={(maxGuests) => onChange({ ...draft, maxGuests })} />
        <Num label="Bedrooms" value={draft.bedrooms} min={0} max={30} onChange={(bedrooms) => onChange({ ...draft, bedrooms })} />
        <Num label="Bathrooms" value={draft.bathrooms} min={0} max={20} step={0.5} onChange={(bathrooms) => onChange({ ...draft, bathrooms })} />
        <Num label="Identical physical units" value={draft.quantity} min={1} max={500} onChange={(quantity) => onChange({ ...draft, quantity: quantity ?? 1 })} />
        <Num label={`Base nightly price`} value={draft.nightlyPrice} min={1} max={1000000} onChange={(nightlyPrice) => onChange({ ...draft, nightlyPrice })} />
        <Num label="Cleaning fee" value={draft.cleaningFee} min={0} max={1000000} onChange={(cleaningFee) => onChange({ ...draft, cleaningFee })} />
        <Num label="Minimum nights" value={draft.minNights} min={1} max={365} onChange={(minNights) => onChange({ ...draft, minNights: minNights ?? 1 })} />
      </div>
      <div className="space-y-2 border-t border-black/[0.08] pt-4">
        <h3 className="text-sm font-semibold text-ink">Sleeping arrangements</h3>
        <p className="text-[12.5px] text-ink-muted">
          {sleeps > 0 ? `These beds sleep ${sleeps}.` : draft.beds ? `${draft.beds} bed${draft.beds === 1 ? '' : 's'} saved without a type.` : 'Add each bed guests can sleep in.'}
        </p>
        <ul className="space-y-2">
          {rows.map((bed) => (
            <li key={bed.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-sm text-ink">{bed.label}</span>
              <input
                className="tv-input w-20 font-normal"
                type="number"
                min={1}
                max={30}
                value={draft.bedMix[bed.id] ?? 1}
                aria-label={`${bed.label} count`}
                onChange={(e) => {
                  const n = Math.floor(Number(e.target.value));
                  setMix({ ...draft.bedMix, [bed.id]: Number.isFinite(n) && n >= 1 ? n : 1 });
                }}
              />
              <button type="button" className="text-[12.5px] font-medium text-ink-muted" onClick={() => {
                const next = { ...draft.bedMix };
                delete next[bed.id];
                setMix(next);
              }}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <select className="tv-input w-auto font-normal" value={kind} aria-label="Bed type" onChange={(e) => setKind(e.target.value as StayBedKind)}>
            {STAY_BED_KINDS.map((bed) => (
              <option key={bed.id} value={bed.id}>{bed.label}</option>
            ))}
          </select>
          <button
            type="button"
            className="tv-btn-secondary !min-h-10 !px-3 text-sm"
            onClick={() => setMix({ ...draft.bedMix, [kind]: (draft.bedMix[kind] ?? 0) + 1 })}
          >
            Add bed
          </button>
        </div>
        {warning ? <p className="text-[12.5px] leading-relaxed text-ink-muted">{warning}</p> : null}
      </div>
    </div>
  );
}

function ScheduleEditor({
  schedule,
  currency,
  optionName,
  baseNightly,
  baseMinNights,
  maxGuests,
  persistLabel,
  onClose,
  onCommit,
}: {
  schedule: StaySeasonWindow;
  currency: string;
  optionName: string;
  baseNightly: number | null;
  baseMinNights: number;
  maxGuests: number | null;
  persistLabel: string | null;
  onClose: () => void;
  onCommit: (schedule: StaySeasonWindow) => void;
}) {
  const [draft, setDraft] = useState(schedule);
  const datesOk = /^\d{4}-\d{2}-\d{2}$/.test(draft.start) && /^\d{4}-\d{2}-\d{2}$/.test(draft.end) && draft.end >= draft.start;
  const price = draft.nightlyPrice && draft.nightlyPrice > 0 ? draft.nightlyPrice : baseNightly;
  const example = datesOk && price && price > 0
    ? quoteStayLodging({
        checkIn: draft.start,
        nights: Math.max(1, draft.minNights ?? baseMinNights),
        baseNightly: price,
        baseMinNights: draft.minNights ?? baseMinNights,
        availabilityMode: 'scheduled',
        seasons: [{ ...draft, enabled: true, nightlyPrice: price }],
      })
    : null;

  function commit() {
    if (!datesOk) return;
    onCommit({ ...draft, enabled: draft.enabled !== false, nightlyPrice: price });
  }

  return (
    <TourOptionWorkspace
      variant="schedule"
      modeTitle={schedule.name.trim() ? 'Edit schedule' : 'Create schedule'}
      optionName={draft.name || optionName}
      listingTitle={optionName || 'Accommodation'}
      persistLabel={persistLabel}
      continueHint={datesOk ? null : 'Choose a start and end date.'}
      continueLabel="Save schedule"
      continueDisabled={!datesOk}
      navItems={[{ id: 'dates', label: 'Dates and price', state: 'current', requirementsMet: datesOk }]}
      onSelectNavId={() => undefined}
      onBackToOptions={onClose}
      onClose={onClose}
      onSaveDraft={() => {
        commit();
      }}
      onContinue={() => {
        commit();
        if (datesOk) onClose();
      }}
      saveDraftDisabled={!datesOk}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-ink sm:col-span-2">
          Schedule name
          <input className="tv-input mt-1 w-full font-normal" value={draft.name} maxLength={80} placeholder="Winter, Christmas, Summer" onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 80) })} />
        </label>
        <label className="block text-sm font-semibold text-ink">
          First night
          <input className="tv-input mt-1 w-full font-normal" type="date" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
        </label>
        <label className="block text-sm font-semibold text-ink">
          Last night
          <input className="tv-input mt-1 w-full font-normal" type="date" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
        </label>
        <label className="block text-sm font-semibold text-ink">
          Nightly price · {currency}
          <input
            className="tv-input mt-1 w-full font-normal"
            type="number"
            min={1}
            value={draft.nightlyPrice ?? ''}
            onChange={(e) => {
              const n = Number(e.target.value);
              setDraft({ ...draft, nightlyPrice: Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null });
            }}
          />
        </label>
        <label className="block text-sm font-semibold text-ink">
          Minimum nights
          <input
            className="tv-input mt-1 w-full font-normal"
            type="number"
            min={1}
            max={365}
            value={draft.minNights ?? baseMinNights}
            onChange={(e) => {
              const n = Math.floor(Number(e.target.value));
              setDraft({ ...draft, minNights: Number.isFinite(n) && n >= 1 ? n : null });
            }}
          />
        </label>
        <p className="text-[12.5px] leading-relaxed text-ink-muted sm:col-span-2">
          Guests on this schedule cannot exceed {maxGuests != null ? `${maxGuests} guests` : 'the accommodation maximum'}. Checkout uses this nightly price for each night inside the dates. A shorter overlapping schedule wins. Check-out morning is not a charged night.
        </p>
        {example && example.ok ? (
          <p className="text-sm text-ink sm:col-span-2">
            Example · {example.nightlyPrices.length} night{example.nightlyPrices.length === 1 ? '' : 's'} ·{' '}
            <span className="font-semibold">{formatMoney(example.lodging, currency)}</span>
          </p>
        ) : null}
      </div>
    </TourOptionWorkspace>
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
