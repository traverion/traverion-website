import { useState } from 'react';
import { formatMoney } from '../../../lib/money';
import { quoteStayLodging, type StaySeasonWindow } from '../../../lib/stay-season-quote';
import {
  STAY_BED_KINDS,
  stayAreasFromMix,
  stayBedCount,
  stayCapacityWarning,
  stayMixFromAreas,
  type StayBedKind,
  type StaySleepingArea,
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
import { TraverionSingleDateField } from '../../calendar/TraverionSingleDateField';
import { TourOptionWorkspace } from './TourOptionWorkspace';

type Props = {
  title: string;
  currency: string;
  propertyType: string;
  options: StayAccommodationOption[];
  persistLabel: string | null;
  onChange: (options: StayAccommodationOption[]) => void;
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
  persistLabel,
  onChange,
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
          <p className="max-w-xl text-sm text-ink-muted">
            {separate
              ? 'Extra options are saved. Guests cannot book more than one accommodation until each option has its own night inventory.'
              : 'Add each accommodation a guest can reserve. Dates, prices, and check-in live on that option’s availability.'}
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
          Manage availability
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
  const accommodationReady = guests >= 1 && draft.name.trim().length > 0 && beds >= 1 && !warning;
  const availabilityReady =
    draft.schedules.some(
      (row) => row.enabled && row.nightlyPrice && row.start && row.end && row.checkIn && row.checkOut
    ) || (draft.schedules.length === 0 && draft.availabilityMode !== 'scheduled' && (draft.nightlyPrice ?? 0) > 0);
  const cutoffReady = typeof draft.cutoffMinutes === 'number' && draft.cutoffMinutes >= 0;
  const conflicts = stayScheduleConflicts(draft.schedules);
  const nav: ListingCreationNavItem[] = [
    { id: '0', label: 'Accommodation', state: scene === 0 ? 'current' : accommodationReady ? 'complete' : 'upcoming', requirementsMet: accommodationReady },
    { id: '1', label: 'Availability', state: scene === 1 ? 'current' : availabilityReady ? 'complete' : 'upcoming', requirementsMet: availabilityReady },
    { id: '2', label: 'Cutoff time', state: scene === 2 ? 'current' : cutoffReady ? 'complete' : 'upcoming', requirementsMet: cutoffReady },
  ];

  return (
    <>
      <TourOptionWorkspace
        modeTitle={option.name.trim() ? 'Edit option' : 'Create option'}
        optionName={draft.name}
        listingTitle={listingTitle}
        persistLabel={persistLabel}
        continueHint={
          scene === 0 && !accommodationReady
            ? warning ?? 'Add a name, guest capacity, and sleeping arrangements that fit those guests.'
            : scene === 2 && !cutoffReady
              ? 'Choose how long before check-in booking closes.'
              : null
        }
        continueLabel={scene === 2 ? 'Save option' : 'Continue'}
        continueDisabled={(scene === 0 && !accommodationReady) || (scene === 2 && !cutoffReady)}
        navItems={nav}
        onSelectNavId={(id) => setScene(Number(id))}
        onBackToOptions={onClose}
        onPreviousScene={scene > 0 ? () => setScene((n) => n - 1) : null}
        onClose={onClose}
        onSaveDraft={() => onCommit(draft)}
        onContinue={() => {
          if (scene === 0) {
            if (!accommodationReady) return;
            setScene(1);
            return;
          }
          if (scene === 1) {
            setScene(2);
            return;
          }
          if (!cutoffReady) return;
          onCommit(draft);
          onClose();
        }}
        saveDraftDisabled={false}
      >
        {scene === 0 ? (
          <AccommodationScene draft={draft} warning={warning} onChange={setDraft} />
        ) : scene === 2 ? (
          <CutoffScene draft={draft} onChange={setDraft} />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/[0.08] pb-3">
              <div>
                <h3 className="text-[1.05rem] font-semibold text-ink">Availability</h3>
                <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-ink-muted">
                  Set when guests can book this accommodation, how many guests can stay, and the price and rules for each period.
                </p>
              </div>
              <button
                type="button"
                className="tv-btn-primary !min-h-9 !px-3 text-sm"
                onClick={() => {
                  const previous = draft.schedules.find((row) => row.checkIn && row.checkOut);
                  setScheduleDraft({
                    id: newScheduleId(),
                    name: '',
                    start: '',
                    end: '',
                    enabled: true,
                    nightlyPrice: draft.nightlyPrice,
                    minNights: draft.minNights,
                    maxNights: null,
                    minGuests: 1,
                    maxGuests: draft.maxGuests,
                    checkIn: previous?.checkIn ?? '',
                    checkOut: previous?.checkOut ?? '',
                    cleaningFee: draft.cleaningFee,
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
                {draft.schedules.length === 0 && (draft.nightlyPrice ?? 0) > 0 && draft.availabilityMode !== 'scheduled'
                  ? 'This stay is still bookable on its saved nightly price. Add a schedule when you want specific dates.'
                  : 'Guests can book a night only when an active schedule covers it.'}
              </p>
            )}
            {conflicts.map((line) => (
              <p key={line} className="text-[12.5px] leading-relaxed text-amber-950">{line}</p>
            ))}
            <p className="text-[12.5px] text-ink-muted">
              {draft.schedules.filter((row) => row.enabled).length} active
              {draft.quantity > 1 ? ` · ${draft.quantity} physical units` : ' · 1 physical unit'}
              {stayStartingNightly(draft) != null ? ` · from ${formatMoney(stayStartingNightly(draft) ?? 0, currency)} / night` : ''}
            </p>
            {draft.schedules.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#E6EAF0] px-4 py-8 text-center">
                <p className="text-sm font-semibold text-ink">No availability yet</p>
                <p className="mx-auto mt-1 max-w-md text-[12.5px] text-ink-muted">Guests cannot book nights until this option has an active schedule with dates and a price.</p>
              </div>
            ) : (
              <ul className="divide-y divide-black/[0.07]">
                {draft.schedules.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <button type="button" className="min-w-0 text-left" onClick={() => setScheduleDraft(row)}>
                      <span className="block text-sm font-semibold text-ink">{row.name.trim() || 'Untitled schedule'}</span>
                      <span className="mt-0.5 block text-[12.5px] text-ink-muted">
                        {row.start && row.end ? `${row.start} – ${row.end}` : 'Dates not set'}
                        {row.nightlyPrice ? ` · ${formatMoney(row.nightlyPrice, currency)} / night` : ''}
                        {row.minGuests || row.maxGuests ? ` · ${row.minGuests ?? 1}–${row.maxGuests ?? draft.maxGuests ?? '…'} guests` : ''}
                        {row.minNights ? ` · min ${row.minNights} nights` : ''}
                        {row.checkIn && row.checkOut ? ` · ${row.checkIn}–${row.checkOut}` : ''}
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
                      <button
                        type="button"
                        className="text-[12.5px] font-medium text-ink-muted"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            schedules: [...draft.schedules, { ...row, id: newScheduleId(), enabled: false, name: row.name ? `${row.name} copy`.slice(0, 80) : '' }],
                          })
                        }
                      >
                        Duplicate
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
          baseMinNights={draft.minNights}
          maxGuests={draft.maxGuests}
          persistLabel={persistLabel}
          onClose={() => setScheduleDraft(null)}
          others={draft.schedules.filter((row) => row.id !== scheduleDraft.id)}
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
  const rows = STAY_BED_KINDS.filter((bed) => (draft.bedMix[bed.id] ?? 0) > 0);
  const sleeps = rows.reduce((sum, bed) => sum + (draft.bedMix[bed.id] ?? 0) * bed.sleeps, 0);

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
        <label className="block text-sm font-semibold text-ink sm:col-span-2">
          Short description
          <textarea className="tv-input mt-1 w-full font-normal" rows={2} maxLength={240} value={draft.description} onChange={(e) => onChange({ ...draft, description: e.target.value.slice(0, 240) })} />
        </label>
      </div>
      <p className="text-[12.5px] text-ink-muted">
        {[draft.bedrooms != null ? `${draft.bedrooms} bedrooms` : null, sleeps > 0 ? `${rows.reduce((sum, bed) => sum + (draft.bedMix[bed.id] ?? 0), 0)} beds` : null, sleeps > 0 ? `Sleeps ${sleeps}` : null].filter(Boolean).join(' · ') || 'Add the beds guests can sleep in.'}
      </p>
      <SleepingEditor draft={draft} warning={warning} onChange={onChange} />
    </div>
  );
}

function ScheduleEditor({
  schedule,
  currency,
  optionName,
  baseMinNights,
  maxGuests,
  persistLabel,
  others,
  onClose,
  onCommit,
}: {
  schedule: StaySeasonWindow;
  currency: string;
  optionName: string;
  baseMinNights: number;
  maxGuests: number | null;
  persistLabel: string | null;
  others: StaySeasonWindow[];
  onClose: () => void;
  onCommit: (schedule: StaySeasonWindow) => void;
}) {
  const [draft, setDraft] = useState(schedule);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const datesOk = /^\d{4}-\d{2}-\d{2}$/.test(draft.start) && /^\d{4}-\d{2}-\d{2}$/.test(draft.end) && draft.end >= draft.start;
  const price = draft.nightlyPrice && draft.nightlyPrice > 0 ? draft.nightlyPrice : null;
  const guestsOk =
    (draft.minGuests == null || draft.maxGuests == null || draft.minGuests <= draft.maxGuests) &&
    (draft.maxGuests == null || maxGuests == null || draft.maxGuests <= maxGuests);
  const nightsOk = draft.maxNights == null || draft.minNights == null || draft.maxNights >= draft.minNights;
  const timesOk = /^\d{2}:\d{2}$/.test(draft.checkIn ?? '') && /^\d{2}:\d{2}$/.test(draft.checkOut ?? '');
  const overlap = datesOk && draft.enabled !== false ? stayScheduleConflicts([...others, { ...draft, enabled: true }]) : [];
  const ready = datesOk && price != null && guestsOk && nightsOk && timesOk && overlap.length === 0;
  const nights = Math.max(1, draft.minNights ?? baseMinNights);
  const example = ready
    ? quoteStayLodging({
        checkIn: draft.start,
        nights,
        baseNightly: price,
        baseMinNights: draft.minNights ?? baseMinNights,
        availabilityMode: 'scheduled',
        seasons: [{ ...draft, enabled: true, nightlyPrice: price }],
      })
    : null;
  const cleaning = draft.cleaningFee && draft.cleaningFee > 0 ? draft.cleaningFee : 0;

  function commit() {
    if (!ready || price == null) {
      setError(overlap[0] ?? 'Add dates, a nightly price, guest limits, and check-in and check-out times.');
      return false;
    }
    onCommit({ ...draft, enabled: draft.enabled !== false, nightlyPrice: price });
    return true;
  }

  const detailsOk = guestsOk && nightsOk && timesOk;
  const datesStepOk = datesOk && overlap.length === 0;
  const priceOk = price != null;
  const stepOk = [detailsOk, datesStepOk, priceOk, ready];
  const stepLabels = ['Schedule details', 'Availability', 'Pricing', 'Review'];

  return (
    <TourOptionWorkspace
      variant="schedule"
      modeTitle={schedule.name.trim() ? 'Edit schedule' : 'Create schedule'}
      optionName={draft.name || optionName}
      listingTitle={optionName || 'Accommodation'}
      persistLabel={persistLabel}
      continueHint={stepOk[step] ? null : overlap[0] ?? 'Finish this step to continue.'}
      continueLabel={step === 3 ? 'Save schedule' : 'Continue'}
      continueDisabled={!stepOk[step]}
      navItems={stepLabels.map((label, index) => ({
        id: String(index),
        label,
        state: index === step ? 'current' : stepOk[index] ? 'complete' : 'upcoming',
        requirementsMet: stepOk[index],
      }))}
      onSelectNavId={(id) => setStep(Number(id))}
      onBackToOptions={onClose}
      onPreviousScene={step > 0 ? () => setStep((n) => n - 1) : null}
      onClose={onClose}
      onSaveDraft={() => onCommit({ ...draft, nightlyPrice: price })}
      onContinue={() => {
        if (!stepOk[step]) return;
        if (step < 3) {
          setStep((n) => n + 1);
          return;
        }
        if (commit()) onClose();
      }}
      saveDraftDisabled={false}
    >
      {step === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-ink sm:col-span-2">
            Schedule name
            <input className="tv-input mt-1 w-full font-normal" value={draft.name} maxLength={80} placeholder="Winter, Christmas, Summer" onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 80) })} />
          </label>
          <Num label="Minimum guests" value={draft.minGuests ?? 1} min={1} max={maxGuests ?? 50} onChange={(minGuests) => setDraft({ ...draft, minGuests })} />
          <Num label="Maximum guests" value={draft.maxGuests ?? maxGuests} min={1} max={maxGuests ?? 50} onChange={(value) => setDraft({ ...draft, maxGuests: value != null && maxGuests != null ? Math.min(value, maxGuests) : value })} />
          <Num label="Minimum nights" value={draft.minNights ?? baseMinNights} min={1} max={365} onChange={(minNights) => setDraft({ ...draft, minNights })} />
          <Num label="Maximum nights" value={draft.maxNights ?? null} min={1} max={365} onChange={(maxNights) => setDraft({ ...draft, maxNights })} />
          <Clock label="Check-in" value={draft.checkIn ?? ''} onChange={(checkIn) => setDraft({ ...draft, checkIn })} />
          <Clock label="Check-out" value={draft.checkOut ?? ''} onChange={(checkOut) => setDraft({ ...draft, checkOut })} />
          {!guestsOk || !nightsOk ? <p className="text-[12.5px] text-amber-950 sm:col-span-2">Guest and night limits must fit this accommodation.</p> : null}
        </div>
      ) : null}
      {step === 1 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <TraverionSingleDateField id={`${draft.id}-start`} label="First occupied night" value={draft.start} minIso="" placeholder="Choose a date" onChange={(start) => setDraft({ ...draft, start })} />
          <TraverionSingleDateField id={`${draft.id}-end`} label="Last occupied night" value={draft.end} minIso="" placeholder="Choose a date" onChange={(end) => setDraft({ ...draft, end })} />
          <p className="text-[12.5px] leading-relaxed text-ink-muted sm:col-span-2">The last night is occupied. The next morning is check-out and is not charged. Individual night blocks stay on the property calendar.</p>
          {overlap[0] ? <p className="text-[12.5px] text-amber-950 sm:col-span-2">{overlap[0]}</p> : null}
        </div>
      ) : null}
      {step === 2 ? (
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          <Num label={`Price per night · ${currency}`} value={draft.nightlyPrice} min={1} max={1000000} onChange={(nightlyPrice) => setDraft({ ...draft, nightlyPrice })} />
          <Num label={`Cleaning fee · ${currency}`} value={draft.cleaningFee} min={0} max={1000000} onChange={(cleaningFee) => setDraft({ ...draft, cleaningFee })} />
          <p className="text-[12.5px] leading-relaxed text-ink-muted sm:col-span-2">Cleaning is included in the stay total. Optional extras are not offered at checkout, so they are not added here.</p>
          {example && example.ok ? (
            <p className="text-sm text-ink sm:col-span-2">
              {nights} night{nights === 1 ? '' : 's'} × {formatMoney(price ?? 0, currency)} = {formatMoney(example.lodging, currency)}
              {cleaning > 0 ? ` · Cleaning ${formatMoney(cleaning, currency)} · Total ${formatMoney(example.lodging + cleaning, currency)}` : ''}
            </p>
          ) : null}
        </div>
      ) : null}
      {step === 3 ? (
        <div className="max-w-xl space-y-4 text-sm text-ink">
          <ReviewRow label="Schedule" text={draft.name.trim() || 'Untitled schedule'} onEdit={() => setStep(0)} />
          <ReviewRow label="Guests" text={`${draft.minGuests ?? 1}–${draft.maxGuests ?? maxGuests ?? '…'}`} onEdit={() => setStep(0)} />
          <ReviewRow label="Nights" text={`${draft.minNights ?? baseMinNights}${draft.maxNights ? `–${draft.maxNights}` : ''} · ${draft.checkIn || '—'} to ${draft.checkOut || '—'}`} onEdit={() => setStep(0)} />
          <ReviewRow label="Dates" text={draft.start && draft.end ? `${draft.start} – ${draft.end}` : 'Not set'} onEdit={() => setStep(1)} />
          <ReviewRow label="Price" text={price != null ? `${formatMoney(price, currency)} / night${cleaning > 0 ? ` · cleaning ${formatMoney(cleaning, currency)}` : ''}` : 'Not set'} onEdit={() => setStep(2)} />
          {example && example.ok ? (
            <p className="text-[12.5px] text-ink-muted">Illustrative stay of {nights} night{nights === 1 ? '' : 's'}: {formatMoney(example.lodging + cleaning, currency)}. This is not a confirmed quote.</p>
          ) : null}
          {error ? <p className="text-[12.5px] text-amber-950">{error}</p> : null}
        </div>
      ) : null}
    </TourOptionWorkspace>
  );
}

function ReviewRow({ label, text, onEdit }: { label: string; text: string; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] pb-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
        <p className="mt-1">{text}</p>
      </div>
      <button type="button" className="text-[12.5px] font-semibold text-finland" onClick={onEdit}>Edit</button>
    </div>
  );
}

function SleepingEditor({
  draft,
  warning,
  onChange,
}: {
  draft: StayAccommodationOption;
  warning: string | null;
  onChange: (next: StayAccommodationOption) => void;
}) {
  const areas = draft.sleepingAreas.length > 0 ? draft.sleepingAreas : stayAreasFromMix(draft.bedMix);
  const bedCount = areas.reduce((sum, area) => sum + area.beds.reduce((n, bed) => n + bed.count, 0), 0);
  const sleeps = areas.reduce(
    (sum, area) => sum + area.beds.reduce((n, bed) => n + bed.count * (STAY_BED_KINDS.find((kind) => kind.id === bed.kind)?.sleeps ?? 0), 0),
    0
  );

  function commit(next: StaySleepingArea[]) {
    const mix = stayMixFromAreas(next);
    const count = stayBedCount(mix);
    onChange({
      ...draft,
      sleepingAreas: next,
      bedMix: count > 0 ? mix : {},
      beds: count > 0 ? count : draft.beds,
    });
  }

  return (
    <div className="space-y-3 border-t border-black/[0.08] pt-4">
      <div>
        <h3 className="text-sm font-semibold text-ink">Sleeping arrangements</h3>
        <p className="mt-1 text-[12.5px] text-ink-muted">
          {bedCount > 0 ? `${areas.length} sleeping area${areas.length === 1 ? '' : 's'} · ${bedCount} beds · Sleeps ${sleeps}` : 'Add each place guests can sleep.'}
        </p>
      </div>
      {areas.map((area, areaIndex) => (
        <section key={area.id} className="rounded-xl bg-white p-3 ring-1 ring-[#E6EAF0]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <input
              className="tv-input max-w-xs font-semibold"
              value={area.name}
              aria-label="Sleeping area name"
              onChange={(e) => commit(areas.map((item, index) => (index === areaIndex ? { ...item, name: e.target.value.slice(0, 40) } : item)))}
            />
            <button type="button" className="text-[12.5px] font-medium text-ink-muted" onClick={() => commit(areas.filter((_, index) => index !== areaIndex))}>
              Remove area
            </button>
          </div>
          <ul className="space-y-2">
            {area.beds.map((bed, bedIndex) => (
              <li key={`${area.id}-${bedIndex}`} className="flex flex-wrap items-center gap-2">
                <select
                  className="tv-input w-40 font-normal"
                  value={bed.kind}
                  aria-label="Bed type"
                  onChange={(e) => {
                    const kind = e.target.value as StayBedKind;
                    commit(areas.map((item, index) => index === areaIndex ? { ...item, beds: item.beds.map((row, i) => (i === bedIndex ? { ...row, kind } : row)) } : item));
                  }}
                >
                  {STAY_BED_KINDS.map((kind) => (
                    <option key={kind.id} value={kind.id}>{kind.label}</option>
                  ))}
                </select>
                <button type="button" className="tv-btn-secondary !min-h-10 !w-10 !px-0" aria-label="Fewer beds" onClick={() => commit(areas.map((item, index) => index === areaIndex ? { ...item, beds: item.beds.flatMap((row, i) => (i === bedIndex ? (row.count <= 1 ? [] : [{ ...row, count: row.count - 1 }]) : [row])) } : item))}>−</button>
                <span className="w-6 text-center text-sm tabular-nums">{bed.count}</span>
                <button type="button" className="tv-btn-secondary !min-h-10 !w-10 !px-0" aria-label="More beds" onClick={() => commit(areas.map((item, index) => index === areaIndex ? { ...item, beds: item.beds.map((row, i) => (i === bedIndex ? { ...row, count: Math.min(20, row.count + 1) } : row)) } : item))}>+</button>
                <button type="button" className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-muted ring-1 ring-[#E6EAF0]" aria-label="Remove bed" onClick={() => commit(areas.map((item, index) => index === areaIndex ? { ...item, beds: item.beds.filter((_, i) => i !== bedIndex) } : item))}>×</button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-2 text-[12.5px] font-semibold text-finland"
            onClick={() => commit(areas.map((item, index) => index === areaIndex ? { ...item, beds: [...item.beds, { kind: 'double', count: 1 }] } : item))}
          >
            Add another bed
          </button>
        </section>
      ))}
      <button
        type="button"
        className="tv-btn-secondary !min-h-10 !px-3 text-sm"
        onClick={() => commit([...areas, { id: newScheduleId(), name: `Bedroom ${areas.length + 1}`, beds: [] }])}
      >
        Add sleeping area
      </button>
      {warning ? <p className="text-[12.5px] leading-relaxed text-amber-950">{warning}</p> : null}
    </div>
  );
}

function CutoffScene({
  draft,
  onChange,
}: {
  draft: StayAccommodationOption;
  onChange: (next: StayAccommodationOption) => void;
}) {
  const split = splitCutoff(draft.cutoffMinutes);
  const [amount, setAmount] = useState(split.amount);
  const [unit, setUnit] = useState(split.unit);
  const checkIn = draft.schedules.find((row) => row.checkIn)?.checkIn || '16:00';

  function apply(nextAmount: string, nextUnit: typeof unit) {
    setAmount(nextAmount);
    setUnit(nextUnit);
    const parsed = Number(nextAmount);
    if (!Number.isFinite(parsed) || parsed < 0) {
      onChange({ ...draft, cutoffMinutes: null });
      return;
    }
    const minutes =
      nextUnit === 'weeks' ? parsed * 7 * 24 * 60 : nextUnit === 'days' ? parsed * 24 * 60 : nextUnit === 'hours' ? parsed * 60 : parsed;
    onChange({ ...draft, cutoffMinutes: Math.min(56 * 24 * 60, Math.floor(minutes)) });
  }

  const minutes = draft.cutoffMinutes;
  const exampleClose = minutes == null ? null : shiftClock(checkIn, minutes);

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-ink">Reservation cutoff</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">Choose how long before check-in guests must make their reservation.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <label className="block text-sm font-semibold text-ink">
          Value
          <input className="tv-input mt-1 w-full font-normal" inputMode="numeric" value={amount} onChange={(e) => apply(e.target.value.replace(/[^\d]/g, '').slice(0, 3), unit)} />
        </label>
        <label className="block text-sm font-semibold text-ink">
          Unit
          <select className="tv-input mt-1 w-full font-normal" value={unit} onChange={(e) => apply(amount, e.target.value as typeof unit)}>
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
            <option value="weeks">Weeks</option>
          </select>
        </label>
      </div>
      {minutes === 0 ? <p className="text-sm text-ink">Guests can book until check-in.</p> : null}
      {minutes != null && minutes > 0 ? (
        <p className="text-sm text-ink">
          Guests can book until {formatCutoff(minutes)} before check-in.
          {exampleClose ? ` Example: for a ${checkIn} check-in, booking closes at ${exampleClose}.` : ''}
        </p>
      ) : null}
    </div>
  );
}

function splitCutoff(minutes: number | null): { amount: string; unit: 'minutes' | 'hours' | 'days' | 'weeks' } {
  if (minutes == null) return { amount: '', unit: 'hours' };
  if (minutes > 0 && minutes % (7 * 24 * 60) === 0) return { amount: String(minutes / (7 * 24 * 60)), unit: 'weeks' };
  if (minutes > 0 && minutes % (24 * 60) === 0) return { amount: String(minutes / (24 * 60)), unit: 'days' };
  if (minutes > 0 && minutes % 60 === 0) return { amount: String(minutes / 60), unit: 'hours' };
  return { amount: String(minutes), unit: 'minutes' };
}

function formatCutoff(minutes: number): string {
  const split = splitCutoff(minutes);
  const n = Number(split.amount);
  const unit = n === 1 ? split.unit.slice(0, -1) : split.unit;
  return `${n} ${unit}`;
}

function shiftClock(hm: string, minutesBefore: number): string | null {
  if (!/^\d{2}:\d{2}$/.test(hm)) return null;
  const [h, m] = hm.split(':').map(Number);
  const total = h * 60 + m - minutesBefore;
  const dayMinutes = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(dayMinutes / 60)).padStart(2, '0')}:${String(dayMinutes % 60).padStart(2, '0')}`;
}

const CLOCKS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? '00' : '30';
  return `${String(hour).padStart(2, '0')}:${minute}`;
});

function Clock({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const options = value && !CLOCKS.includes(value) ? [value, ...CLOCKS] : CLOCKS;
  return (
    <label className="block text-sm font-semibold text-ink">
      {label}
      <select className="tv-input mt-1 w-full font-normal" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a time</option>
        {options.map((time) => (
          <option key={time} value={time}>{time}</option>
        ))}
      </select>
    </label>
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
