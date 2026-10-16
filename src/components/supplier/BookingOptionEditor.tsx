import type {
  ListingBookingOption,
  ListingPriceCategory,
  ListingPriceCategoryKind,
} from '../../types/listingExtras';
import {
  type BookingOptionDurationUnit,
  formatBookingOptionDuration,
  parseBookingOptionDuration,
  TOUR_OPTION_INFO_MAX,
} from '../../types/listingExtras';
import {
  createPriceCategory,
  defaultAgeDependentCategories,
  formatPriceCategoryAgeRange,
  PRICE_CATEGORY_KIND_PRESETS,
} from '../../lib/price-categories';
import type { KeyboardEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { TraverionSingleDateField } from '../calendar/TraverionSingleDateField';
import PartnerSelect from './PartnerSelect';
import AvailabilityCutoffField from './AvailabilityCutoffField';
import {
  LISTING_CAPACITY_MAX,
  maxWholeGroupsForSlot,
  sanitizeWeekdayStartTimes,
  scheduleHasFixedDepartures,
  scheduleTimesOnWeekday,
  syncScheduleDeparturesFromWeekdayTimes,
} from '../../lib/listing-option-schedules';
import { localYmd } from '../../lib/local-ymd';
import { SchedulePricingEditor } from './listing-creation/SchedulePricingEditor';
import PickupAreaFields from './PickupAreaFields';
import PickupLocationSearch from '../checkout/PickupLocationSearch';
import { pickupFulfillmentPatch, type VerifiedDestination } from '../../lib/destination-place';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function editorWeekdayStartTimes(option: ListingBookingOption): string[][] {
  if (option.weekdayStartTimes) {
    // Keep saved order while editing — don't re-sort on every render.
    return sanitizeWeekdayStartTimes(option.weekdayStartTimes, { sort: false });
  }
  return WEEKDAY_LABELS.map((_, i) => scheduleTimesOnWeekday(option, i, option.startMode));
}

export type BookingOptionEditorSection =
  | 'setup'
  | 'meeting'
  | 'pricing'
  | 'schedule'
  | 'availability'
  | 'booking_window'
  | 'capacity'
  /** Schedule wizard Capacity step (booking size / groups). */
  | 'schedule_capacity'
  /** Schedule wizard Pricing step (gross/net prices). */
  | 'schedule_pricing';

type Props = {
  option: ListingBookingOption;
  currencyLabel: string;
  hasEndingDate: boolean;
  onHasEndingDateChange: (on: boolean) => void;
  onChange: (patch: Partial<ListingBookingOption>) => void;
  activeSection?: BookingOptionEditorSection;
  attempted?: boolean;
  /** Listing-scoped timezone edited from Booking settings (shared across options). */
  listingDepartureTimezone?: string;
  onListingDepartureTimezoneChange?: (timezone: string) => void;
  /** Listing default cutoff hours (0 = until departure). Shown when option inherits. */
  listingCutoffHours?: number;
  timezoneAutoDetected?: boolean;
  timezoneDetectedLabel?: string | null;
  /** Verified Basics destination. Used to prefill a new pickup center. Not a meeting point. */
  tourDestination?: VerifiedDestination | null;
  /**
   * Cap for max guests on this editor (e.g. option max when editing a schedule).
   * Defaults to LISTING_CAPACITY_MAX.
   */
  guestsCeiling?: number;
  /** Cap for max spots / groups per start time. Defaults to LISTING_CAPACITY_MAX. */
  spotsCeiling?: number;
  /** Currency formatter for schedule pricing earnings preview. */
  formatAmount?: (n: number) => string;
};

/** Allow clearing number fields while typing; empty stores as 0 until filled. */
function parseOptionalCapacity(raw: string, ceiling: number): number {
  if (raw.trim() === '') return 0;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.min(ceiling, Math.max(0, n));
}

function patchCategory(
  cats: ListingPriceCategory[],
  id: string,
  patch: Partial<ListingPriceCategory>
): ListingPriceCategory[] {
  return cats.map((c) => (c.id === id ? { ...c, ...patch } : c));
}

function Section({
  kicker,
  title,
  support,
  children,
  /** Guided option scenes: no nested card / duplicate heading — scene frame owns the title. */
  flat = false,
}: {
  kicker: string;
  title: string;
  support?: string;
  children: ReactNode;
  flat?: boolean;
}) {
  if (flat) {
    return <div className="space-y-3.5">{children}</div>;
  }
  return (
    <section className="lc-section space-y-5 rounded-2xl px-5 py-5 sm:px-6 sm:py-6">
      <div className="max-w-xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{kicker}</p>
        <h3 className="mt-1.5 font-display text-xl font-bold tracking-tight text-ink">{title}</h3>
        {support ? <p className="mt-2 text-sm leading-relaxed text-ink-muted">{support}</p> : null}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function ChoiceCard({
  selected,
  title,
  hint,
  onClick,
}: {
  selected: boolean;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`lc-choice flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left ${
        selected ? 'lc-choice--selected' : ''
      }`}
    >
      <span
        className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? 'border-finland bg-finland' : 'border-black/25 bg-paper'
        }`}
        aria-hidden
      >
        {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-ink">{title}</span>
        {hint ? <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-muted">{hint}</span> : null}
      </span>
    </button>
  );
}

const DEPARTURE_TIMEZONE_OPTIONS = [
  { value: 'Europe/Helsinki', label: 'Europe/Helsinki (Finland — default)' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'Europe/Paris', label: 'Europe/Paris' },
  { value: 'Europe/Stockholm', label: 'Europe/Stockholm' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland' },
  { value: 'UTC', label: 'UTC' },
];

export default function BookingOptionEditor({
  option,
  currencyLabel,
  hasEndingDate,
  onHasEndingDateChange,
  onChange,
  activeSection,
  attempted = false,
  listingDepartureTimezone,
  onListingDepartureTimezoneChange,
  listingCutoffHours = 0,
  timezoneAutoDetected = false,
  timezoneDetectedLabel = null,
  tourDestination = null,
  guestsCeiling: guestsCeilingProp,
  spotsCeiling: spotsCeilingProp,
  formatAmount,
}: Props) {
  const pricingMode = option.pricingMode === 'age_dependent' ? 'age_dependent' : 'uniform';
  const categories = option.priceCategories ?? [];
  const durParts = parseBookingOptionDuration(option.duration);
  const groupPricing =
    option.chargeModel === 'flat_group' ||
    Boolean(option.isPrivate && option.privatePricing === 'flat_group');
  const chargeModelChosen =
    option.chargeModel === 'per_person' || option.chargeModel === 'flat_group';
  const startModeChosen = option.startMode === 'fixed' || option.startMode === 'flexible';
  const guestsCeiling = Math.min(
    LISTING_CAPACITY_MAX,
    typeof guestsCeilingProp === 'number' && guestsCeilingProp >= 1
      ? Math.floor(guestsCeilingProp)
      : LISTING_CAPACITY_MAX
  );
  const spotsCeiling = Math.min(
    LISTING_CAPACITY_MAX,
    typeof spotsCeilingProp === 'number' && spotsCeilingProp >= 1
      ? Math.floor(spotsCeilingProp)
      : LISTING_CAPACITY_MAX
  );
  const scheduleCapacityStep = activeSection === 'schedule_capacity';
  const schedulePricingStep = activeSection === 'schedule_pricing';

  const setPricingMode = (mode: 'uniform' | 'age_dependent') => {
    if (mode === 'age_dependent') {
      const seed =
        categories.length > 0
          ? categories
          : defaultAgeDependentCategories(option.priceUsd > 0 ? option.priceUsd : 0, 0);
      onChange({ pricingMode: 'age_dependent', priceCategories: seed });
      return;
    }
    onChange({ pricingMode: 'uniform' });
  };

  const setChargeModel = (model: 'per_person' | 'flat_group') => {
    if (model === 'flat_group') {
      onChange({
        chargeModel: 'flat_group',
        isPrivate: true,
        privatePricing: 'flat_group',
        privateGroupPriceUsd: option.privateGroupPriceUsd || option.priceUsd || 0,
      });
      return;
    }
    onChange({
      chargeModel: 'per_person',
      ...(option.chargeModel === 'flat_group'
        ? { isPrivate: false, privatePricing: undefined, privateGroupPriceUsd: undefined }
        : option.isPrivate
          ? { privatePricing: 'per_person' as const }
          : {}),
    });
  };

  const addCategory = (kind: ListingPriceCategoryKind) => {
    const preset = PRICE_CATEGORY_KIND_PRESETS.find((p) => p.kind === kind);
    const next = createPriceCategory({
      kind,
      label: preset?.label ?? 'Participant',
      ageMin: preset?.ageMin ?? null,
      ageMax: preset?.ageMax ?? null,
      priceUsd: 0,
      requiresAdult: kind === 'child' || kind === 'infant',
    });
    onChange({
      pricingMode: 'age_dependent',
      priceCategories: [...categories, next].slice(0, 8),
    });
  };

  const removeCategory = (id: string) => {
    onChange({ priceCategories: categories.filter((c) => c.id !== id) });
  };

  const scheduleBased = Array.isArray(option.schedules);
  const showSetup = !activeSection || activeSection === 'setup';
  const showMeeting = !activeSection || activeSection === 'meeting';
  // Schedule Pricing step uses SchedulePricingEditor; option Pricing keeps charge model picker.
  const showPricing =
    !activeSection || activeSection === 'pricing' || schedulePricingStep;
  const showChargeModelPicker = !activeSection || activeSection === 'pricing';
  const showFlatPriceAmounts =
    !schedulePricingStep &&
    ((!activeSection || activeSection === 'pricing') && !scheduleBased);
  const showSchedulePricingEditor = schedulePricingStep;
  const showPricingScheduleNote = Boolean(activeSection === 'pricing' && scheduleBased);
  const showAvailability =
    !activeSection || activeSection === 'schedule' || activeSection === 'availability';
  const showBookingWindow = !activeSection || activeSection === 'booking_window';
  /** Option Pricing (schedule-based): slot capacity only. Schedule Capacity: booking size (+ groups). */
  const showOptionSlotCapacity = Boolean(scheduleBased && activeSection === 'pricing');
  const showScheduleBookingCapacity = scheduleCapacityStep;
  const showLegacyCapacity =
    !scheduleBased &&
    (!activeSection ||
      activeSection === 'schedule' ||
      activeSection === 'capacity' ||
      activeSection === 'pricing');
  const showCapacity = showOptionSlotCapacity || showScheduleBookingCapacity || showLegacyCapacity;
  const moneyFormat =
    formatAmount ??
    ((n: number) =>
      Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—');
  const optionSlotCapacity =
    spotsCeiling < LISTING_CAPACITY_MAX
      ? spotsCeiling
      : option.maxSpotsPerSlot >= 1
        ? option.maxSpotsPerSlot
        : 0;
  const maxGroupsAllowed =
    groupPricing && optionSlotCapacity >= 1 && option.maxPersons >= 1
      ? maxWholeGroupsForSlot(optionSlotCapacity, option.maxPersons)
      : 0;

  const nameInvalid = attempted && !option.name.trim();
  const infoInvalid = attempted && option.optionInfo.trim().length < 3;
  const startInstructionsInvalid =
    attempted && (option.travelerStartInstructions ?? '').trim().length < 8;
  const startInvalid =
    attempted &&
    option.startMode !== 'flexible' &&
    !scheduleHasFixedDepartures(option, option.startMode);
  const guided = Boolean(activeSection);
  const timesFromOption = editorWeekdayStartTimes(option);
  /** Local draft so typing a time never remounts / re-sorts under the caret. */
  const [draftTimes, setDraftTimes] = useState<string[][] | null>(null);
  const weekdayTimes = draftTimes ?? timesFromOption;
  const focusTimeRef = useRef<{ day: number; index: number } | null>(null);
  const timesBoardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraftTimes(null);
  }, [option.id, option.startMode]);

  useEffect(() => {
    const target = focusTimeRef.current;
    if (!target || !timesBoardRef.current) return;
    focusTimeRef.current = null;
    const input = timesBoardRef.current.querySelector<HTMLInputElement>(
      `input[data-day="${target.day}"][data-time-index="${target.index}"]`
    );
    if (!input) return;
    requestAnimationFrame(() => {
      input.focus();
      try {
        input.showPicker?.();
      } catch {
        /* showPicker can reject when not from a direct user gesture */
      }
    });
  }, [weekdayTimes]);

  const commitWeekdayTimes = (nextTimes: string[][], opts?: { sort?: boolean }) => {
    const sort = opts?.sort !== false;
    const synced = syncScheduleDeparturesFromWeekdayTimes(nextTimes, { sort });
    setDraftTimes(sanitizeWeekdayStartTimes(synced.weekdayStartTimes, { sort: false }));
    onChange(synced);
  };

  const setDayTimeAt = (di: number, timeIndex: number, value: string) => {
    // Ignore empty clears from Esc / browser cancel — only the remove button drops a time.
    if (!value.trim()) return;
    const next = weekdayTimes.map((day) => [...day]);
    next[di][timeIndex] = value;
    setDraftTimes(next);
    // Live write without sorting so the focused row stays put.
    onChange(syncScheduleDeparturesFromWeekdayTimes(next, { sort: false }));
  };

  const settleDayTimes = (di: number) => {
    const next = weekdayTimes.map((day) => [...day]);
    next[di] = sanitizeWeekdayStartTimes(next, { sort: true })[di];
    commitWeekdayTimes(next, { sort: true });
  };

  const addDayTime = (di: number) => {
    const next = weekdayTimes.map((day) => [...day]);
    const last = next[di][next[di].length - 1] || '09:00';
    const [hRaw, mRaw] = last.split(':');
    let hour = Number(hRaw);
    const minute = Number(mRaw);
    if (!Number.isFinite(hour)) hour = 9;
    const minuteStr = String(Number.isFinite(minute) ? minute : 0).padStart(2, '0');
    let candidate = '';
    for (let step = 1; step <= 24; step++) {
      const h = (hour + step) % 24;
      candidate = `${String(h).padStart(2, '0')}:${minuteStr}`;
      if (!next[di].includes(candidate)) break;
    }
    const added = candidate || '10:00';
    next[di] = [...next[di], added];
    focusTimeRef.current = { day: di, index: next[di].length - 1 };
    commitWeekdayTimes(next, { sort: false });
  };

  const removeDayTime = (di: number, timeIndex: number) => {
    const next = weekdayTimes.map((day) => [...day]);
    next[di] = next[di].filter((_, i) => i !== timeIndex);
    commitWeekdayTimes(next, { sort: true });
  };

  const applyTimesToAllDays = (fromDi: number) => {
    const source = weekdayTimes[fromDi];
    if (source.length === 0) return;
    commitWeekdayTimes(
      WEEKDAY_LABELS.map(() => [...source]),
      { sort: true }
    );
  };

  const guardTimeInputEscape = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.blur();
  };

  const openTimePicker = (input: HTMLInputElement) => {
    input.focus();
    try {
      input.showPicker?.();
    } catch {
      /* Some browsers only allow showPicker from a direct user gesture / WebKit path. */
    }
  };

  return (
    <div
      className={`grid grid-cols-1 ${
        guided ? 'gap-5' : 'gap-6 p-4 sm:p-5 lg:grid-cols-2 lg:gap-8'
      }`}
    >
      {showSetup ? (
        <>
          <Section
            flat={guided}
            kicker="Option identity"
            title="What travelers choose"
            support="A category of this tour travelers pick — e.g. Small group or Bus."
          >
            <div id="supplier-listing-field-option-name" className="space-y-1.5">
              <label htmlFor="booking-option-name" className="block text-[13px] font-semibold text-ink">
                Option name *
              </label>
              <input
                id="booking-option-name"
                type="text"
                value={option.name}
                onChange={(e) => onChange({ name: e.target.value })}
                className="tv-input"
                placeholder="e.g. Small group"
                aria-invalid={nameInvalid || undefined}
              />
            </div>
            <div id="supplier-listing-field-pickup" className="space-y-1.5">
              <label htmlFor="booking-option-info" className="block text-[13px] font-semibold text-ink">
                Why choose this option *
              </label>
              <textarea
                id="booking-option-info"
                value={option.optionInfo}
                maxLength={TOUR_OPTION_INFO_MAX}
                onChange={(e) =>
                  onChange({ optionInfo: e.target.value.slice(0, TOUR_OPTION_INFO_MAX) })
                }
                rows={2}
                className="tv-input min-h-[4.25rem] resize-y text-[15px]"
                placeholder="e.g. Hotel pickup included · English guide · max 8 guests"
                aria-invalid={infoInvalid || undefined}
              />
              <p className="text-right text-[11px] tabular-nums text-ink-faint">
                {option.optionInfo.length}/{TOUR_OPTION_INFO_MAX}
              </p>
            </div>
            <div id="supplier-listing-field-option-duration" className="space-y-1.5">
              <label className="block text-[13px] font-semibold text-ink">Duration *</label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-2.5">
                <div className="min-w-0 flex-1">
                  <label htmlFor="booking-option-duration-amount" className="sr-only">
                    Duration amount
                  </label>
                  <input
                    id="booking-option-duration-amount"
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={durParts.amount}
                    onChange={(e) => {
                      onChange({
                        duration: formatBookingOptionDuration(e.target.value, durParts.unit),
                      });
                    }}
                    className="tv-input"
                    placeholder="e.g. 5"
                  />
                </div>
                <div className="w-full shrink-0 sm:w-40">
                  <label htmlFor="booking-option-duration-unit" className="sr-only">
                    Duration unit
                  </label>
                  <PartnerSelect
                    id="booking-option-duration-unit"
                    value={durParts.unit}
                    aria-label="Duration unit"
                    onChange={(u) => {
                      onChange({
                        duration: formatBookingOptionDuration(
                          durParts.amount,
                          u as BookingOptionDurationUnit
                        ),
                      });
                    }}
                    options={[
                      { value: 'minutes', label: 'Minutes' },
                      { value: 'hours', label: 'Hours' },
                      { value: 'days', label: 'Days' },
                    ]}
                  />
                </div>
              </div>
            </div>
            <div id="supplier-listing-field-option-start-mode" className="space-y-2">
              <p className="text-[13px] font-semibold text-ink">Start time style *</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Start time style">
                <ChoiceCard
                  selected={option.startMode === 'fixed'}
                  title="Fixed start time"
                  hint="Each schedule has a clock departure."
                  onClick={() => onChange({ startMode: 'fixed' })}
                />
                <ChoiceCard
                  selected={option.startMode === 'flexible'}
                  title="Flexible hours"
                  hint="Operating days without a fixed clock time."
                  onClick={() => onChange({ startMode: 'flexible' })}
                />
              </div>
              {attempted && !startModeChosen ? (
                <p className="text-[12px] text-red-600" role="alert">
                  Choose fixed start time or flexible operating hours.
                </p>
              ) : null}
            </div>
          </Section>
        </>
      ) : null}

      {showMeeting ? (
        <Section
          flat={guided}
          kicker="Fulfillment"
          title="How travelers start this option"
          support="Choose one. Only the fields for that start apply."
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ChoiceCard
              selected={option.fulfillment === 'meeting_point'}
              title="Meeting point"
              hint="Guests arrive at a specified location."
              onClick={() => onChange({ fulfillment: 'meeting_point' })}
            />
            <ChoiceCard
              selected={option.fulfillment === 'pickup'}
              title="Pickup included"
              hint="Guests are collected from an eligible area."
              onClick={() => onChange(pickupFulfillmentPatch(option, tourDestination))}
            />
          </div>
          {option.fulfillment || option.pickupPlace.trim() ? (
            <div id="supplier-listing-field-meeting" className="space-y-5">
              <PickupAreaFields option={option} destination={tourDestination} onChange={onChange} />
              {option.fulfillment === 'pickup' ? (
                <div className="space-y-2">
                  <p className="text-[13px] font-semibold text-ink">Pickup timing</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <ChoiceCard
                      selected={option.pickupTiming === 'at_start'}
                      title="At activity start time"
                      hint="Collected at the scheduled departure."
                      onClick={() =>
                        onChange({ pickupTiming: 'at_start', pickupWindowMinutes: undefined, pickupTimeConfirmation: undefined })
                      }
                    />
                    <ChoiceCard
                      selected={option.pickupTiming === 'before_start'}
                      title="Before activity starts"
                      hint="A window before departure, not an exact time."
                      onClick={() => onChange({ pickupTiming: 'before_start' })}
                    />
                  </div>
                  {option.pickupTiming === 'before_start' ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5">
                        <span className="block text-[13px] font-semibold text-ink">Window before departure</span>
                        <select
                          className="tv-input text-[15px]"
                          value={option.pickupWindowMinutes ?? ''}
                          onChange={(e) =>
                            onChange({ pickupWindowMinutes: e.target.value ? Number(e.target.value) : undefined })
                          }
                        >
                          <option value="">Choose</option>
                          {[15, 30, 45, 60, 90, 120].map((minutes) => (
                            <option key={minutes} value={minutes}>
                              {minutes} minutes
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="space-y-1.5">
                        <p className="text-[13px] font-semibold text-ink">Exact time confirmed</p>
                        <div className="grid grid-cols-1 gap-2">
                          <ChoiceCard
                            selected={option.pickupTimeConfirmation === 'at_booking'}
                            title="At booking confirmation"
                            hint=""
                            onClick={() => onChange({ pickupTimeConfirmation: 'at_booking' })}
                          />
                          <ChoiceCard
                            selected={option.pickupTimeConfirmation === 'day_before'}
                            title="Day before the activity"
                            hint=""
                            onClick={() => onChange({ pickupTimeConfirmation: 'day_before' })}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="space-y-2">
                <p className="text-[13px] font-semibold text-ink">Drop-off</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <ChoiceCard
                    selected={option.dropoffMode === 'same'}
                    title="Same location"
                    hint="Where the guest started."
                    onClick={() =>
                      onChange({
                        dropoffMode: 'same',
                        dropoffPlace: undefined,
                        dropoffPlaceId: undefined,
                        dropoffLat: undefined,
                        dropoffLng: undefined,
                      })
                    }
                  />
                  <ChoiceCard
                    selected={option.dropoffMode === 'different'}
                    title="Different location"
                    hint="A verified address."
                    onClick={() => onChange({ dropoffMode: 'different' })}
                  />
                  <ChoiceCard
                    selected={option.dropoffMode === 'none'}
                    title="No drop-off"
                    hint="Guests arrange their own way back."
                    onClick={() =>
                      onChange({
                        dropoffMode: 'none',
                        dropoffPlace: undefined,
                        dropoffPlaceId: undefined,
                        dropoffLat: undefined,
                        dropoffLng: undefined,
                      })
                    }
                  />
                </div>
                {option.dropoffMode === 'different' ? (
                  <PickupLocationSearch
                    id="supplier-dropoff-search"
                    label="Drop-off location"
                    placeholder="Search the drop-off address"
                    selected={
                      option.dropoffPlaceId && option.dropoffLat != null && option.dropoffLng != null
                        ? {
                            placeId: option.dropoffPlaceId,
                            formattedAddress: option.dropoffPlace ?? '',
                            name: option.dropoffPlace ?? '',
                            lat: option.dropoffLat,
                            lng: option.dropoffLng,
                          }
                        : null
                    }
                    onSelect={(place) =>
                      onChange(
                        place
                          ? {
                              dropoffPlace: place.formattedAddress,
                              dropoffPlaceId: place.placeId,
                              dropoffLat: place.lat,
                              dropoffLng: place.lng,
                            }
                          : {
                              dropoffPlace: undefined,
                              dropoffPlaceId: undefined,
                              dropoffLat: undefined,
                              dropoffLng: undefined,
                            }
                      )
                    }
                  />
                ) : null}
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                  <input
                    type="checkbox"
                    checked={option.transportIncluded === true}
                    onChange={(e) =>
                      onChange(
                        e.target.checked
                          ? { transportIncluded: true }
                          : { transportIncluded: undefined, transportMode: undefined }
                      )
                    }
                  />
                  Transportation is included
                </label>
                {option.transportIncluded ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(
                      [
                        ['car', 'Car'],
                        ['minivan', 'Minivan'],
                        ['bus', 'Bus / coach'],
                        ['other', 'Other'],
                      ] as const
                    ).map(([mode, label]) => (
                      <ChoiceCard
                        key={mode}
                        selected={option.transportMode === mode}
                        title={label}
                        hint=""
                        onClick={() => onChange({ transportMode: mode, transportIncluded: true })}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="booking-option-start-instructions"
                  className="block text-[13px] font-semibold text-ink"
                >
                  {option.fulfillment === 'pickup' ? 'Traveler pickup instructions *' : 'Traveler meeting instructions *'}
                </label>
                <textarea
                  id="booking-option-start-instructions"
                  value={option.travelerStartInstructions ?? ''}
                  onChange={(e) => onChange({ travelerStartInstructions: e.target.value })}
                  rows={2}
                  className="tv-input text-[15px]"
                  placeholder={
                    option.fulfillment === 'pickup'
                      ? 'e.g. Wait outside the main entrance 10 minutes before pickup.'
                      : 'e.g. Meet your guide outside the main entrance; arrive 15 minutes early.'
                  }
                  aria-invalid={startInstructionsInvalid || undefined}
                />
              </div>
            </div>
          ) : (
            <div id="supplier-listing-field-meeting" />
          )}
        </Section>
      ) : null}

      {showPricing ? (
        <Section
          flat={guided}
          kicker="Pricing"
          title={
            showChargeModelPicker
              ? 'How do you charge for this option?'
              : groupPricing
                ? 'Whole-group price'
                : 'Per-person price'
          }
          support={
            showChargeModelPicker && !showPricingScheduleNote
              ? 'Per-person prices can include Adult and Child. A whole-group price covers the entire party.'
              : groupPricing && schedulePricingStep
                ? 'One price for the entire party on this schedule.'
                : schedulePricingStep
                  ? undefined
                  : undefined
          }
        >
          {showSchedulePricingEditor ? (
            <SchedulePricingEditor
              option={option}
              currencyLabel={currencyLabel}
              formatAmount={moneyFormat}
              onChange={onChange}
              groupPricing={groupPricing}
            />
          ) : null}
          {showChargeModelPicker ? (
            <div
              id="supplier-listing-field-option-charge-model"
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              role="radiogroup"
              aria-label="Pricing model"
            >
              <ChoiceCard
                selected={chargeModelChosen && !groupPricing}
                title="Per person"
                hint="Each traveler pays."
                onClick={() => setChargeModel('per_person')}
              />
              <ChoiceCard
                selected={chargeModelChosen && groupPricing}
                title="Whole group"
                hint="One price covers the party."
                onClick={() => setChargeModel('flat_group')}
              />
            </div>
          ) : showSchedulePricingEditor ? null : (
            <p className="text-[13px] font-medium text-ink">
              {groupPricing ? 'Charged as a whole group' : 'Charged per person'}
            </p>
          )}
          {showChargeModelPicker && attempted && !chargeModelChosen ? (
            <p className="text-[12px] text-red-600" role="alert">
              Choose per person or per group.
            </p>
          ) : null}

          {showFlatPriceAmounts ? (
            groupPricing ? (
            <div id="supplier-listing-field-price">
              <label htmlFor="booking-option-group-price" className="mb-1 block text-sm font-semibold text-ink">
                Price for the whole group ({currencyLabel}) *
              </label>
              <input
                id="booking-option-group-price"
                type="number"
                min={0}
                step={1}
                value={option.privateGroupPriceUsd || ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw.trim() === '') {
                    onChange({ privateGroupPriceUsd: 0, priceUsd: 0 });
                    return;
                  }
                  const n = Math.max(0, Number(raw) || 0);
                  onChange({ privateGroupPriceUsd: n, priceUsd: n });
                }}
                className="tv-input w-full max-w-xs"
              />
              <p className="mt-1.5 text-[12px] text-ink-muted">
                One price for the entire party — set group size and slot capacity below.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    {
                      value: 'uniform' as const,
                      title: 'Same price for everyone',
                      hint: 'One per-person price',
                    },
                    {
                      value: 'age_dependent' as const,
                      title: 'Price depends on age',
                      hint: 'Adult, Child, Infant…',
                    },
                  ] as const
                ).map((row) => {
                  const selected = pricingMode === row.value;
                  return (
                    <button
                      key={row.value}
                      type="button"
                      onClick={() => setPricingMode(row.value)}
                      className={`lc-choice rounded-xl px-4 py-3 text-left ${selected ? 'lc-choice--selected' : ''}`}
                      aria-pressed={selected}
                    >
                      <span className="block text-sm font-semibold text-ink">{row.title}</span>
                      <span className="mt-0.5 block text-xs text-ink-muted">{row.hint}</span>
                    </button>
                  );
                })}
              </div>

              {pricingMode === 'uniform' ? (
                <div id="supplier-listing-field-price">
                  <label htmlFor="booking-option-unit-price" className="mb-1 block text-sm font-semibold text-ink">
                    Price per person ({currencyLabel}) *
                  </label>
                  <input
                    id="booking-option-unit-price"
                    type="number"
                    min={0}
                    step={1}
                    value={option.priceUsd || ''}
                    onChange={(e) => onChange({ priceUsd: Math.max(0, Number(e.target.value) || 0) })}
                    className="tv-input w-full max-w-xs"
                  />
                </div>
              ) : (
                <div className="space-y-3" id="supplier-listing-field-price">
                  <ul className="divide-y divide-black/[0.06] overflow-hidden rounded-xl bg-paper-raised ring-1 ring-black/[0.06]">
                    {categories.map((c) => (
                      <li key={c.id} className="space-y-3 p-3 sm:p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div>
                              <label htmlFor={`booking-option-cat-label-${c.id}`} className="mb-1 block text-xs font-medium text-ink-muted">
                                Category
                              </label>
                              <input
                                id={`booking-option-cat-label-${c.id}`}
                                type="text"
                                value={c.label}
                                onChange={(e) =>
                                  onChange({
                                    priceCategories: patchCategory(categories, c.id, {
                                      label: e.target.value,
                                    }),
                                  })
                                }
                                className="tv-input"
                              />
                            </div>
                            <div>
                              <label htmlFor={`booking-option-cat-price-${c.id}`} className="mb-1 block text-xs font-medium text-ink-muted">
                                Price ({currencyLabel})
                              </label>
                              <input
                                id={`booking-option-cat-price-${c.id}`}
                                type="number"
                                min={0}
                                step={1}
                                value={c.priceUsd || ''}
                                onChange={(e) =>
                                  onChange({
                                    priceCategories: patchCategory(categories, c.id, {
                                      priceUsd: Math.max(0, Number(e.target.value) || 0),
                                    }),
                                  })
                                }
                                className="tv-input"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeCategory(c.id)}
                            className="lc-btn-danger inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium"
                            aria-label={`Remove ${c.label || 'category'}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            Remove
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
                          <div>
                            <label htmlFor={`booking-option-cat-age-from-${c.id}`} className="mb-1 block text-xs font-medium text-ink-muted">
                              Age from
                            </label>
                            <input
                              id={`booking-option-cat-age-from-${c.id}`}
                              type="number"
                              min={0}
                              max={120}
                              value={c.ageMin ?? ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                onChange({
                                  priceCategories: patchCategory(categories, c.id, {
                                    ageMin: v === '' ? null : Math.max(0, Math.floor(Number(v) || 0)),
                                  }),
                                });
                              }}
                              className="tv-input"
                            />
                          </div>
                          <div>
                            <label htmlFor={`booking-option-cat-age-to-${c.id}`} className="mb-1 block text-xs font-medium text-ink-muted">
                              Age to
                            </label>
                            <input
                              id={`booking-option-cat-age-to-${c.id}`}
                              type="number"
                              min={0}
                              max={120}
                              value={c.ageMax ?? ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                onChange({
                                  priceCategories: patchCategory(categories, c.id, {
                                    ageMax: v === '' ? null : Math.max(0, Math.floor(Number(v) || 0)),
                                  }),
                                });
                              }}
                              className="tv-input"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-ink-muted">
                          {formatPriceCategoryAgeRange(c) || 'Add an age range travelers will see'}
                          {c.requiresAdult ? ' · Needs an adult on the booking' : ''}
                        </p>
                        {(c.kind === 'child' || c.kind === 'infant') && (
                          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
                            <input
                              type="checkbox"
                              checked={Boolean(c.requiresAdult)}
                              onChange={(e) =>
                                onChange({
                                  priceCategories: patchCategory(categories, c.id, {
                                    requiresAdult: e.target.checked,
                                  }),
                                })
                              }
                              className="rounded border-black/20 text-finland focus:ring-finland"
                            />
                            Must be accompanied by an adult
                          </label>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    {PRICE_CATEGORY_KIND_PRESETS.filter(
                      (p) => !categories.some((c) => c.kind === p.kind && c.kind !== 'participant')
                    ).map((p) => (
                      <button
                        key={p.kind}
                        type="button"
                        onClick={() => addCategory(p.kind)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-finland ring-1 ring-finland/25 hover:bg-finland/10"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        Add {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )
          ) : null}
        </Section>
      ) : null}

      {showBookingWindow ? (
        <Section
          flat={guided}
          kicker="Booking window"
          title="When can travelers book?"
          support="Cutoff applies to every schedule on this option."
        >
          <div id="supplier-listing-field-option-cutoff" className="space-y-1.5">
            <AvailabilityCutoffField
              id="option-booking-cutoff"
              label="Booking cutoff"
              allowInherit
              inheritLabel={
                listingCutoffHours > 0
                  ? `Use listing default (${listingCutoffHours} hours before departure)`
                  : 'Use listing default (until departure)'
              }
              className="max-w-md"
              value={
                typeof option.bookingCutoffHoursBeforeStart === 'number' &&
                option.bookingCutoffHoursBeforeStart > 0
                  ? String(option.bookingCutoffHoursBeforeStart)
                  : ''
              }
              onChange={(raw) => {
                if (!raw.trim()) {
                  onChange({ bookingCutoffHoursBeforeStart: undefined });
                  return;
                }
                const n = Math.floor(Number(raw));
                if (!Number.isFinite(n) || n <= 0) {
                  onChange({ bookingCutoffHoursBeforeStart: undefined });
                  return;
                }
                onChange({ bookingCutoffHoursBeforeStart: Math.min(168, n) });
              }}
            />
          </div>
          {onListingDepartureTimezoneChange ? (
            <div id="supplier-listing-field-option-timezone" className="space-y-1.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <label htmlFor="option-departure-timezone" className="block text-[13px] font-semibold text-ink">
                  Departure timezone
                </label>
                {timezoneAutoDetected ? (
                  <span className="text-[11.5px] text-ink-muted">Automatically detected</span>
                ) : (
                  <span className="text-[11.5px] text-ink-muted">Manual</span>
                )}
              </div>
              <p className="text-[12px] leading-snug text-ink-muted">
                Shared by all options
                {timezoneDetectedLabel ? ` · ${timezoneDetectedLabel}` : ''}. Changing this affects
                every schedule on the listing.
              </p>
              <PartnerSelect
                id="option-departure-timezone"
                className="max-w-md"
                value={listingDepartureTimezone || 'Europe/Helsinki'}
                onChange={onListingDepartureTimezoneChange}
                options={DEPARTURE_TIMEZONE_OPTIONS}
              />
            </div>
          ) : null}
        </Section>
      ) : null}

      {showAvailability ? (
        <Section
          flat={guided}
          kicker="Availability"
          title="When is this schedule available?"
          support="Travelers book dates in this window on days that have a start time."
        >
          <div id="supplier-listing-field-option-availability" className="space-y-5">
            <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
              <div>
                <label
                  htmlFor="booking-option-date-from"
                  className="mb-1 block text-[13px] font-semibold text-ink"
                >
                  Starting date
                </label>
                <div className="tv-input !flex !min-h-11 !items-center !px-3 !py-1.5">
                  <TraverionSingleDateField
                    id="booking-option-date-from"
                    label=""
                    value={option.availabilityDateFrom}
                    minIso={localYmd()}
                    placeholder="Select a date"
                    onChange={(iso) => onChange({ availabilityDateFrom: iso })}
                    className="w-full [&_button]:h-8 [&_button]:text-[14px] [&_button]:font-medium"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 touch-manipulation sm:min-h-0 sm:pb-2">
                  <input
                    type="checkbox"
                    checked={hasEndingDate}
                    onChange={(e) => {
                      const on = e.target.checked;
                      onHasEndingDateChange(on);
                      if (!on) onChange({ availabilityDateTo: '' });
                    }}
                    className="h-4 w-4 shrink-0 rounded border-black/35 text-finland focus:ring-finland"
                  />
                  <span className="text-[13px] font-semibold text-ink">Set an ending date</span>
                </label>
                {hasEndingDate ? (
                  <div>
                    <label
                      htmlFor="booking-option-date-to"
                      className="mb-1 block text-[13px] font-semibold text-ink"
                    >
                      Ending date
                    </label>
                    <div className="tv-input !flex !min-h-11 !items-center !px-3 !py-1.5">
                      <TraverionSingleDateField
                        id="booking-option-date-to"
                        label=""
                        value={option.availabilityDateTo}
                        minIso={
                          option.availabilityDateFrom.trim() &&
                          /^\d{4}-\d{2}-\d{2}$/.test(option.availabilityDateFrom)
                            ? option.availabilityDateFrom
                            : localYmd()
                        }
                        placeholder="Select a date"
                        onChange={(iso) => onChange({ availabilityDateTo: iso })}
                        className="w-full [&_button]:h-8 [&_button]:text-[14px] [&_button]:font-medium"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] leading-snug text-ink-muted sm:pb-2">
                    Optional — leave off for ongoing.
                  </p>
                )}
              </div>
            </div>
            {option.startMode === 'flexible' ? (
              <div className="space-y-3">
                <div>
                  <p className="mb-2 text-sm font-semibold text-ink">Operating days *</p>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAY_LABELS.map((label, di) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          const next = [...option.weekdays];
                          next[di] = !next[di];
                          onChange({ weekdays: next });
                        }}
                        className={`lc-choice min-h-[44px] min-w-[2.75rem] rounded-full px-2.5 text-xs font-semibold ${
                          option.weekdays[di] ? 'lc-choice--selected' : ''
                        }`}
                        aria-pressed={option.weekdays[di]}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[12.5px] leading-snug text-ink-muted">
                  Flexible start — no fixed clock times on these days.
                </p>
              </div>
            ) : (
              <div
                ref={timesBoardRef}
                className="space-y-2"
                aria-invalid={startInvalid || undefined}
              >
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">Weekly start times *</p>
                    <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">
                      Click a time field to set it. Empty days stay closed.
                    </p>
                  </div>
                </div>
                <div className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white">
                  {WEEKDAY_LABELS.map((label, di) => {
                    const times = weekdayTimes[di] ?? [];
                    const open = times.length > 0;
                    return (
                      <div
                        key={label}
                        className={`flex flex-col gap-2 border-b border-[#E5E7EB] px-3 py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-3 ${
                          open ? 'bg-white' : 'bg-[#F5F6F8]/70'
                        }`}
                      >
                        <div className="flex w-full shrink-0 items-center justify-between gap-2 sm:w-[4.5rem] sm:block">
                          <p className="text-[13px] font-semibold tabular-nums text-ink">{label}</p>
                          {open ? (
                            <div className="flex items-center gap-2 sm:hidden">
                              <button
                                type="button"
                                onClick={() => applyTimesToAllDays(di)}
                                className="lux-flat text-[11.5px] font-semibold text-finland hover:underline"
                              >
                                All days
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = weekdayTimes.map((day) => [...day]);
                                  next[di] = [];
                                  commitWeekdayTimes(next, { sort: true });
                                }}
                                className="lux-flat text-[11.5px] font-medium text-ink-muted hover:text-ink"
                              >
                                Clear
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                          {times.map((time, ti) => (
                            <div key={`${di}-${ti}`} className="flex items-center gap-0.5">
                              <input
                                type="time"
                                step={60}
                                value={time}
                                data-day={di}
                                data-time-index={ti}
                                onChange={(e) => setDayTimeAt(di, ti, e.target.value)}
                                onBlur={() => settleDayTimes(di)}
                                onKeyDown={guardTimeInputEscape}
                                onClick={(e) => openTimePicker(e.currentTarget)}
                                className="schedule-time-input tv-input !min-h-9 w-[7.25rem] !rounded-lg !py-1.5 text-[13px] font-semibold tabular-nums"
                                aria-label={`${label} start time ${ti + 1}`}
                              />
                              <button
                                type="button"
                                onClick={() => removeDayTime(di, ti)}
                                className="lux-flat inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-black/[0.05] hover:text-ink"
                                aria-label={`Remove ${label} time ${ti + 1}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => addDayTime(di)}
                            className="lux-flat inline-flex min-h-9 items-center gap-1 rounded-md px-1.5 text-[12.5px] font-semibold text-finland hover:bg-finland/[0.06]"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                            {open ? 'Add' : 'Add time'}
                          </button>
                          {!open ? (
                            <span className="text-[12px] text-ink-muted">Closed</span>
                          ) : null}
                        </div>
                        {open ? (
                          <div className="hidden shrink-0 items-center gap-2 sm:flex">
                            <button
                              type="button"
                              onClick={() => applyTimesToAllDays(di)}
                              className="lux-flat text-[12px] font-semibold text-finland hover:underline"
                            >
                              Use on all days
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const next = weekdayTimes.map((day) => [...day]);
                                next[di] = [];
                                commitWeekdayTimes(next, { sort: true });
                              }}
                              className="lux-flat text-[12px] font-medium text-ink-muted hover:text-ink"
                            >
                              Clear
                            </button>
                          </div>
                        ) : (
                          <div className="hidden w-[7.5rem] shrink-0 sm:block" aria-hidden />
                        )}
                      </div>
                    );
                  })}
                </div>
                {startInvalid ? (
                  <p className="text-[12px] font-medium text-ink-muted" role="status">
                    Add at least one start time on a day this schedule should run.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </Section>
      ) : null}

      {showCapacity ? (
        <Section
          flat={guided}
          kicker="Capacity"
          title={
            showOptionSlotCapacity
              ? 'Travelers per start time'
              : showScheduleBookingCapacity
                ? groupPricing
                  ? 'Seats and group size'
                  : 'Seats and booking size'
                : groupPricing
                  ? 'Slot capacity and group size'
                  : 'How many travelers can book?'
          }
          support={
            showOptionSlotCapacity
              ? 'Total travelers this option can take on one departure. Schedules use this as their capacity.'
              : showScheduleBookingCapacity
                ? groupPricing
                  ? 'Seats come from the option. Set group size and how many groups fit per departure.'
                  : 'Seats come from the option. Set minimum and maximum guests for one booking.'
                : groupPricing
                  ? 'Inventory is traveler seats per start time. Group size is how large one booking can be.'
                  : 'Party size for one booking, and traveler seats available at each start time.'
          }
        >
          <div id="supplier-listing-field-group" className="space-y-4">
            {showScheduleBookingCapacity ? (
              <div>
                <p className="mb-1 text-[12.5px] font-semibold text-ink">Seats per departure</p>
                <p className="flex min-h-10 max-w-xs items-center rounded-lg border border-black/[0.08] bg-black/[0.02] px-3 text-[15px] font-semibold tabular-nums text-ink">
                  {optionSlotCapacity >= 1 ? optionSlotCapacity : '—'}
                </p>
                <p className="mt-1.5 text-[12px] leading-snug text-ink-muted">
                  From the option. Modify at{' '}
                  <span className="font-medium text-ink">Pricing → Travelers per start time</span>.
                </p>
              </div>
            ) : null}

            {showOptionSlotCapacity || showLegacyCapacity ? (
              <div>
                <label htmlFor="booking-option-max-spots" className="mb-1 block text-sm font-semibold text-ink">
                  Travelers per start time *
                </label>
                <input
                  id="booking-option-max-spots"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={LISTING_CAPACITY_MAX}
                  value={option.maxSpotsPerSlot > 0 ? option.maxSpotsPerSlot : ''}
                  onChange={(e) => {
                    const nextSpots = parseOptionalCapacity(e.target.value, LISTING_CAPACITY_MAX);
                    onChange({
                      maxSpotsPerSlot: nextSpots,
                      ...(nextSpots > 0 && option.maxPersons > nextSpots
                        ? { maxPersons: nextSpots }
                        : null),
                    });
                  }}
                  className="tv-input w-full max-w-xs"
                />
                <p className="mt-1 text-[12px] text-ink-muted">
                  How many travelers this option can take on one departure.
                </p>
              </div>
            ) : null}

            {showScheduleBookingCapacity || showLegacyCapacity ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="booking-option-min-guests" className="mb-1 block text-sm font-semibold text-ink">
                    {groupPricing ? 'Min group size *' : 'Min guests per booking *'}
                  </label>
                  <input
                    id="booking-option-min-guests"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={guestsCeiling}
                    value={option.minPersons > 0 ? option.minPersons : ''}
                    onChange={(e) => {
                      const effectiveGuestCap = Math.min(
                        guestsCeiling,
                        optionSlotCapacity >= 1 ? optionSlotCapacity : guestsCeiling
                      );
                      const nextMin = parseOptionalCapacity(e.target.value, effectiveGuestCap);
                      onChange({
                        minPersons: nextMin,
                        ...(option.maxPersons > 0 && nextMin > option.maxPersons
                          ? { maxPersons: Math.min(effectiveGuestCap, nextMin) }
                          : null),
                      });
                    }}
                    className="tv-input"
                  />
                </div>
                <div>
                  <label htmlFor="booking-option-max-guests" className="mb-1 block text-sm font-semibold text-ink">
                    {groupPricing ? 'Max group size *' : 'Max guests per booking *'}
                  </label>
                  <input
                    id="booking-option-max-guests"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={Math.min(
                      guestsCeiling,
                      optionSlotCapacity >= 1 ? optionSlotCapacity : guestsCeiling
                    )}
                    value={option.maxPersons > 0 ? option.maxPersons : ''}
                    onChange={(e) => {
                      const effectiveGuestCap = Math.min(
                        guestsCeiling,
                        optionSlotCapacity >= 1 ? optionSlotCapacity : guestsCeiling
                      );
                      const nextMax = parseOptionalCapacity(e.target.value, effectiveGuestCap);
                      const patch: Partial<ListingBookingOption> = { maxPersons: nextMax };
                      if (
                        groupPricing &&
                        showScheduleBookingCapacity &&
                        nextMax >= 1 &&
                        optionSlotCapacity >= 1
                      ) {
                        const allowed = maxWholeGroupsForSlot(optionSlotCapacity, nextMax);
                        const currentGroups =
                          typeof option.maxGroupsPerSlot === 'number' && option.maxGroupsPerSlot >= 1
                            ? option.maxGroupsPerSlot
                            : 1;
                        if (allowed >= 1 && currentGroups > allowed) {
                          patch.maxGroupsPerSlot = allowed;
                        }
                      }
                      onChange(patch);
                    }}
                    className="tv-input"
                  />
                  <p className="mt-1 text-[12px] text-ink-muted">
                    {groupPricing
                      ? `One booking’s party size · max ${Math.min(
                          guestsCeiling,
                          optionSlotCapacity >= 1 ? optionSlotCapacity : guestsCeiling
                        )}.`
                      : guestsCeiling < LISTING_CAPACITY_MAX
                        ? `Cannot exceed the option capacity of ${guestsCeiling}.`
                        : 'Largest party size for one booking.'}
                  </p>
                </div>
              </div>
            ) : null}

            {showScheduleBookingCapacity && groupPricing ? (
              <div>
                <label htmlFor="booking-option-max-groups" className="mb-1 block text-sm font-semibold text-ink">
                  Groups per start time *
                </label>
                <input
                  id="booking-option-max-groups"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={maxGroupsAllowed >= 1 ? maxGroupsAllowed : LISTING_CAPACITY_MAX}
                  value={
                    typeof option.maxGroupsPerSlot === 'number' && option.maxGroupsPerSlot > 0
                      ? option.maxGroupsPerSlot
                      : ''
                  }
                  onChange={(e) => {
                    const ceiling =
                      maxGroupsAllowed >= 1 ? maxGroupsAllowed : LISTING_CAPACITY_MAX;
                    onChange({
                      maxGroupsPerSlot: parseOptionalCapacity(e.target.value, ceiling),
                      ...(optionSlotCapacity >= 1 ? { maxSpotsPerSlot: optionSlotCapacity } : null),
                    });
                  }}
                  disabled={option.maxPersons < 1 || optionSlotCapacity < 1}
                  className="tv-input w-full max-w-xs"
                />
                <p className="mt-1 text-[12px] text-ink-muted">
                  {option.maxPersons >= 1 && optionSlotCapacity >= 1
                    ? maxGroupsAllowed < 1
                      ? 'Max group size cannot exceed option capacity.'
                      : `At max group size ${option.maxPersons}, at most ${maxGroupsAllowed} group${
                          maxGroupsAllowed === 1 ? '' : 's'
                        } fit in ${optionSlotCapacity} traveler seats (${maxGroupsAllowed} × ${
                          option.maxPersons
                        } ≤ ${optionSlotCapacity}).`
                    : 'Set max group size first.'}
                </p>
              </div>
            ) : null}

            {showLegacyCapacity && groupPricing && option.maxSpotsPerSlot >= 1 && option.maxPersons >= 1 ? (
              <p className="rounded-lg border border-black/[0.12] bg-black/[0.02] px-3 py-2 text-[12.5px] leading-snug text-ink">
                At max group size ({option.maxPersons}), up to{' '}
                <span className="font-semibold">
                  {maxWholeGroupsForSlot(option.maxSpotsPerSlot, option.maxPersons)}
                </span>{' '}
                whole group
                {maxWholeGroupsForSlot(option.maxSpotsPerSlot, option.maxPersons) === 1 ? '' : 's'} can
                book the same start time ({option.maxSpotsPerSlot} traveler seats).
              </p>
            ) : null}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
