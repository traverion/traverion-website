import { useState } from 'react';
import { formatMoney } from '../../../lib/money';
import { quoteStayLodging, type StaySeasonWindow } from '../../../lib/stay-season-quote';
import {
  STAY_BED_KINDS,
  stayBedCount,
  stayBedSummary,
  stayCapacityWarning,
  type StayBedMix,
} from '../../../lib/stay-beds';
import type { ListingCreationNavItem } from '../../../lib/listing-creation-workspace';
import { TourOptionWorkspace } from './TourOptionWorkspace';

type Mode = 'open' | 'scheduled';

type OptionDraft = {
  guests: string;
  bedrooms: string;
  bathrooms: string;
  nightly: string;
  cleaning: string;
  minNights: string;
  checkIn: string;
  checkOut: string;
  bedMix: StayBedMix;
};

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
  bedMix: StayBedMix;
  availabilityMode: Mode;
  seasons: StaySeasonWindow[];
  persistLabel: string | null;
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
    stayBedMix?: StayBedMix;
    stayAvailabilityMode?: Mode;
    staySeasons?: StaySeasonWindow[];
  }) => void;
};

const SCENES = ['Accommodation', 'Pricing', 'Arrival'] as const;

function num(raw: string): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function timeOk(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value.trim());
}

function sceneReady(draft: OptionDraft, index: number): boolean {
  if (index === 0) return Number.parseInt(draft.guests, 10) >= 1;
  if (index === 1) return num(draft.nightly) > 0;
  return timeOk(draft.checkIn) && timeOk(draft.checkOut);
}

function navItems(current: number, draft: OptionDraft): ListingCreationNavItem[] {
  return SCENES.map((label, index) => ({
    id: String(index),
    label,
    state: index === current ? 'current' : sceneReady(draft, index) ? 'complete' : 'upcoming',
    requirementsMet: sceneReady(draft, index),
  }));
}

export default function StayOptionsStep(props: Props) {
  const [editing, setEditing] = useState(false);
  const [availability, setAvailability] = useState(false);
  const optionName = props.title.trim() || 'Entire place';
  const warning = stayCapacityWarning(Number.parseInt(props.guests, 10), props.bedMix, Number.parseInt(props.beds, 10));
  const bedLine = stayBedSummary(props.bedMix) || (props.beds.trim() ? `${props.beds} bed${props.beds === '1' ? '' : 's'}` : 'Beds not set');
  const openSeasons = props.seasons.filter((season) => season.enabled);
  const preview = quoteStayLodging({
    checkIn: '2026-06-10',
    nights: Math.max(1, Number.parseInt(props.minNights, 10) || 1),
    baseNightly: num(props.nightly),
    baseMinNights: Math.max(1, Number.parseInt(props.minNights, 10) || 1),
    availabilityMode: props.availabilityMode,
    seasons: props.seasons,
  });

  return (
    <div className="space-y-4">
      <article className="lc-tile rounded-xl px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-[1.05rem] font-semibold tracking-tight text-ink">{optionName}</h3>
          <p className="text-[11px] font-medium tracking-wide text-ink-muted">
            {num(props.nightly) > 0 && Number.parseInt(props.guests, 10) >= 1 ? 'Configured' : 'Incomplete'}
          </p>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          <Fact label="Type" text={props.propertyType || 'Accommodation'} />
          <Fact label="Occupancy" text={props.guests.trim() ? `Up to ${props.guests} guests` : 'Not set'} />
          <Fact label="Sleeping" text={[props.bedrooms.trim() ? `${props.bedrooms} bedrooms` : null, bedLine].filter(Boolean).join(' · ') || 'Not set'} />
          <Fact label="Price" text={num(props.nightly) > 0 ? `${formatMoney(num(props.nightly), props.currency)} / night` : 'Not set'} />
          <Fact
            label="Availability"
            text={
              props.availabilityMode === 'scheduled'
                ? `${openSeasons.length} bookable period${openSeasons.length === 1 ? '' : 's'}`
                : 'Open unless a night is blocked'
            }
          />
        </dl>
        {warning ? <p className="mt-3 text-[12.5px] leading-relaxed text-ink-muted">{warning}</p> : null}
        {preview.ok && num(props.nightly) > 0 ? (
          <p className="mt-2 text-[13px] text-ink">
            Example from 10 Jun 2026 · {preview.nightlyPrices.length} night{preview.nightlyPrices.length === 1 ? '' : 's'} ·{' '}
            <span className="font-semibold">
              {formatMoney(preview.lodging + (num(props.cleaning) > 0 ? num(props.cleaning) : 0), props.currency)}
            </span>
            {num(props.cleaning) > 0 ? ` including ${formatMoney(num(props.cleaning), props.currency)} cleaning` : ''}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-black/[0.06] pt-2">
          <button type="button" className="tv-btn-primary !min-h-8 !px-2.5 text-[12.5px]" onClick={() => setEditing(true)}>
            Edit option
          </button>
          <button
            type="button"
            className="lux-flat inline-flex min-h-8 items-center rounded-md px-2 text-[12.5px] font-medium text-finland hover:bg-finland/[0.06]"
            onClick={() => setAvailability(true)}
          >
            Manage availability
          </button>
        </div>
      </article>
      {editing ? (
        <StayOptionEditor
          {...props}
          optionName={optionName}
          onClose={() => setEditing(false)}
        />
      ) : null}
      {availability ? (
        <StayAvailabilityEditor
          listingTitle={optionName}
          currency={props.currency}
          mode={props.availabilityMode}
          seasons={props.seasons}
          persistLabel={props.persistLabel}
          onClose={() => setAvailability(false)}
          onSave={(mode, seasons) => props.onChange({ stayAvailabilityMode: mode, staySeasons: seasons })}
        />
      ) : null}
    </div>
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

function StayOptionEditor({
  optionName,
  title,
  currency,
  guests,
  bedrooms,
  bathrooms,
  nightly,
  cleaning,
  minNights,
  checkIn,
  checkOut,
  bedMix,
  beds,
  persistLabel,
  onChange,
  onClose,
}: Props & { optionName: string; onClose: () => void }) {
  const [scene, setScene] = useState(0);
  const [draft, setDraft] = useState<OptionDraft>({
    guests,
    bedrooms,
    bathrooms,
    nightly,
    cleaning,
    minNights,
    checkIn,
    checkOut,
    bedMix: { ...bedMix },
  });
  const warning = stayCapacityWarning(Number.parseInt(draft.guests, 10), draft.bedMix, Number.parseInt(beds, 10));

  function commit() {
    const counted = stayBedCount(draft.bedMix);
    onChange({
      stayMaxGuests: draft.guests,
      stayBedrooms: draft.bedrooms,
      stayBathrooms: draft.bathrooms,
      stayNightly: draft.nightly,
      stayCleaningFee: draft.cleaning,
      stayMinNights: draft.minNights,
      stayCheckIn: draft.checkIn,
      stayCheckOut: draft.checkOut,
      stayBedMix: draft.bedMix,
      stayBeds: counted > 0 ? String(counted) : beds,
    });
  }

  return (
    <TourOptionWorkspace
      modeTitle="Edit option"
      optionName={optionName}
      listingTitle={title.trim() || 'Stay'}
      persistLabel={persistLabel}
      continueHint={sceneReady(draft, scene) ? null : 'Finish this section to continue.'}
      continueLabel={scene === SCENES.length - 1 ? 'Save option' : 'Continue'}
      continueDisabled={!sceneReady(draft, scene)}
      navItems={navItems(scene, draft)}
      onSelectNavId={(id) => setScene(Number(id))}
      onBackToOptions={onClose}
      onPreviousScene={scene > 0 ? () => setScene((n) => n - 1) : null}
      onClose={onClose}
      onSaveDraft={commit}
      onContinue={() => {
        if (!sceneReady(draft, scene)) return;
        if (scene < SCENES.length - 1) {
          setScene((n) => n + 1);
          return;
        }
        commit();
        onClose();
      }}
      saveDraftDisabled={false}
    >
      {scene === 0 ? (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-[#111827]">Accommodation details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Maximum guests *" value={draft.guests} onChange={(guests) => setDraft((d) => ({ ...d, guests }))} type="number" min={1} />
            <Field label="Bedrooms" value={draft.bedrooms} onChange={(bedrooms) => setDraft((d) => ({ ...d, bedrooms }))} type="number" min={0} />
            <Field label="Bathrooms" value={draft.bathrooms} onChange={(bathrooms) => setDraft((d) => ({ ...d, bathrooms }))} type="number" min={0} step={0.5} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Sleeping arrangements</p>
            <p className="mt-1 text-xs text-ink-muted">A double, queen, or king sleeps two. A single or sofa bed sleeps one. A bunk sleeps two.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {STAY_BED_KINDS.map((kind) => (
                <Field
                  key={kind.id}
                  label={kind.label}
                  value={draft.bedMix[kind.id] ? String(draft.bedMix[kind.id]) : ''}
                  type="number"
                  min={0}
                  onChange={(raw) => {
                    const n = Number.parseInt(raw, 10);
                    setDraft((d) => {
                      const next = { ...d.bedMix };
                      if (Number.isFinite(n) && n >= 1) next[kind.id] = n;
                      else delete next[kind.id];
                      return { ...d, bedMix: next };
                    });
                  }}
                />
              ))}
            </div>
          </div>
          {warning ? <p className="text-xs leading-relaxed text-ink-muted">{warning}</p> : null}
        </section>
      ) : null}
      {scene === 1 ? (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-[#111827]">Pricing</h3>
          <p className="text-xs text-ink-muted">Amounts are for the whole accommodation, in {currency}. Not per guest.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Base nightly price *" value={draft.nightly} onChange={(nightly) => setDraft((d) => ({ ...d, nightly }))} type="number" min={1} hint={`per night · ${currency}`} />
            <Field label="Cleaning fee" value={draft.cleaning} onChange={(cleaning) => setDraft((d) => ({ ...d, cleaning }))} type="number" min={0} hint="once per stay" />
            <Field label="Minimum nights" value={draft.minNights} onChange={(minNights) => setDraft((d) => ({ ...d, minNights }))} type="number" min={1} />
          </div>
        </section>
      ) : null}
      {scene === 2 ? (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-[#111827]">Arrival</h3>
          <p className="text-xs text-ink-muted">These are times of day. Which nights can be booked is set in availability. The private street address stays on Policies.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Check-in *" value={draft.checkIn} onChange={(checkIn) => setDraft((d) => ({ ...d, checkIn }))} type="time" />
            <Field label="Check-out *" value={draft.checkOut} onChange={(checkOut) => setDraft((d) => ({ ...d, checkOut }))} type="time" />
          </div>
        </section>
      ) : null}
    </TourOptionWorkspace>
  );
}

function StayAvailabilityEditor({
  listingTitle,
  currency,
  mode,
  seasons,
  persistLabel,
  onClose,
  onSave,
}: {
  listingTitle: string;
  currency: string;
  mode: Mode;
  seasons: StaySeasonWindow[];
  persistLabel: string | null;
  onClose: () => void;
  onSave: (mode: Mode, seasons: StaySeasonWindow[]) => void;
}) {
  const [draftMode, setDraftMode] = useState<Mode>(mode);
  const [draftSeasons, setDraftSeasons] = useState<StaySeasonWindow[]>(seasons);
  const [row, setRow] = useState({ name: '', start: '', end: '', nightly: '', minNights: '' });

  function add() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.start) || !/^\d{4}-\d{2}-\d{2}$/.test(row.end) || row.end < row.start) return;
    const nightlyPrice = num(row.nightly);
    const min = Number.parseInt(row.minNights, 10);
    setDraftSeasons((current) => [
      ...current,
      {
        id: `season-${Date.now().toString(36)}`,
        name: row.name.trim().slice(0, 80),
        start: row.start,
        end: row.end,
        enabled: true,
        nightlyPrice: nightlyPrice > 0 ? nightlyPrice : null,
        minNights: Number.isFinite(min) && min >= 1 ? min : null,
      },
    ].slice(0, 24));
    setDraftMode('scheduled');
    setRow({ name: '', start: '', end: '', nightly: '', minNights: '' });
  }

  return (
    <TourOptionWorkspace
      modeTitle="Manage availability"
      optionName={listingTitle}
      listingTitle={listingTitle}
      persistLabel={persistLabel}
      continueHint={null}
      continueLabel="Save availability"
      continueDisabled={false}
      navItems={[{ id: 'periods', label: 'Bookable nights', state: 'current', requirementsMet: true }]}
      onSelectNavId={() => undefined}
      onBackToOptions={onClose}
      onClose={onClose}
      onSaveDraft={() => onSave(draftMode, draftSeasons)}
      onContinue={() => {
        onSave(draftMode, draftSeasons);
        onClose();
      }}
      saveDraftDisabled={false}
    >
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-[#111827]">Bookable nights</h3>
        <p className="text-xs leading-relaxed text-ink-muted">
          A shorter period overrides a longer one on the same night. Checkout uses these prices. External calendars are not connected.
        </p>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-ink">Which nights are open</legend>
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="radio" checked={draftMode === 'open'} onChange={() => setDraftMode('open')} />
            Open unless blocked on Calendar. Periods only change the nightly price.
          </label>
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="radio" checked={draftMode === 'scheduled'} onChange={() => setDraftMode('scheduled')} />
            Only the periods below can be booked.
          </label>
        </fieldset>
        <ul className="space-y-2">
          {draftSeasons.map((season) => (
            <li key={season.id} className="flex items-start justify-between gap-3 border-b border-[#E6EAF0] py-2 text-sm">
              <span>
                <span className="font-semibold text-ink">{season.name || 'Period'}</span>
                <span className="block text-ink-muted">
                  {season.start} – {season.end}
                  {season.nightlyPrice ? ` · ${formatMoney(season.nightlyPrice, currency)} / night` : ' · base price'}
                  {season.minNights ? ` · min ${season.minNights} nights` : ''}
                </span>
              </span>
              <button type="button" className="text-sm font-semibold text-finland" onClick={() => setDraftSeasons((current) => current.filter((item) => item.id !== season.id))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" value={row.name} onChange={(name) => setRow((d) => ({ ...d, name }))} />
          <Field label="Nightly price" value={row.nightly} onChange={(nightly) => setRow((d) => ({ ...d, nightly }))} type="number" min={0} hint="blank uses the base price" />
          <Field label="Start" value={row.start} onChange={(start) => setRow((d) => ({ ...d, start }))} type="date" />
          <Field label="End" value={row.end} onChange={(end) => setRow((d) => ({ ...d, end }))} type="date" />
          <Field label="Minimum nights" value={row.minNights} onChange={(minNights) => setRow((d) => ({ ...d, minNights }))} type="number" min={1} />
        </div>
        <button type="button" className="tv-btn-secondary !min-h-10 !px-4" onClick={add}>
          Add period
        </button>
      </section>
    </TourOptionWorkspace>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  min,
  step,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: number;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-ink">
      {label}
      {hint ? <span className="mt-0.5 block text-xs font-normal text-ink-muted">{hint}</span> : null}
      <input className="tv-input mt-1 w-full font-normal" type={type} min={min} step={step} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
