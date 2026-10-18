import { useState } from 'react';
import { formatMoney } from '../../../lib/money';
import { quoteStayLodging, type StaySeasonWindow } from '../../../lib/stay-season-quote';
import {
  STAY_BED_KINDS,
  applySleepingAreas,
  stayAreasFromMix,
  stayBedCount,
  stayCapacityWarning,
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
import {
  normalizeStayGuestPolicy,
  stayGuestAgeCopy,
  type StayGuestPolicy,
} from '../../../lib/stay-guest-party';
import type { ListingCreationNavItem } from '../../../lib/listing-creation-workspace';
import { TraverionSingleDateField } from '../../calendar/TraverionSingleDateField';
import { TourOptionWorkspace } from './TourOptionWorkspace';
import {
  STAY_EXTRA_PRESETS,
  priceStayAddOns,
  stayExtraChargeLabel,
  type StayExtraCharge,
  type StayPaidExtra,
} from '../../../lib/stay-price';

type Props = {
  title: string;
  currency: string;
  propertyType: string;
  options: StayAccommodationOption[];
  persistLabel: string | null;
  onChange: (options: StayAccommodationOption[]) => void;
};

function alignScheduleOccupancy(option: StayAccommodationOption): StayAccommodationOption {
  return {
    ...option,
    schedules: option.schedules.map((schedule) => ({ ...schedule, minGuests: null, maxGuests: null })),
  };
}

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
                  setEditingScene(2);
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
                onArchive={() => {
                  const name = option.name.trim() || 'this option';
                  if (!window.confirm(`Archive ${name}? Saved reservations stay on the listing.`)) return;
                  onChange(options.map((row) => (row.id === option.id ? { ...row, archived: true } : row)));
                }}
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
  const warning = stayCapacityWarning(option.maxGuests ?? 0, option.bedMix);
  return (
    <article className="lc-tile rounded-xl px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[1.05rem] font-semibold tracking-tight text-ink">{option.name.trim() || 'Untitled option'}</h3>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#0B397E]">{stayOptionStatus(option, inventoryBlocked)}</p>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
        <Fact label="Type" text={option.propertyType || 'Accommodation'} />
        <Fact label="Occupancy" text={option.maxGuests != null ? `Up to ${option.maxGuests} guests` : 'Not set'} />
        <Fact label="Rooms" text={[option.bedrooms != null ? `${option.bedrooms} bedrooms` : null, option.bathrooms != null ? `${option.bathrooms} bathrooms` : null].filter(Boolean).join(' · ') || 'Not set'} />
        <Fact label="Sleeping" text={staySleepingLabel(option)} />
        <Fact label="Units" text={option.quantity === 1 ? '1 physical unit' : `${option.quantity} identical units`} />
        <Fact label="Schedules" text={schedules.length === 0 ? 'No active schedules' : `${schedules.length} active schedule${schedules.length === 1 ? '' : 's'}`} />
        <Fact label="Price" text={price != null ? `From ${formatMoney(price, currency)} / night` : 'Not set'} />
      </dl>
      {warning ? <p className="mt-3 text-[12.5px] font-medium leading-relaxed text-amber-950">{warning}</p> : null}
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
  const [showAccommodationErrors, setShowAccommodationErrors] = useState(false);
  const [showCutoffErrors, setShowCutoffErrors] = useState(false);
  const guests = draft.maxGuests ?? 0;
  const warning = stayCapacityWarning(guests, draft.bedMix);
  const identityReady = guests >= 1 && draft.name.trim().length > 0;
  const sleepingReady = stayBedCount(draft.bedMix) >= 1 && !warning;
  const availabilityReady =
    draft.schedules.some(
      (row) => row.enabled && row.nightlyPrice && row.start && row.end && row.checkIn && row.checkOut
    ) || (draft.schedules.length === 0 && draft.availabilityMode !== 'scheduled' && (draft.nightlyPrice ?? 0) > 0);
  const cutoffReady = typeof draft.cutoffMinutes === 'number' && draft.cutoffMinutes >= 0;
  const conflicts = stayScheduleConflicts(draft.schedules);
  const nav: ListingCreationNavItem[] = [
    { id: '0', label: 'Accommodation', state: scene === 0 ? 'current' : identityReady ? 'complete' : 'upcoming', requirementsMet: identityReady },
    { id: '1', label: 'Sleeping arrangements', state: scene === 1 ? 'current' : sleepingReady ? 'complete' : 'upcoming', requirementsMet: sleepingReady },
    { id: '2', label: 'Availability', state: scene === 2 ? 'current' : availabilityReady ? 'complete' : 'upcoming', requirementsMet: availabilityReady },
    { id: '3', label: 'Cutoff time', state: scene === 3 ? 'current' : cutoffReady ? 'complete' : 'upcoming', requirementsMet: cutoffReady },
  ];

  return (
    <>
      <TourOptionWorkspace
        modeTitle={option.name.trim() ? 'Edit option' : 'Create option'}
        optionName={draft.name}
        listingTitle={listingTitle}
        persistLabel={persistLabel}
        continueHint={
          scene === 0 && !identityReady
            ? 'Add a name and the maximum number of guests.'
            : scene === 1 && !sleepingReady
              ? warning ?? 'Add the beds guests can sleep in.'
              : scene === 3 && !cutoffReady
              ? 'Choose how long before check-in booking closes.'
              : null
        }
        continueLabel={scene === 3 ? 'Save option' : 'Continue'}
        continueDisabled={false}
        navItems={nav}
        onSelectNavId={(id) => setScene(Number(id))}
        onBackToOptions={onClose}
        onPreviousScene={scene > 0 ? () => setScene((n) => n - 1) : null}
        onClose={onClose}
        onSaveDraft={() => onCommit(alignScheduleOccupancy(draft))}
        onContinue={() => {
          if (scene === 0) {
            if (!identityReady) {
              setShowAccommodationErrors(true);
              document.getElementById('stay-option-name')?.scrollIntoView({ block: 'center' });
              return;
            }
            setScene(1);
            return;
          }
          if (scene === 1) {
            if (!sleepingReady) {
              setShowAccommodationErrors(true);
              document.getElementById('stay-option-sleeping')?.scrollIntoView({ block: 'center' });
              return;
            }
            setScene(2);
            return;
          }
          if (scene === 2) {
            setScene(3);
            return;
          }
          if (!cutoffReady) {
            setShowCutoffErrors(true);
            document.getElementById('stay-option-cutoff')?.scrollIntoView({ block: 'center' });
            return;
          }
          onCommit(alignScheduleOccupancy(draft));
          onClose();
        }}
        saveDraftDisabled={false}
      >
        {scene === 0 ? (
          <div className="tv-step">
            <AccommodationScene draft={draft} showErrors={showAccommodationErrors} onChange={setDraft} />
          </div>
        ) : scene === 1 ? (
          <div className="mx-auto max-w-3xl space-y-4">
            <p className="text-sm text-ink-muted">Bedroom photos are added with the listing photos, after the rooms exist here.</p>
            <SleepingEditor draft={draft} warning={warning} onChange={setDraft} />
          </div>
        ) : scene === 3 ? (
          <CutoffScene draft={draft} showError={showCutoffErrors} onChange={setDraft} />
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
                    minGuests: null,
                    maxGuests: null,
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
              <ul className="space-y-3">
                {draft.schedules.map((row) => (
                  <li key={row.id} className="rounded-xl bg-white p-4 ring-1 ring-[#E6EAF0]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{row.name.trim() || 'Untitled schedule'}</p>
                        <p className={`mt-1 text-[12px] font-semibold ${row.enabled ? 'text-[#0B397E]' : 'text-ink-muted'}`}>
                          {row.enabled ? 'Active' : 'Inactive'}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                        {row.nightlyPrice ? `${formatMoney(row.nightlyPrice, currency)} / night` : 'Price not set'}
                      </p>
                    </div>
                    <dl className="mt-3 grid grid-cols-1 gap-1 text-[12.5px] text-ink sm:grid-cols-2">
                      <div>{row.start && row.end ? `${row.start} – ${row.end}` : 'Dates not set'}</div>
                      <div>
                        {row.minNights ? `${row.minNights} night minimum` : 'Minimum not set'}
                        {row.maxNights ? ` · ${row.maxNights} night maximum` : ''}
                      </div>
                      <div>{row.checkIn && row.checkOut ? `${row.checkIn}–${row.checkOut}` : 'Check-in times not set'}</div>
                      <div>{draft.quantity === 1 ? '1 unit' : `${draft.quantity} units`}</div>
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-black/[0.06] pt-2">
                      <button type="button" className="min-h-11 text-[12.5px] font-semibold text-finland" onClick={() => setScheduleDraft(row)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="min-h-11 text-[12.5px] font-medium text-ink-muted"
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
                        className="min-h-11 text-[12.5px] font-medium text-ink-muted"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            schedules: [...draft.schedules, { ...row, id: newScheduleId(), enabled: false, name: row.name ? `${row.name} copy`.slice(0, 80) : '' }],
                          })
                        }
                      >
                        Duplicate
                      </button>
                    </div>
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
  showErrors,
  onChange,
}: {
  draft: StayAccommodationOption;
  showErrors: boolean;
  onChange: (next: StayAccommodationOption) => void;
}) {
  const [agesOpen, setAgesOpen] = useState(false);
  const policy = normalizeStayGuestPolicy(draft.guestPolicy);
  const ages = stayGuestAgeCopy(policy);
  function setPolicy(next: StayGuestPolicy) {
    onChange({ ...draft, guestPolicy: normalizeStayGuestPolicy(next) });
  }
  return (
    <div className="mx-auto max-w-[52rem] space-y-6">
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-ink">Accommodation details</h3>
        {showErrors && !draft.name.trim() ? <p className="text-[12.5px] font-medium text-red-700">Add a name guests will recognize.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-ink sm:col-span-2">
          Option name
          <input id="stay-option-name" className={`tv-input mt-1 w-full font-normal ${showErrors && !draft.name.trim() ? '!border-red-600' : ''}`} value={draft.name} maxLength={80} onChange={(e) => onChange({ ...draft, name: e.target.value.slice(0, 80) })} />
        </label>
        <label className="block text-sm font-semibold text-ink">
          Accommodation type
          <select className="tv-input mt-1 w-full font-normal" value={draft.propertyType} onChange={(e) => onChange({ ...draft, propertyType: e.target.value })}>
            {STAY_SINGLE_PROPERTY_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <Num id="stay-option-guests" label="Maximum guests" value={draft.maxGuests} min={1} max={50} error={showErrors && (draft.maxGuests == null || draft.maxGuests < 1) ? 'Enter how many guests this accommodation can hold.' : null} onChange={(maxGuests) => onChange({ ...draft, maxGuests })} />
        <Num label="Bedrooms" value={draft.bedrooms} min={0} max={30} onChange={(bedrooms) => onChange({ ...draft, bedrooms })} />
        <Num label="Bathrooms" value={draft.bathrooms} min={0} max={20} step={0.5} onChange={(bathrooms) => onChange({ ...draft, bathrooms })} />
        <Num label="Identical physical units" value={draft.quantity} min={1} max={500} onChange={(quantity) => onChange({ ...draft, quantity: quantity ?? 1 })} />
        <label className="block text-sm font-semibold text-ink sm:col-span-2">
          Short description
          <textarea className="tv-input mt-1 w-full font-normal" rows={2} maxLength={240} value={draft.description} onChange={(e) => onChange({ ...draft, description: e.target.value.slice(0, 240) })} />
        </label>
      </div>
      </section>
      <section className="rounded-xl bg-white p-4 ring-1 ring-[#E6EAF0]">
        <h3 className="text-base font-semibold text-ink">Guests and occupancy</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{ages.summary}</p>
        <button type="button" className="mt-3 text-sm font-semibold text-finland" aria-expanded={agesOpen} onClick={() => setAgesOpen((open) => !open)}>
          {agesOpen ? 'Hide age categories' : 'Adjust age categories'}
        </button>
        {agesOpen ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-ink">
              Adults start at
              <select
                className="tv-input mt-1 w-full font-normal"
                value={policy.adultMinAge}
                onChange={(e) => setPolicy({ ...policy, adultMinAge: Number(e.target.value) })}
              >
                {Array.from({ length: 9 }, (_, index) => 13 + index).map((age) => (
                  <option key={age} value={age}>{age}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-ink">
              Children start at
              <select
                className="tv-input mt-1 w-full font-normal"
                value={policy.childMinAge}
                onChange={(e) => setPolicy({ ...policy, childMinAge: Number(e.target.value) })}
              >
                {Array.from({ length: Math.max(1, policy.adultMinAge - 1) }, (_, index) => index + 1).map((age) => (
                  <option key={age} value={age}>{age}</option>
                ))}
              </select>
            </label>
            <label className="flex items-start gap-2 text-sm font-medium text-ink sm:col-span-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={policy.infantsCountInOccupancy}
                onChange={(e) => setPolicy({ ...policy, infantsCountInOccupancy: e.target.checked })}
              />
              Infants count toward the maximum number of guests
            </label>
            <Num
              label="Maximum infants"
              value={policy.maxInfants}
              min={0}
              max={20}
              onChange={(maxInfants) => setPolicy({ ...policy, maxInfants })}
            />
          </div>
        ) : null}
      </section>
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
  const [attempted, setAttempted] = useState(false);
  const datesOk = /^\d{4}-\d{2}-\d{2}$/.test(draft.start) && /^\d{4}-\d{2}-\d{2}$/.test(draft.end) && draft.end >= draft.start;
  const price = draft.nightlyPrice && draft.nightlyPrice > 0 ? draft.nightlyPrice : null;
  const nightsOk = (draft.minNights ?? 0) >= 1 && (draft.maxNights == null || draft.maxNights >= (draft.minNights ?? 1));
  const timesOk = /^\d{2}:\d{2}$/.test(draft.checkIn ?? '') && /^\d{2}:\d{2}$/.test(draft.checkOut ?? '');
  const overlap = datesOk && draft.enabled !== false ? stayScheduleConflicts([...others, { ...draft, enabled: true }]) : [];
  const ready = datesOk && price != null && nightsOk && timesOk && overlap.length === 0;
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
      setError(overlap[0] ?? 'Add dates, a nightly price, night limits, and check-in and check-out times.');
      return false;
    }
    onCommit({ ...draft, enabled: draft.enabled !== false, nightlyPrice: price, minGuests: null, maxGuests: null });
    return true;
  }

  const detailsOk = timesOk;
  const datesStepOk = datesOk && nightsOk && overlap.length === 0;
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
      onSaveDraft={() => onCommit({ ...draft, nightlyPrice: price, minGuests: null, maxGuests: null })}
      onContinue={() => {
        if (!stepOk[step]) {
          setAttempted(true);
          const target = step === 0 ? 'stay-schedule-check-in' : step === 1 ? 'stay-schedule-dates' : 'stay-schedule-price';
          document.getElementById(target)?.scrollIntoView({ block: 'center' });
          return;
        }
        if (step < 3) {
          setStep((n) => n + 1);
          return;
        }
        if (commit()) onClose();
      }}
      saveDraftDisabled={false}
    >
      {step === 0 ? (
        <div id="stay-schedule-check-in" className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <h3 className="text-base font-semibold text-ink">Schedule details</h3>
            <p className="mt-1 text-sm text-ink-muted">Name this period and set when guests arrive and leave. Guest capacity stays on the accommodation.</p>
          </div>
          <label className="block text-sm font-semibold text-ink sm:col-span-2">
            Schedule name
            <input className="tv-input mt-1 w-full font-normal" value={draft.name} maxLength={80} placeholder="Winter, Christmas, Summer" onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 80) })} />
          </label>
          <Clock id="stay-schedule-check-in-field" label="Check-in" value={draft.checkIn ?? ''} error={attempted && !/^\d{2}:\d{2}$/.test(draft.checkIn ?? '') ? 'Choose a check-in time.' : null} onChange={(checkIn) => setDraft({ ...draft, checkIn })} />
          <Clock label="Check-out" value={draft.checkOut ?? ''} error={attempted && !/^\d{2}:\d{2}$/.test(draft.checkOut ?? '') ? 'Choose a check-out time.' : null} onChange={(checkOut) => setDraft({ ...draft, checkOut })} />
          {maxGuests != null ? <p className="text-sm text-ink sm:col-span-2">This accommodation holds up to {maxGuests} guests.</p> : null}
        </div>
      ) : null}
      {step === 1 ? (
        <div id="stay-schedule-dates" className="tv-step mx-auto grid max-w-3xl gap-4 rounded-xl bg-white p-4 ring-1 ring-[#E6EAF0] sm:grid-cols-2">
          <div className="sm:col-span-2">
            <h3 className="text-base font-semibold text-ink">Availability period</h3>
            {attempted && !datesOk ? <p className="mt-1 text-[12.5px] font-medium text-red-700">Choose the first and last occupied nights.</p> : null}
            {overlap[0] ? <p className="mt-1 text-[12.5px] font-medium text-red-700">{overlap[0]}</p> : null}
          </div>
          <TraverionSingleDateField id={`${draft.id}-start`} label="First occupied night" value={draft.start} minIso="" placeholder="Choose a date" onChange={(start) => setDraft({ ...draft, start })} />
          <TraverionSingleDateField id={`${draft.id}-end`} label="Last occupied night" value={draft.end} minIso="" placeholder="Choose a date" onChange={(end) => setDraft({ ...draft, end })} />
          <p className="text-sm leading-relaxed text-ink-muted sm:col-span-2">The last night is occupied. The next morning is check-out and is not charged.</p>
          <div className="sm:col-span-2">
            <h3 className="text-base font-semibold text-ink">Length of stay</h3>
          </div>
          <Num label="Minimum nights" value={draft.minNights ?? baseMinNights} min={1} max={365} error={attempted && (draft.minNights ?? 0) < 1 ? 'Minimum stay is at least 1 night.' : null} onChange={(minNights) => setDraft({ ...draft, minNights })} />
          <Num label="Maximum nights" value={draft.maxNights ?? null} min={1} max={365} error={attempted && draft.maxNights != null && draft.minNights != null && draft.maxNights < draft.minNights ? 'Maximum nights cannot be below the minimum.' : null} onChange={(maxNights) => setDraft({ ...draft, maxNights })} />
          <aside className="rounded-xl bg-[#F4F8FC] px-4 py-3 ring-1 ring-[#D5E2F2] sm:col-span-2">
            <p className="text-sm font-semibold text-ink">{draft.start && draft.end ? `${draft.start} – ${draft.end}` : 'Dates not set'}</p>
            <p className="mt-1 text-[12.5px] text-ink-muted">
              {draft.minNights ?? baseMinNights} night minimum{draft.maxNights ? ` · ${draft.maxNights} night maximum` : ' · no extra maximum'}
              {maxGuests != null ? ` · up to ${maxGuests} guests` : ''}
            </p>
          </aside>
        </div>
      ) : null}
      {step === 2 ? (
        <SchedulePriceStep
          draft={draft}
          currency={currency}
          price={price}
          cleaning={cleaning}
          nights={nights}
          maxGuests={maxGuests}
          attempted={attempted}
          exampleLodging={example && example.ok ? example.lodging : null}
          onChange={setDraft}
        />
      ) : null}
      {step === 3 ? (
        <div className="tv-step mx-auto max-w-3xl space-y-3 text-sm text-ink">
          <section className="rounded-xl bg-white p-4 ring-1 ring-[#E6EAF0]">
            <h3 className="text-base font-semibold text-ink">Schedule</h3>
            <ReviewRow label="Name" text={draft.name.trim() || 'Untitled schedule'} onEdit={() => setStep(0)} />
            <ReviewRow label="Arrival" text={`${draft.checkIn || 'Check-in not set'} · ${draft.checkOut || 'Check-out not set'}`} onEdit={() => setStep(0)} />
          </section>
          <section className="rounded-xl bg-white p-4 ring-1 ring-[#E6EAF0]">
            <h3 className="text-base font-semibold text-ink">Availability</h3>
            <ReviewRow label="Dates" text={draft.start && draft.end ? `${draft.start} – ${draft.end}` : 'Not set'} onEdit={() => setStep(1)} />
            <ReviewRow label="Nights" text={`${draft.minNights ?? baseMinNights} minimum${draft.maxNights ? ` · ${draft.maxNights} maximum` : ''}`} onEdit={() => setStep(1)} />
            <ReviewRow label="Guests" text={maxGuests != null ? `Up to ${maxGuests}, from the accommodation` : 'Set on the accommodation'} onEdit={() => setStep(0)} />
          </section>
          <section className="rounded-xl bg-white p-4 ring-1 ring-[#E6EAF0]">
            <h3 className="text-base font-semibold text-ink">Pricing</h3>
            <ReviewRow label="Nightly rate" text={price != null ? `${formatMoney(price, currency)} / night` : 'Not set'} onEdit={() => setStep(2)} />
            <ReviewRow label="Cleaning fee" text={cleaning > 0 ? `${formatMoney(cleaning, currency)} once per stay` : 'None'} onEdit={() => setStep(2)} />
            <ReviewRow
              label="Extra guests"
              text={
                draft.extraGuestNightly && draft.includedGuests
                  ? `${formatMoney(draft.extraGuestNightly, currency)} / night after ${draft.includedGuests} guests`
                  : 'None'
              }
              onEdit={() => setStep(2)}
            />
            <ReviewRow
              label="Longer stays"
              text={
                [
                  draft.weeklyDiscountPercent ? `${draft.weeklyDiscountPercent}% from 7 nights` : null,
                  draft.monthlyDiscountPercent ? `${draft.monthlyDiscountPercent}% from 28 nights` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'None'
              }
              onEdit={() => setStep(2)}
            />
            <ReviewRow
              label="Extras"
              text={
                (draft.extras ?? []).length > 0
                  ? (draft.extras ?? [])
                      .map((extra) => `${extra.name}${extra.requestOnly ? ' (request)' : extra.mandatory ? ' (required)' : ''}`)
                      .join(', ')
                  : 'None'
              }
              onEdit={() => setStep(2)}
            />
          </section>
          {example && example.ok ? (
            <p className="text-[12.5px] text-ink-muted">Illustrative stay of {nights} night{nights === 1 ? '' : 's'}: {formatMoney(example.lodging + cleaning, currency)}. This is not a confirmed quote.</p>
          ) : null}
          {error ? <p className="text-[12.5px] font-medium text-red-700">{error}</p> : null}
        </div>
      ) : null}
    </TourOptionWorkspace>
  );
}

function SchedulePriceStep({
  draft,
  currency,
  price,
  cleaning,
  nights,
  maxGuests,
  attempted,
  exampleLodging,
  onChange,
}: {
  draft: StaySeasonWindow;
  currency: string;
  price: number | null;
  cleaning: number;
  nights: number;
  maxGuests: number | null;
  attempted: boolean;
  exampleLodging: number | null;
  onChange: (next: StaySeasonWindow) => void;
}) {
  const [query, setQuery] = useState('');
  const [customName, setCustomName] = useState('');
  const extras = draft.extras ?? [];
  const presets = STAY_EXTRA_PRESETS.filter((name) => name.toLowerCase().includes(query.trim().toLowerCase()));
  const sampleGuests = maxGuests ?? draft.includedGuests ?? 1;
  const sample =
    exampleLodging != null
      ? priceStayAddOns({
          lodging: exampleLodging,
          nights,
          countedGuests: sampleGuests,
          includedGuests: draft.includedGuests,
          extraGuestNightly: draft.extraGuestNightly,
          weeklyDiscountPercent: draft.weeklyDiscountPercent,
          monthlyDiscountPercent: draft.monthlyDiscountPercent,
          extras,
          selected: [],
        })
      : null;

  function addExtra(name: string) {
    const trimmed = name.trim().slice(0, 80);
    if (!trimmed || extras.length >= 12) return;
    const created: StayPaidExtra = {
      id: newScheduleId(),
      name: trimmed,
      description: '',
      price: 1,
      charge: 'per_stay',
      mandatory: false,
      requestOnly: false,
      maxQuantity: 1,
    };
    onChange({ ...draft, extras: [...extras, created] });
    setQuery('');
    setCustomName('');
  }

  function patchExtra(id: string, patch: Partial<StayPaidExtra>) {
    onChange({ ...draft, extras: extras.map((extra) => (extra.id === id ? { ...extra, ...patch } : extra)) });
  }

  return (
    <div id="stay-schedule-price" className="tv-step mx-auto max-w-3xl space-y-4">
      <section className="rounded-xl bg-white p-4 ring-1 ring-[#E6EAF0]">
        <h3 className="text-base font-semibold text-ink">Nightly rate</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Num label={`Price per night · ${currency}`} value={draft.nightlyPrice} min={1} max={1000000} error={attempted && price == null ? 'Enter a nightly price.' : null} onChange={(nightlyPrice) => onChange({ ...draft, nightlyPrice })} />
          <Num label={`Cleaning fee · ${currency}`} value={draft.cleaningFee ?? null} min={0} max={1000000} onChange={(cleaningFee) => onChange({ ...draft, cleaningFee })} />
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">The cleaning fee is charged once per stay.</p>
      </section>
      <section className="rounded-xl bg-white p-4 ring-1 ring-[#E6EAF0]">
        <h3 className="text-base font-semibold text-ink">Extra guests</h3>
        <p className="mt-1 text-sm text-ink-muted">Optional. The nightly rate covers this many counted guests. Further counted guests pay the extra nightly amount. This cannot raise the maximum occupancy.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Num label="Guests included" value={draft.includedGuests ?? null} min={1} max={50} onChange={(includedGuests) => onChange({ ...draft, includedGuests })} />
          <Num label={`Extra guest / night · ${currency}`} value={draft.extraGuestNightly ?? null} min={0} max={100000} onChange={(extraGuestNightly) => onChange({ ...draft, extraGuestNightly: extraGuestNightly && extraGuestNightly > 0 ? extraGuestNightly : null })} />
        </div>
      </section>
      <section className="rounded-xl bg-white p-4 ring-1 ring-[#E6EAF0]">
        <h3 className="text-base font-semibold text-ink">Longer stays</h3>
        <p className="mt-1 text-sm text-ink-muted">Optional percent off the nightly total only. A stay of 28 nights or more uses the monthly discount instead of the weekly one. They do not combine.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Num label="Weekly discount %" value={draft.weeklyDiscountPercent ?? null} min={1} max={90} onChange={(weeklyDiscountPercent) => onChange({ ...draft, weeklyDiscountPercent })} />
          <Num label="Monthly discount %" value={draft.monthlyDiscountPercent ?? null} min={1} max={90} onChange={(monthlyDiscountPercent) => onChange({ ...draft, monthlyDiscountPercent })} />
        </div>
      </section>
      <section className="rounded-xl bg-white p-4 ring-1 ring-[#E6EAF0]">
        <h3 className="text-base font-semibold text-ink">Optional extras</h3>
        <p className="mt-1 text-sm text-ink-muted">Guests choose optional extras. Mandatory fees are included in the total. Request-only extras are not charged until you confirm them separately.</p>
        <label className="mt-3 block text-sm font-semibold text-ink">
          Add extra
          <input className="tv-input mt-1 w-full font-normal" value={query} placeholder="Search parking, sauna, breakfast…" onChange={(e) => setQuery(e.target.value)} />
        </label>
        {query.trim() ? (
          <ul className="mt-2 overflow-hidden rounded-xl ring-1 ring-[#E6EAF0]">
            {presets.map((name) => (
              <li key={name}>
                <button type="button" className="flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-[#F7F8FA]" onClick={() => addExtra(name)}>
                  {name}
                </button>
              </li>
            ))}
            <li className="flex gap-2 border-t border-[#E6EAF0] p-2">
              <input className="tv-input min-w-0 flex-1 font-normal" value={customName} placeholder="Custom extra" maxLength={80} onChange={(e) => setCustomName(e.target.value)} />
              <button type="button" className="tv-btn-secondary !min-h-11 !px-3 text-sm" onClick={() => addExtra(customName)}>Add</button>
            </li>
          </ul>
        ) : null}
        <ul className="mt-3 space-y-3">
          {extras.map((extra) => (
            <li key={extra.id} className="rounded-xl p-3 ring-1 ring-[#E6EAF0]">
              <div className="flex items-start justify-between gap-2">
                <input className="tv-input max-w-xs font-semibold" aria-label="Extra name" value={extra.name} maxLength={80} onChange={(e) => patchExtra(extra.id, { name: e.target.value.slice(0, 80) })} />
                <button type="button" className="min-h-11 text-sm font-medium text-ink-muted" onClick={() => onChange({ ...draft, extras: extras.filter((row) => row.id !== extra.id) })}>Remove</button>
              </div>
              <input className="tv-input mt-2 w-full font-normal" aria-label="Extra description" placeholder="Optional description" value={extra.description} maxLength={160} onChange={(e) => patchExtra(extra.id, { description: e.target.value.slice(0, 160) })} />
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Num label={`Price · ${currency}`} value={extra.price} min={1} max={100000} onChange={(next) => patchExtra(extra.id, { price: next && next > 0 ? next : extra.price })} />
                <label className="block text-sm font-semibold text-ink">
                  Charge
                  <select className="tv-input mt-1 w-full font-normal" value={extra.charge} onChange={(e) => patchExtra(extra.id, { charge: e.target.value as StayExtraCharge })}>
                    {(['per_stay', 'per_night', 'per_guest', 'per_guest_night'] as const).map((charge) => (
                      <option key={charge} value={charge}>{stayExtraChargeLabel(charge)}</option>
                    ))}
                  </select>
                </label>
                <Num label="Maximum quantity" value={extra.maxQuantity} min={1} max={20} onChange={(maxQuantity) => patchExtra(extra.id, { maxQuantity: maxQuantity ?? 1 })} />
                <label className="block text-sm font-semibold text-ink">
                  How it is charged
                  <select
                    className="tv-input mt-1 w-full font-normal"
                    value={extra.requestOnly ? 'request' : extra.mandatory ? 'mandatory' : 'optional'}
                    onChange={(e) => {
                      const mode = e.target.value;
                      patchExtra(extra.id, {
                        requestOnly: mode === 'request',
                        mandatory: mode === 'mandatory',
                        price: mode === 'request' ? extra.price : extra.price > 0 ? extra.price : 1,
                      });
                    }}
                  >
                    <option value="optional">Optional, paid now</option>
                    <option value="mandatory">Mandatory fee</option>
                    <option value="request">Request only, not charged</option>
                  </select>
                </label>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {sample && sample.ok && exampleLodging != null ? (
        <aside className="rounded-xl bg-[#F4F8FC] px-4 py-3 ring-1 ring-[#D5E2F2]">
          <p className="text-sm font-semibold text-ink">Example for {nights} night{nights === 1 ? '' : 's'} and {sampleGuests} counted guest{sampleGuests === 1 ? '' : 's'}</p>
          <p className="mt-1 text-sm text-ink">Nightly total {formatMoney(exampleLodging, currency)}</p>
          {sample.extraGuestFee > 0 ? <p className="text-sm text-ink">Extra guests {formatMoney(sample.extraGuestFee, currency)}</p> : null}
          {cleaning > 0 ? <p className="text-sm text-ink">Cleaning {formatMoney(cleaning, currency)}</p> : null}
          {sample.extraLines.map((line) => (
            <p key={line.id} className="text-sm text-ink">{line.mandatory ? 'Included' : 'Selected'} · {line.name} {formatMoney(line.amount, currency)}</p>
          ))}
          {sample.discount > 0 ? <p className="text-sm text-ink">{sample.discountLabel} −{formatMoney(sample.discount, currency)}</p> : null}
          <p className="mt-1 text-sm font-semibold text-ink">
            Illustrative total {formatMoney(exampleLodging + cleaning + sample.extraGuestFee + sample.extraLines.reduce((sum, line) => sum + line.amount, 0) - sample.discount, currency)}
          </p>
          {sample.requests.length > 0 ? (
            <p className="text-sm text-ink">Request only, not charged: {sample.requests.map((row) => row.name).join(', ')}</p>
          ) : null}
          <p className="mt-1 text-[12.5px] text-ink-muted">Optional extras are not included until a guest selects them. Request-only extras stay off the paid total. This is not a confirmed quote.</p>
        </aside>
      ) : null}
    </div>
  );
}

function ReviewRow({ label, text, onEdit }: { label: string; text: string; onEdit: () => void }) {
  return (
    <div className="mt-3 flex items-start justify-between gap-3">
      <div>
        <p className="text-[12.5px] text-ink-muted">{label}</p>
        <p className="mt-0.5 font-medium text-ink">{text}</p>
      </div>
      <button type="button" className="min-h-11 text-[12.5px] font-semibold text-finland" onClick={onEdit}>Edit</button>
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
  const areas = draft.sleepingAreas.some((area) => area.beds.length > 0)
    ? draft.sleepingAreas
    : stayBedCount(draft.bedMix) > 0
      ? [...stayAreasFromMix(draft.bedMix), ...draft.sleepingAreas]
      : draft.sleepingAreas;
  const bedCount = areas.reduce((sum, area) => sum + area.beds.reduce((n, bed) => n + bed.count, 0), 0);
  const sleeps = areas.reduce(
    (sum, area) => sum + area.beds.reduce((n, bed) => n + bed.count * (STAY_BED_KINDS.find((kind) => kind.id === bed.kind)?.sleeps ?? 0), 0),
    0
  );

  function commit(next: StaySleepingArea[]) {
    onChange({ ...draft, ...applySleepingAreas(draft, next) });
  }

  return (
    <div id="stay-option-sleeping" className="space-y-3 border-t border-black/[0.08] pt-4">
      <div>
        <h3 className="text-base font-semibold text-ink">Sleeping arrangements</h3>
        {warning ? <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-red-700">{warning}</p> : null}
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
              <li key={`${area.id}-${bedIndex}`} className="grid grid-cols-[minmax(0,1fr)_2.75rem_1.5rem_2.75rem_2.25rem] items-center gap-2">
                <select
                  className="tv-input min-w-0 font-normal"
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
                <button type="button" className="tv-btn-secondary !h-11 !min-h-11 !w-11 !px-0" aria-label="Fewer beds" onClick={() => commit(areas.map((item, index) => index === areaIndex ? { ...item, beds: item.beds.flatMap((row, i) => (i === bedIndex ? (row.count <= 1 ? [] : [{ ...row, count: row.count - 1 }]) : [row])) } : item))}>−</button>
                <span className="text-center text-sm tabular-nums">{bed.count}</span>
                <button type="button" className="tv-btn-secondary !h-11 !min-h-11 !w-11 !px-0" aria-label="More beds" onClick={() => commit(areas.map((item, index) => index === areaIndex ? { ...item, beds: item.beds.map((row, i) => (i === bedIndex ? { ...row, count: Math.min(20, row.count + 1) } : row)) } : item))}>+</button>
                <button type="button" className="inline-flex h-9 w-9 items-center justify-center justify-self-end rounded-full text-sm leading-none text-ink-muted hover:bg-[#F4F7FB] hover:text-ink" aria-label="Remove bed" onClick={() => commit(areas.map((item, index) => index === areaIndex ? { ...item, beds: item.beds.filter((_, i) => i !== bedIndex) } : item))}>×</button>
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
    </div>
  );
}

function CutoffScene({
  draft,
  showError,
  onChange,
}: {
  draft: StayAccommodationOption;
  showError: boolean;
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
    <div id="stay-option-cutoff" className="mx-auto max-w-xl space-y-4">
      <div>
        <h3 className="text-base font-semibold text-ink">Booking cutoff</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">Choose how close to check-in guests can make a reservation.</p>
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
      {showError && minutes == null ? <p className="text-[12.5px] font-medium text-red-700">Choose a cutoff. Use 0 to allow booking until check-in.</p> : null}
      {minutes === 0 ? (
        <div className="rounded-xl bg-[#F4F8FC] px-4 py-3 ring-1 ring-[#D5E2F2]">
          <p className="text-sm font-semibold text-ink">Guests can book until check-in.</p>
        </div>
      ) : null}
      {minutes != null && minutes > 0 ? (
        <div className="rounded-xl bg-[#F4F8FC] px-4 py-3 ring-1 ring-[#D5E2F2]">
          <p className="text-sm font-semibold text-ink">Guests can book until {formatCutoff(minutes)} before check-in.</p>
          {exampleClose ? <p className="mt-1 text-[12.5px] text-ink-muted">For a {checkIn} check-in, booking closes at {exampleClose}.</p> : null}
        </div>
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
  const dayShift = Math.floor(total / (24 * 60));
  const dayMinutes = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const clock = `${String(Math.floor(dayMinutes / 60)).padStart(2, '0')}:${String(dayMinutes % 60).padStart(2, '0')}`;
  if (dayShift === 0) return clock;
  if (dayShift === -1) return `${clock} on the day before check-in`;
  return `${clock}, ${Math.abs(dayShift)} days before check-in`;
}

const CLOCKS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? '00' : '30';
  return `${String(hour).padStart(2, '0')}:${minute}`;
});

function Clock({ id, label, value, error, onChange }: { id?: string; label: string; value: string; error?: string | null; onChange: (value: string) => void }) {
  const options = value && !CLOCKS.includes(value) ? [value, ...CLOCKS] : CLOCKS;
  return (
    <label className="block text-sm font-semibold text-ink">
      {label}
      <select id={id} aria-invalid={Boolean(error)} className={`tv-input mt-1 w-full font-normal ${error ? '!border-red-600' : ''}`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a time</option>
        {options.map((time) => (
          <option key={time} value={time}>{time}</option>
        ))}
      </select>
      {error ? <span className="mt-1 block text-[12.5px] font-medium text-red-700">{error}</span> : null}
    </label>
  );
}

function Num({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  error,
  onChange,
}: {
  id?: string;
  label: string;
  value: number | null;
  min: number;
  max: number;
  step?: number;
  error?: string | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block text-sm font-semibold text-ink">
      {label}
      <input
        id={id}
        aria-invalid={Boolean(error)}
        className={`tv-input mt-1 w-full font-normal ${error ? '!border-red-600' : ''}`}
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
      {error ? <span className="mt-1 block text-[12.5px] font-medium text-red-700">{error}</span> : null}
    </label>
  );
}
